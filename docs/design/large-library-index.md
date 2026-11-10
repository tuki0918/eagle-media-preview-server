# Large libraries (300,000 items): local sort index

Status: **Experimental** (P1 implemented, 2026-11-10). Active only when `settings.json` has `"experimentalSort": true`.

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

The first step is deliberately small.

| Topic | Decision |
| --- | --- |
| Enabling | `experimentalSort: true`, edited by hand in `settings.json`; off by default |
| Loading | **On demand.** The first sorted request starts the build. Normal browsing is untouched |
| While building | A request waits up to 1 second. If the index is not ready, the server answers in the default order and adds `sort: { status: "indexing", loaded, total }`. The viewer shows "Preparing sort… n / N items" with a **Cancel** button and asks again every 1.5 seconds. Items from the default order are not shown, so pages in two different orders never mix |
| Cancelling | `POST /api/sort-index/cancel` stops the build and frees what it read. The viewer that cancels goes back to the default order. The next sorted request starts a new build |
| Updates | When a sorted request arrives, the server stats `mtime.json`, at most every 2 seconds. If it changed, only the ids whose value went up are read again. When `all` disagrees, the folder is rescanned, at most once a minute |
| Edits from the viewer | Rating, tag, folder, and trash edits apply to the index as soon as Eagle confirms them. After an upload, the next request checks `mtime.json` |
| Release | After 30 minutes without a sorted request, on a library switch, and on stop |
| Response | The index decides only which ids, in which order. The page's items come from Eagle's `item/get` with `ids`, so they look exactly like unsorted ones |
| Smart folders | Not sorted; they keep the default order |
| Writes to the library | None |

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

Picking the other direction reverses the whole list, as Eagle does.

Filters match Eagle's `item/get`:

- folder: the item is directly in the folder
- tags: the item has every listed tag
- rating `0`: unrated
- search text: case-insensitive substring of the name
- trashed items are left out

**Difference:** search text on its own used to go to Eagle's full-text `item/query`. While sorting, it matches names only.

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

It costs about 31 bytes per item: about 5.3 MB for 170,000 items and 9 MB for 300,000 (0.15 s to parse). The implementation:

- reads it only when its `stat` (mtimeMs and size) changes
- parses it at most every 2 seconds
- on a parse failure (Eagle was still writing), keeps what it has and tries again later
- does not re-read ids without an item folder (Eagle leaves ids of removed items behind) until their value changes

## 5. Open questions

1. Windows paths. The index uses the path Eagle reports as is.
2. First build time for a few hundred thousand items on a NAS.
3. When Eagle writes a new item to `mtime.json`. For a few seconds after an upload, the new item may be missing from a sorted list.
