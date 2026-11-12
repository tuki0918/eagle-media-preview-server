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

- **Experimental and off by default.** It relies on Eagle's undocumented library layout (`mtime.json`, the `images/<id>.info` folders), which an Eagle update could change.
- **Built in the background at server start and kept in memory only.** With the setting on, the scan runs once when the server starts (and after a library switch), so sorting is ready before anyone asks; the viewer disables only the Sort menu until then. Nothing is written to disk or to the library. A snapshot on disk is left for later (see 4).
- **Item metadata comes from Eagle, not from disk.** The ids are listed from `images/`, and their metadata is fetched with `item/get` by `ids`, 1,000 per request (Eagle's maximum). Eagle holds every item in memory, so no `metadata.json` is opened: the disk, a NAS, and Windows Defender (which checked every file the earlier build opened, and spun up the fan) are spared. Reading Eagle's code showed why `ids` and not `offset`/`limit` paging: each `item/get` runs in Eagle's window, copies its whole item list, filters it, sorts what is left, and then cuts the page. Paging by `offset` sorts all items on every request (about 0.25–0.5 s each for 300,000 items in a simulation of that code, so about 300 pauses of Eagle's window), while `ids` filters down to 1,000 items first (about 13 ms each). The fields the index needs all come back (`btime`, `mtime`, `modificationTime`, `lastModified`, `tags`, `folders`, and so on; `star` and `duration` only when set). Checked with Eagle 4.0 and the ICON library (210 ids in `mtime.json`, 5 in the trash): one request for all 210 ids took 34 ms and returned 205.
- **Paced to spare Eagle.** Requests go one at a time, 2 a second: 300,000 items take about 2.5 minutes, as long as the paced reads of `metadata.json` took. A token bucket starts full with one second's worth and refills as it goes, so libraries of up to 2,000 items and small updates aren't held back. The build runs in the background, so a slower build was preferred over keeping Eagle's window busy.
- **Items Eagle doesn't return.** Eagle leaves out items in the trash. One whose folder is still there is counted toward Eagle's `all` count (which includes the trash) and asked about again at most every minute, since an item synced from another computer can reach Eagle only after `mtime.json` lists it, and asked about too early it looks like a trashed one. A request Eagle doesn't answer keeps what was held and is retried at every check; a build Eagle answered nothing for (another library open, say) fails and is retried. Answers are refused once Eagle reports a library switch, since Eagle answers for whichever library is open.
- **Kept current the way Eagle keeps its own cache.** `mtime.json` tells which items changed, so only those are fetched again; the folder is rescanned only when Eagle's `all` count disagrees. Updates share the build's pace, so a bulk edit of many items takes a while; a sorted request waits for an update at most 1 second, then answers from what the index holds while the update carries on. Until it ends the index reports itself incomplete (`sort.complete: false`). Type requests get the counts cached before the update and retry until it ends, so Eagle isn't scanned for nothing. They turn to Eagle's scan when there are no such counts (a bulk update can take minutes), when the update has made no progress for 15 seconds (a hung read), or when a scan of Eagle for that folder is running or finished and still cached (it is newer than those counts, and a viewer keeps what it shows), and if the finished index still lacks items. The cache version is bumped only when the update ends, on purpose: a query already cached keeps its order while the update is read, while a query not cached yet sees the items fetched so far. Each page reports whether the index was complete when that page was made, so an update ending while its items are fetched from Eagle doesn't make it look complete. Pages are not pinned to a snapshot: paging across the end of an update (or any other change in Eagle) can show an item twice or miss one. A disposed index (server stopped, library switched) stops its update and drops reads still in flight.
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
| First build (reading `metadata.json`, unpaced; now fetched from Eagle, paced to about 150 s, see 2) | **17.1 s** |
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
| Snapshot on disk (later starts in about 1.5 s) | Avoids the full build (about 2.5 minutes for 300,000 items, longer on a slow NAS) after a restart or release | Acceptable for an experiment; add on request |
| Seed from Eagle's cache (`library-caches`) | Shorter first build | Undocumented internal format |
| Columnar layout (typed arrays) | 148 MB → about 40–60 MB | More complex code |
| Incremental re-sort after edits | Faster first name sort after an edit (about 0.9 s now) | Currently sorts the whole list again |
| Range filters, facet counts, random order, smart folder rules | More features | Decide after the sort has been tried |
| Build in a worker thread | Less load on Eagle's main thread | The build mostly waits for Eagle's answers (one request at a time, paced) |

### About the size of `mtime.json`

It costs about 31 bytes per item: about 5.3 MB for 170,000 items and 9 MB for 300,000 (0.15 s to parse). Eagle rewrites the whole file on every change, so it is parsed only when its `stat` (mtimeMs and size) changes, and at most every 2 seconds.

## 5. Known limitations (accepted for now)

- The cost of each `item/get` by `ids` in Eagle with 300,000 items has not been measured in Eagle itself, only in a simulation of its code (about 13 ms on an M1); a slower PC takes longer per request, but the build still takes about 2.5 minutes, since requests are paced. Listing `images/` on a slow NAS adds to that. The plugin panel shows the progress, and stopping the server ends it.
- For a few seconds after an upload, the new item may be missing from a sorted list: it appears once Eagle writes it to `mtime.json`, which the next sorted request checks.
- An item folder that arrives after the first rescan (a slow NAS or sync) is found only when `mtime.json` changes again or the index is rebuilt. Fixing it means rescanning repeatedly while Eagle's `all` count disagrees, with a growing interval so that a library whose count never matches doesn't list its folder every minute.
- Pages of a sorted list are not pinned to a snapshot. When the order changes between two pages (an update ends, or anything changes in Eagle), the next page can repeat or skip items. The first case is new with paced updates: before, a sorted request waited for the whole update, so a viewer that started browsing after a bulk edit got one order throughout. Now an update of more than about 2,000 items (a bulk edit) is still being fetched after the 1-second wait, and its end switches the order between pages even though nothing changes in Eagle during the browsing. Those pages say `complete: false`, but the viewer doesn't reload from the top once the update ends. Recorded by the test "switches a query's order between pages when an update ends in the background". Pinning would need a snapshot per list (a token passed with each page) or a viewer that reloads from the top when the order changes.
- After Advanced Sort is turned back on, a viewer that stayed open shows the Sort menu only once the page is reloaded or connects again.
