# Standalone server: browse Eagle libraries without Eagle

Status: **Proposal** (2026-11-13). P0 implemented (2026-11-13); the rest is not.

## 1. Background

The preview server runs as an Eagle plugin and reads everything through Eagle's Web API. Two limits of Eagle come with it:

- **Eagle must be running.** Closing Eagle (or the computer it runs on going to sleep) stops the viewer.
- **One library at a time.** Eagle answers only for the library it has open, so the viewer can show one library, and switching libraries in the viewer switches the library open in Eagle on the host computer.

Third-party mobile apps for Eagle avoid both by reading the library folder directly. The Advanced Sort index (`libraryIndex.cts`, see [large-library-index.md](large-library-index.md)) already reads the same folder (`images/`, `mtime.json`, `metadata.json`) and keeps itself current as Eagle does. This design takes that further: a **read-only** server that browses one or more libraries straight from disk, as a CLI or background service, with or without Eagle.

## 2. Goals and non-goals

Goals:

- Serve one or more libraries without Eagle running, on macOS, Windows, and Linux (including a NAS, in Docker).
- Serve several libraries at once, each viewer choosing which one to browse, without switching anything on the host.
- Keep the viewer, the HTTP API, authentication, library protection, and the access log the same as the plugin's.
- Stay in step with Eagle as it changes (Eagle 5 in particular): find out quickly and loudly when the library format changes.

Non-goals:

- **No writes.** No upload, rating, tag, folder, or trash edits in standalone mode. Eagle keeps its library in memory and writes it back, so a second writer would lose edits or corrupt the library. Write features stay with the plugin.
- No thumbnail generation. Items get the thumbnails Eagle made; an item without one shows the file itself or a type icon, as the viewer does today for `noThumbnail` items.
- Not a replacement for the plugin. The plugin stays the default way to run the server; standalone is a second way to run the same server.

## 3. Overview

```
              ┌──────────────────────────── viewerServer (unchanged API) ────────────────────────────┐
              │ auth · library protection · access log · /api/* · /file/* · static viewer           │
              └───────────────────────────────┬──────────────────────────────────────────────────────┘
                                              │ LibraryBackend (per library)
                     ┌────────────────────────┴────────────────────────┐
           EagleApiBackend (plugin)                         FsBackend (standalone)
           today's eagleClient + Eagle                      library folder on disk
           read + write, one library                        read only, any number of libraries
```

Two entry points share one server:

| | Plugin (today) | Standalone (new) |
| --- | --- | --- |
| Started by | Eagle (`plugin/app.tsx`, service mode) | `eagle-media-server` CLI, launchd/systemd/Windows service, Docker |
| Backend | `EagleApiBackend` | `FsBackend` |
| Libraries | The one open in Eagle (switchable) | All configured, at the same time |
| Writes | Yes (by role) | No |
| Settings | `~/.eagle-media-preview-server/settings.json` | Same file format, path set by `--config` |

## 4. The backend seam

Today `viewerServer.cts` calls `session.client.*` (an `eagleClient`) and `session.libraryInfo()`. That set of calls becomes an interface:

```ts
interface LibraryBackend {
  readonly kind: "eagle-api" | "fs";
  readonly writable: boolean;

  libraryInfo(): Promise<LibraryInfo>;          // name, path, applicationVersion
  appInfo(): Promise<AppInfo | null>;           // null in standalone mode

  folders(): Promise<Folder[]>;
  smartFolders(): Promise<SmartFolder[]>;
  listItems(options: ListItemsOptions): Promise<Page<Item>>;
  searchItems(options: SearchItemsOptions): Promise<Page<Item>>;
  smartFolderItems(options: SmartFolderItemsOptions): Promise<Page<Item>>;
  itemsByIds(ids: string[]): Promise<Item[]>;
  sortIndexItems(ids: string[]): Promise<Item[]>;
  itemExtensions(options: ItemExtensionsOptions): Promise<ExtensionCount[]>;
  listTags(options: ListTagsOptions): Promise<Page<Tag>>;
  tagOverview(): Promise<TagOverview>;
  tagCoverItem(tag: string): Promise<Item | null>;
  resolveItemFile(item: Item, kind: "file" | "thumb"): Promise<string | null>;

  // Present only when writable.
  write?: {
    addItemFromPath(input: AddItemFromPathInput): Promise<unknown>;
    updateItemStar(id: string, star: unknown): Promise<unknown>;
    updateItemMetadata(id: string, input: UpdateMetadataInput): Promise<unknown>;
    updateItemTrash(id: string, isDeleted: boolean): Promise<unknown>;
  };

  dispose(): Promise<void>;
}
```

