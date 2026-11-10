# Large libraries (300,000 items): local sort index

Status: **Experimental** (P1 implemented, 2026-11-10). Active only when **Settings → Libraries → Advanced Sort** is on (saved as `experimentalSort`).

## 1. Background

The preview server leaves item lists and filters to Eagle's Web API. Reading Eagle's own code (`app/js/plugin/index.js` and `app/js/api-server-v2.js` inside `Eagle.app`'s `app.asar`) showed:

- **`/api/v2/item/get` cannot be ordered.** On every call it filters all items and re-sorts them with `sortData(items, 'CREATEDATE')`, which is `modificationTime`, newest first.
- **`/api/v2/smartFolder/getItems` accepts `orderBy`**, but not the `-` prefix for the reverse order.
- **The legacy `/api/item/list` accepts `orderBy`**, but re-sorts each page by `IMPORT` after slicing it, so the order across pages is wrong.

Ordering a normal item list therefore needs an index of our own.

How Eagle itself does it:

- It holds every item in memory and sorts and filters in JavaScript. There is no index database.
- Its startup cache is `~/Library/Application Support/Eagle/library-caches/<FNV-1a32(library path)>.txt`, NDJSON with one item per line.
- While running it watches `<library>/mtime.json` to stay in sync with other instances:
  - a new key is a new item
  - a larger value is an edited item
  - when the `all` count disagrees, it rescans the folder

## 2. Approach (P1, implemented)

How it behaves (the setting, the API, the viewer, updates, filters) is in the spec: [Advanced Sort](../EAGLE_PLUGIN_SPEC.md#advanced-sort-experimental). The decisions behind it:

- **Experimental and off by default.** It reads Eagle's undocumented library files (`metadata.json`, `mtime.json`), which an Eagle update could change.
- **Built in the background at server start and kept in memory only.** With the setting on, the scan runs once when the server starts (and after a library switch), so sorting is ready before anyone asks; the viewer disables only the Sort menu until then. Nothing is written to disk or to the library. A snapshot on disk is left for later (see 4).
- **Kept current the way Eagle keeps its own cache.** `mtime.json` tells which items changed, so only those are read again; the folder is rescanned only when Eagle's `all` count disagrees.
- **The index orders ids; Eagle supplies the items.** Each page is fetched from `item/get` by `ids`, so sorted and unsorted responses look the same and Eagle stays the source of item details.
- **Sorting and filtering follow Eagle,** so results match Eagle's own app. The one exception: search text alone matches names only, not Eagle's full-text `item/query`.
- **Pages in two orders never mix.** While the index builds, or when sorting fails or is turned off, the viewer waits, or drops the sort and starts over, rather than showing default-order pages among sorted ones.
- **Smart folders stay unsorted.** Their rules are evaluated only by Eagle.

Sort keys and their default directions follow Eagle's `sortData`.

| Key | Meaning | Default direction |
| --- | --- | --- |
| `import` | Date added (`modificationTime`) | Descending |
| `btime` | Date created | Descending |
| `mtime` | Date modified | Descending |
| `name` | Name (numeric-aware, case-insensitive) | Ascending |
| `ext` | File extension | Ascending |
| `filesize` | File size | Ascending |
| `resolution` | Resolution (width × height) | Ascending |
| `rating` | Rating | Ascending |
| `duration` | Duration | Ascending |

Picking the other direction reverses the whole list, as Eagle does. These are the server's defaults for a request without `order`; the viewer starts file size, resolution, rating, and duration in the opposite direction and always sends `order`.

## 3. Measurements

### Preliminary (Apple M1 / 16 GB / Node 24)

Real metadata (113,287 items) repeated to 300,000, and a synthetic library with 300,000 item folders. The OS file cache was warm.

| Operation | Time / size |
| --- | --- |
| `readdir(images/)` | 1.26 s |
| Read and parse `mtime.json` (9 MB) | 0.15 s |
| Read every `metadata.json` (async, 64 at a time) | 15.8 s |
| Read our own snapshot (76 MB) | 0.69 s |
| Columnar layout (typed arrays) | about 40 MB |

### Implementation (`libraryIndex.cts`), 300,000 items

| Operation | Result |
| --- | --- |
| First build | **17.1 s** |
| Memory | **about 148 MB** |
| Date added (first query) | 127 ms |
| Name (first query, includes sorting) | 918 ms |
| Next page of the same query | 0 ms (cached) |
| Same sort, different filter | 20 ms |
| With search text | 234 ms |
| Name right after an edit | 929 ms (sorts again) |

### Checked against Eagle

With Eagle 4.0 and the ICON library (201 items):

- name ascending, file size descending, ratings 5 and 4 by name, and page 2 all matched the list Eagle returned, sorted locally
- the items had the same fields as an unsorted response

## 4. Deferred (add when needed)

Left out of P1 to keep it small.

| Item | Benefit | Why deferred |
| --- | --- | --- |
| Snapshot on disk (later starts in about 1.5 s) | Avoids the full build (about 17 s for 300,000 items, longer on a NAS) after a restart or release | Acceptable for an experiment; add on request |
| Seed from Eagle's cache (`library-caches`) | Shorter first build | Undocumented internal format |
| Columnar layout (typed arrays) | 148 MB → about 40–60 MB | More complex code |
| Incremental re-sort after edits | Faster first name sort after an edit (about 0.9 s now) | Currently sorts the whole list again |
| Range filters, facet counts, random order, smart folder rules | More features | Decide after the sort has been tried |
| Build in a worker thread | Less load on Eagle's main thread | The build mostly waits on I/O (async reads, 64 at a time) |

### About the size of `mtime.json`

It costs about 31 bytes per item: about 5.3 MB for 170,000 items and 9 MB for 300,000 (0.15 s to parse). Eagle rewrites the whole file on every change, so it is parsed only when its `stat` (mtimeMs and size) changes, and at most every 2 seconds.

## 5. Known limitations (accepted for now)

- The first build time on a NAS has not been measured. It is longer than the 17 seconds measured for 300,000 items on an internal SSD; the plugin panel shows the progress, and stopping the server ends it.
- For a few seconds after an upload, the new item may be missing from a sorted list: it appears once Eagle writes it to `mtime.json`, which the next sorted request checks.
- An item folder that arrives after the first rescan (a slow NAS or sync) is found only when `mtime.json` changes again or the index is rebuilt. Fixing it means rescanning repeatedly while Eagle's `all` count disagrees, with a growing interval so that a library whose count never matches doesn't list its folder every minute.
- After Advanced Sort is turned back on, a viewer that stayed open shows the Sort menu only once the page is reloaded or connects again.