- The method set is exactly what `viewerServer.cts` calls today, so `EagleApiBackend` wraps `createEagleClient` and `createConnectionContext` with no change in behavior.
- Write routes check `backend.write`. Without it they answer `403` with a `read_only` code, before reading the request body (P0). `/api/auth/status`, `/api/connect`, and `/api/health` will also report `permissions` without the write roles, so the viewer hides the edit and upload buttons as it does for Viewer users today (P1).
- `appInfo()` returning `null` tells the viewer that no Eagle is behind the server. Nothing else in the viewer depends on Eagle being there.

## 5. FsBackend: reading the library folder

### 5.1 Files read

Checked against Eagle 4.0 (`applicationVersion: "4.0.0"`, the ICON test library):

| File | Holds | Used for |
| --- | --- | --- |
| `<library>/metadata.json` | `folders`, `smartFolders`, `quickAccess`, `tagsGroups`, `modificationTime`, `applicationVersion` | Folders, smart folders, tag groups, format check |
| `<library>/tags.json` | `historyTags`, `starredTags` | Starred tags; the tag list itself comes from items |
| `<library>/mtime.json` | `{ <id>: <change time>, ..., all: <count> }` | Change detection (as `libraryIndex.cts` does today) |
| `<library>/images/<id>.info/metadata.json` | `id`, `name`, `ext`, `size`, `width`, `height`, `btime`, `mtime`, `modificationTime`, `lastModified`, `tags`, `folders`, `isDeleted`, `url`, `annotation`, `palettes`, and when set `star`, `duration`, `noThumbnail` | Every item field the viewer shows |
| `<library>/images/<id>.info/<name>.<ext>` | The file | `/file/<id>`, `/api/items/<id>/file` |
| `<library>/images/<id>.info/<name>_thumbnail.png` | The thumbnail, when Eagle made one | `/api/items/<id>/thumb` |

Never read: `backup/`, `saved-filters.json`, and Eagle's own cache under its user data folder (`library-caches/*.txt`). The cache is Eagle-internal, keyed by a hash of the library path, and can change in any release.

### 5.2 The item store

`libraryIndex.cts` becomes the core of `FsBackend`, with one change: in standalone mode there is no Eagle to fetch metadata from, so every item's metadata comes from its `metadata.json`.

- **Build.** List `images/`, read every `metadata.json` (async, 64 at a time, measured at 15.8 s for 300,000 items with a warm cache), and keep them in the existing columnar store plus the fields the viewer shows (`annotation`, `url`, `palettes`). Trashed items (`isDeleted`) are kept to match Eagle's `all` count and are never returned.
- **Snapshot.** Save the store to `<state dir>/libraries/<library id>/index.v1.bin` (outside the library, never inside it) and load it at start (measured at 0.69 s for 300,000 items), then reconcile with `mtime.json`: only items newer than the snapshot are read again. A snapshot whose format version, library path, or `applicationVersion` doesn't match is discarded.
- **Updates.** Watch `mtime.json` (poll its `mtime`/`size` every few seconds; file-system events are unreliable on network shares) and reread only the items it reports changed. A disagreeing `all` count triggers a rescan of `images/`, as today. Root `metadata.json` and `tags.json` are reread when their `mtime` changes.
- **Pacing.** Reads are paced as today (a token bucket, default 2,000 reads a second) so a NAS or Windows Defender isn't hammered. The initial build without a snapshot is unpaced unless `--gentle` is set.
- **Half-written files.** Eagle may be writing a `metadata.json` while it is read. A file that fails to parse keeps the last good copy (or stays missing) and is retried on the next update, as `libraryIndex.cts` already does.

### 5.3 Queries

Each query the viewer makes is answered from the store, following what the Eagle API does, so both backends return the same pages (checked by the tests in 7):

| Viewer request | FsBackend |
| --- | --- |
| All items, folder, unfiled, untagged, type, rating, tags | Filter the store; default order is Eagle's `item/get` order (`modificationTime`, newest first). Advanced Sort keys work for every library, with no setting needed. |
| Folder item counts | Counted from the store (the API's `folder/get` counts include sub-folders the same way) |
| Search | Name, tags, annotation, and URL, case-insensitive, all words must match. Close to, but not exactly, Eagle's full-text `item/query`; documented as such. |
| Smart folders | Rules evaluated by our own engine (5.4) |
| Tags, tag overview, tag cover | Counted from the store; starred tags and groups from `tags.json` and `metadata.json` |
| Item types | Counted from the store; no Eagle scan needed |

### 5.4 Smart folders

Smart folder rules (`conditions[].rules[]` with `property`, `method`, `value`, combined by `match` and `boolean`) are only evaluated by Eagle today. `FsBackend` gets its own evaluator, phased in:

1. **First release:** the properties that map to stored fields (`rating`, `tags`, `folders`, `type`/`ext`, `name`, `annotation`, `url`, `width`, `height`, `size`, `duration`, the date properties). A smart folder using any rule the evaluator doesn't know is listed but disabled in the viewer, with "Not supported without Eagle", never shown with wrong results.
2. **Later:** colors (`palettes`) and the remaining properties, each added only with a parity test against Eagle.

### 5.5 Password-protected folders

Folders can have a `password` in the library's `metadata.json`. Eagle hides their contents until unlocked. `FsBackend` must never be the way around that:

- A folder with a non-empty `password` is not listed, and items in it (or in a sub-folder of it) are left out of every list, search, count, tag, and smart folder result, and refused by `/file` and `/thumb`.
- The password is never compared, logged, or sent to the viewer. Unlocking is out of scope.

### 5.6 Files

`/file/<id>` and `/api/items/<id>/thumb|file` keep today's path checks (`resolveLibraryItemFile`: the resolved path must stay inside `<library>/images/<id>.info/`, no symlinks out). An item in the trash or in a password-protected folder answers `404`.

## 6. Multiple libraries

### 6.1 Configuration

The standalone config uses the plugin's settings file format with one addition, the libraries to serve:

```jsonc
{
  "port": 41595,
  "libraries": [
    { "path": "/Volumes/nas/Photos.library" },
    { "path": "/Users/me/Design.library", "name": "Design", "access": "selected", "users": ["alice"] }
  ]
  // auth users, HTTPS, public network, block list ... as in the plugin
}
```

`libraries` is the same list library protection uses today (`normalizeSharedLibraries`), so per-library users work unchanged. In standalone mode only the listed libraries are served; there is no "library open in Eagle".

### 6.2 Routing

Each library gets one `FsBackend`, created at start and disposed at stop. Viewers already send the id of the library they connected to (`libraryIdFor`, an HMAC of the path) as the `X-Library-Id` header, or `?library=` on media URLs. Today the server only checks it against the library open in Eagle; standalone mode uses it to pick the backend:

- `/api/*`, `/file/*`, and `/api/items/<id>/thumb|file` are answered by the backend the id names. An id that names no library, or one the user may not open, answers as a library mismatch or `library_denied` does today.
- A new `/api/libraries` lists the libraries the user may open (id and name only, never the path).
- The viewer gets a library picker (today the library is switched only from the plugin panel on the host). Picking one changes only that viewer, not the host or other viewers. With one library, the picker is hidden.
- A request without a library id gets the first library the user may open, so a bookmarked plugin URL keeps working.

### 6.3 Resources

Each library costs about 150 MB of memory per 300,000 items (measured for the sort index; the extra display fields add an estimated 30%). Backends are built one at a time at start, smallest first, so small libraries are browsable within seconds while a large one builds. A library still building answers with `sort.complete: false` and the viewer shows its progress, as Advanced Sort does today.

A library that disappears (unmounted NAS) is marked unavailable and retried every 30 seconds; the others keep working.

## 7. Staying in step with Eagle

The library format is undocumented. These keep it from drifting silently:

1. **Version gate.** `FsBackend` reads `applicationVersion` from the library's `metadata.json` at start and on every change. Known major versions are served. An unknown major version (Eagle 5, for instance) is refused with a clear message unless `--allow-unknown-format` is set, in which case the viewer shows a banner. Item `metadata.json` fields are read defensively: unknown fields are ignored, a missing required field (`id`, `name`, `ext`) skips the item and is counted in `/api/health`.
2. **Parity tests.** A test suite runs the same queries against both backends on a fixture library and requires the same results: folders, smart folders (supported rules), items in every filter and sort, tags, counts, file and thumbnail paths. Two modes:
   - **Recorded (CI):** Eagle's API answers for the fixture library (the `sample-eagles` repository) are recorded once and committed; `FsBackend` runs against the fixture in CI without Eagle.
   - **Live (by hand):** with Eagle running and the fixture library open, the suite asks Eagle directly. Run this on every new Eagle release, and re-record when it passes.
3. **Format notes.** A section in `EAGLE_PLUGIN_SPEC.md` lists every file and field the backend relies on, with the Eagle versions they were checked against. A new Eagle release is supported when the live suite passes and that table is updated.
4. **Fallback.** On a computer where Eagle runs, the plugin stays available. If a format change breaks `FsBackend`, users go back to the plugin until it's fixed; nothing in the library has been touched.

## 8. Running it

```sh
npx eagle-media-server --config ~/media-server.json
npx eagle-media-server --library ~/Photos.library --library /Volumes/nas/Design.library --port 41595
```

- **Package.** The service code (`plugin/service/*.cts`, built to `dist/.generated/plugin-service`) plus the built viewer (`dist/`) and a small `bin/eagle-media-server.cjs`. No Eagle or Electron APIs are used outside `plugin/app.tsx`, so the service code already runs under plain Node 20+.
- **Background service.** Documented recipes for launchd (`~/Library/LaunchAgents`), systemd (user unit), and Windows (Task Scheduler at log on), plus a `Dockerfile` (library folders mounted read-only: `-v /share/Photos.library:/libraries/Photos.library:ro`).
- **State.** Snapshots, the access log, and the session secret go to `--state-dir` (default `~/.eagle-media-preview-server/standalone/`), never into a library.
- **Read-only mount.** `FsBackend` never opens a library file for writing; Docker and NAS setups are encouraged to mount libraries read-only to make that certain.
- **Same computer as Eagle.** Running both is safe (the standalone server only reads), but each needs its own port.

## 9. Security

Everything the plugin enforces applies unchanged: authentication and roles, library protection, the block list, HTTPS, the access log. Additional for standalone:

- Writes are impossible, not just hidden: write routes aren't registered and `FsBackend` has no write methods.
- Password-protected folders are hidden (5.5).
- Only configured library paths are served; a library id that doesn't match one answers `404`, and file paths are confined to `<library>/images/<id>.info/`.
- With no auth users configured, the server binds to `127.0.0.1` only, whatever `--host` says, unless `--allow-anonymous-lan` is given.

## 10. Plan

| Phase | Work | Done when |
| --- | --- | --- |
| P0 (done) | Extract `LibraryBackend` (`libraryBackend.cts`); `createEagleApiBackend` wraps today's client. No behavior change. | All existing tests pass; write routes go through `backend.write` and answer `403 read_only` without it. |
| P1 | `FsBackend`, read only, one library: item store from `metadata.json`, queries in 5.3, files, password-protected folders, version gate. CLI entry. | Parity tests (recorded) pass for everything but smart folders and full-text search; `npx eagle-media-server --library <path>` serves the viewer without Eagle. |
| P2 | Multiple libraries: config, routing by library id, `/api/libraries`, the viewer's library picker, per-library build and availability. | Two viewers browse two libraries at once; library protection applies per library. |
| P3 | Snapshots on disk; `mtime.json` polling tuned for network shares. | 300,000 items available within 2 s of a restart. |
| P4 | Smart folder evaluator (first release set). | Parity tests pass for supported rules; unsupported ones are disabled, not wrong. |
| P5 | Packaging: npm package, Docker image, service recipes; spec and README sections. | Runs on a Linux NAS in Docker with read-only mounts. |

## 11. Open questions

- **Item order inside a folder.** Eagle can order a folder by hand (`orderBy`/`sortIncrease` and per-item order in folder data). Check where that's stored and whether the API's folder order already reflects it; until then folders use the default order.
- **Search parity.** How far `item/query` goes beyond name, tags, annotation, and URL (OCR text? palette names?), and whether the gap matters to users.
- **Eagle 5.** Whether it keeps the `images/<id>.info` layout. The version gate (7.1) makes this safe either way; the work is in updating the backend when it ships.
- **Plugin using FsBackend.** Once parity holds, the plugin could read from disk too (faster, and no paused Eagle window on large libraries) while keeping writes on the API. Not part of this design.
