// Experimental: an in-memory index of one library's item metadata, built only when a viewer asks
// for a sort order that Eagle's Web API can't give (`item/get` always answers newest-first).
//
// It reads `<library>/images/<id>.info/metadata.json` directly and stays current the way Eagle
// itself does: `<library>/mtime.json` maps every item id to its last change, so a changed file
// (checked with stat, at most every `refreshIntervalMs`) tells which items to read again. The index
// decides only which ids match and in what order; callers fetch the items themselves from Eagle.
const { readFile, readdir, stat } = require("fs").promises;
const { join } = require("path");

type SortKey = "btime" | "duration" | "ext" | "filesize" | "import" | "mtime" | "name" | "rating" | "resolution";
type SortOrder = "asc" | "desc";

interface IndexSort {
  key: SortKey;
  order: SortOrder;
}

interface IndexFilter {
  ext?: string | null;
  folderId?: string | null;
  isUnfiled?: boolean;
  isUntagged?: boolean;
  /** Matched against the lower-cased name, like Eagle's `keywords` filter. */
  keywords?: string | null;
  ratings?: number[];
  tags?: string[];
}

interface IndexedItem {
  btime: number;
  duration: number;
  ext: string;
  folders: readonly string[];
  height: number;
  id: string;
  isDeleted: boolean;
  lastModified: number;
  modificationTime: number;
  mtime: number;
  name: string;
  size: number;
  star: number;
  tags: readonly string[];
  width: number;
}

type IndexStatus = "building" | "failed" | "idle" | "ready";

interface LibraryIndexOptions {
  concurrency?: number;
  /** How often a query may stat mtime.json for changes. */
  refreshIntervalMs?: number;
  /** A full folder scan, when Eagle's item count disagrees with the index, runs at most this often. */
  rescanIntervalMs?: number;
}

const SORT_KEYS: readonly SortKey[] = ["import", "btime", "mtime", "name", "ext", "filesize", "resolution", "rating", "duration"];
// Eagle's own direction for each order; picking the other one reverses the whole list, as Eagle does.
const DEFAULT_SORT_ORDER: Record<SortKey, SortOrder> = {
  btime: "desc",
  duration: "asc",
  ext: "asc",
  filesize: "asc",
  import: "desc",
  mtime: "desc",
  name: "asc",
  rating: "asc",
  resolution: "asc",
};
const DEFAULT_CONCURRENCY = 64;
const DEFAULT_REFRESH_INTERVAL_MS = 2000;
const DEFAULT_RESCAN_INTERVAL_MS = 60 * 1000;
const MAX_CACHED_QUERIES = 8;
const FAILED_RETRY_MS = 30 * 1000;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function parseIndexSort(sort: unknown, order: unknown): IndexSort | null {
  const key = String(sort || "").trim().toLowerCase() as SortKey;
  if (!SORT_KEYS.includes(key)) return null;
  const requested = String(order || "").trim().toLowerCase();
  return { key, order: requested === "asc" || requested === "desc" ? requested : DEFAULT_SORT_ORDER[key] };
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) ? number : 0;
}

// Most items have no folders or no tags, so they all share one empty list.
const EMPTY_LIST: readonly string[] = Object.freeze([]);

function stringList(value: unknown, intern: (text: string) => string): readonly string[] {
  const list = Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry).map(intern) : [];
  return list.length ? list : EMPTY_LIST;
}

// Eagle's comparators (app.bundle.js sortData), in each order's default direction. Dates fall back
// to modificationTime, numbers to 0, and NAME / EXT use a numeric, case-insensitive collator.
function comparatorFor(key: SortKey): (left: IndexedItem, right: IndexedItem) => number {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  switch (key) {
    case "name":
      return (left, right) => collator.compare(left.name, right.name);
    case "ext":
      return (left, right) => collator.compare(left.ext, right.ext);
    case "resolution":
      return (left, right) => left.width * left.height - right.width * right.height;
    case "filesize":
      return (left, right) => left.size - right.size;
    case "rating":
      return (left, right) => left.star - right.star;
    case "duration":
      return (left, right) => left.duration - right.duration;
    case "btime":
      return (left, right) => (right.btime || right.modificationTime) - (left.btime || left.modificationTime);
    case "mtime":
      return (left, right) => (right.mtime || right.modificationTime) - (left.mtime || left.modificationTime);
    default:
      return (left, right) => (right.modificationTime || right.mtime) - (left.modificationTime || left.mtime);
  }
}

function matchesFilter(item: IndexedItem, filter: IndexFilter) {
  if (item.isDeleted) return false;
  if (filter.isUnfiled) {
    if (item.folders.length) return false;
  } else if (filter.isUntagged) {
    if (item.tags.length) return false;
  } else if (filter.folderId && !item.folders.includes(filter.folderId)) {
    return false;
  }
  if (filter.ext && item.ext !== filter.ext) return false;
  // Eagle treats 0 as "no rating".
  if (filter.ratings?.length && !filter.ratings.includes(item.star)) return false;
  if (filter.keywords && !item.name.toLowerCase().includes(filter.keywords)) return false;
  if (filter.tags?.length && !filter.tags.every((tag) => item.tags.includes(tag))) return false;
  return true;
}

function normalizeFilter(filter: IndexFilter): IndexFilter {
  return {
    ext: filter.ext ? String(filter.ext).toLowerCase() : "",
    folderId: filter.folderId || "",
    isUnfiled: Boolean(filter.isUnfiled),
    isUntagged: Boolean(filter.isUntagged),
    keywords: filter.keywords ? String(filter.keywords).toLowerCase() : "",
    ratings: [...new Set(filter.ratings || [])].sort(),
    tags: [...new Set(filter.tags || [])].sort(),
  };
}

async function mapWithConcurrency<T>(values: readonly T[], concurrency: number, task: (value: T) => Promise<void>, stopped: () => boolean = () => false) {
  let next = 0;
  const worker = async () => {
    while (next < values.length && !stopped()) {
      const value = values[next++];
      await task(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
}

function createLibraryIndex(libraryPath: string, {
  concurrency = DEFAULT_CONCURRENCY,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  rescanIntervalMs = DEFAULT_RESCAN_INTERVAL_MS,
}: LibraryIndexOptions = {}) {
  const imagesDir = join(libraryPath, "images");
  const mtimePath = join(libraryPath, "mtime.json");
  const items = new Map<string, IndexedItem>();
  const strings = new Map<string, string>();
  const intern = (text: string) => {
    const existing = strings.get(text);
    if (existing !== undefined) return existing;
    strings.set(text, text);
    return text;
  };
  let status: IndexStatus = "idle";
  let building: Promise<void> | null = null;
  let refreshing: Promise<void> | null = null;
  let loaded = 0;
  let total = 0;
  let version = 0;
  let disposed = false;
  let lastRefreshCheck = 0;
  let lastRescan = 0;
  let mtimeSignature = "";
  let failedAt = 0;
  // Bumped by each build: reads from an earlier, abandoned build (a failed one being retried) are dropped.
  let buildRun = 0;
  // Ids in mtime.json without an item folder, with the change time they were last checked at.
  const missing = new Map<string, number>();
  // Items whose metadata.json couldn't be read or parsed (Eagle mid-write, a NAS or sync hiccup).
  // They are tried again at every check, whether or not mtime.json changed.
  const unreadable = new Set<string>();
  // A folder rescan that was due but held back by rescanIntervalMs; it runs at a later check.
  let rescanPending = false;
  const sortedCache = new Map<string, { items: IndexedItem[]; version: number }>();
  const queryCache = new Map<string, { ids: string[]; version: number }>();

  /** Reads one item; resolves true when the index changed (an item set or dropped). */
  async function readItem(id: string, run = buildRun): Promise<boolean> {
    try {
      const raw = JSON.parse(await readFile(join(imagesDir, `${id}.info`, "metadata.json"), "utf8"));
      if (run !== buildRun) return false;
      unreadable.delete(id);
      if (!raw || typeof raw !== "object" || raw.id !== id) return false;
      const name = typeof raw.name === "string" ? raw.name : "";
      items.set(id, {
        btime: finiteNumber(raw.btime),
        duration: finiteNumber(raw.duration),
        ext: intern(String(raw.ext || "").toLowerCase()),
        folders: stringList(raw.folders, intern),
        height: finiteNumber(raw.height),
        id,
        isDeleted: raw.isDeleted === true,
        lastModified: finiteNumber(raw.lastModified),
        modificationTime: finiteNumber(raw.modificationTime),
        mtime: finiteNumber(raw.mtime),
        name,
        size: finiteNumber(raw.size),
        star: Math.max(0, Math.min(5, Math.trunc(finiteNumber(raw.star)))),
        tags: stringList(raw.tags, intern),
        width: finiteNumber(raw.width),
      });
      return true;
    } catch (error) {
      if (run !== buildRun) return false;
      // An item whose folder is gone was removed. Any other failure, including a metadata.json that
      // is missing from a folder still there (a NAS or sync delay), keeps what was read and is retried.
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT" && !(await itemFolderExists(id))) {
        // Checked again after the await: an abandoned build must not touch the next one's state.
        if (run !== buildRun) return false;
        unreadable.delete(id);
        return items.delete(id);
      }
      if (run === buildRun) unreadable.add(id);
      return false;
    }
  }

  async function itemFolderExists(id: string) {
    try {
      return (await stat(join(imagesDir, `${id}.info`))).isDirectory();
    } catch {
      return false;
    }
  }

  async function listItemIds() {
    const entries: string[] = await readdir(imagesDir);
    return entries
      .filter((entry) => entry.endsWith(".info"))
      .map((entry) => entry.slice(0, -".info".length))
      .filter((id) => ITEM_ID_PATTERN.test(id));
  }

  async function readMtimeFile(): Promise<{ signature: string; values: Record<string, unknown> } | null> {
    try {
      const info = await stat(mtimePath);
      const signature = `${info.mtimeMs}:${info.size}`;
      if (signature === mtimeSignature) return { signature, values: {} };
      const values = JSON.parse(await readFile(mtimePath, "utf8"));
      return values && typeof values === "object" ? { signature, values } : null;
    } catch {
      // Missing or half-written: try again on the next check.
      return null;
    }
  }

  async function build() {
    const run = ++buildRun;
    const stopped = () => disposed || run !== buildRun;
    status = "building";
    total = 0;
    loaded = 0;
    try {
      const mtime = await readMtimeFile();
      const ids = await listItemIds();
      if (stopped()) return;
      total = ids.length;
      await mapWithConcurrency(ids, concurrency, async (id) => {
        await readItem(id, run);
        if (!stopped()) loaded += 1;
      }, stopped);
      if (stopped()) return;
      if (mtime) mtimeSignature = mtime.signature;
      // Items the build couldn't see (a folder still syncing, say) leave the counts apart: check the
      // folder again later, even if mtime.json doesn't change.
      if (mtime && countDisagrees(mtime.values)) rescanPending = true;
      lastRefreshCheck = Date.now();
      lastRescan = lastRefreshCheck;
      version += 1;
      status = "ready";
    } catch (error) {
      if (stopped()) return;
      status = "failed";
      failedAt = Date.now();
      throw error;
    }
  }

  // Eagle's own item count, "all" (0 included), against the items held.
  function countDisagrees(values: Record<string, unknown>) {
    return typeof values.all === "number" && Number.isFinite(values.all) && values.all !== items.size;
  }

  async function refresh() {
    const mtime = await readMtimeFile();
    const mtimeChanged = Boolean(mtime && mtime.signature !== mtimeSignature);
    if (!mtimeChanged && !unreadable.size && !rescanPending) return;
    const values = mtimeChanged ? mtime!.values : {};
    const changed = new Set<string>(unreadable);
    for (const [id, value] of Object.entries(values)) {
      if (id === "all" || !ITEM_ID_PATTERN.test(id)) continue;
      const item = items.get(id);
      const changedAt = finiteNumber(value);
      // Eagle leaves ids of removed items in mtime.json; skip those already found missing.
      if (item ? changedAt > item.lastModified : missing.get(id) !== changedAt) changed.add(id);
    }
    // Only real changes bump the version: a file that keeps failing must not force a re-sort each time.
    let updated = false;
    try {
      await mapWithConcurrency([...changed], concurrency, async (id) => {
        if (await readItem(id)) updated = true;
        if (items.has(id) || unreadable.has(id)) missing.delete(id);
        else if (id in values) missing.set(id, finiteNumber(values[id]));
      });
      // Eagle rescans the folder when its item count disagrees; permanent deletes show up only there.
      // A rescan held back by the interval is remembered, so it still happens without another change.
      if (mtimeChanged && countDisagrees(values)) rescanPending = true;
      const now = Date.now();
      if (rescanPending && now - lastRescan >= rescanIntervalMs) {
        lastRescan = now;
        // Cleared only once the folder could be listed, so a failed listing is tried again later.
        const present = new Set(await listItemIds());
        rescanPending = false;
        for (const id of items.keys()) {
          if (!present.has(id) && items.delete(id)) updated = true;
        }
        for (const id of unreadable) {
          if (!present.has(id)) unreadable.delete(id);
        }
        // Unreadable items were already tried at the start of this check.
        await mapWithConcurrency([...present].filter((id) => !items.has(id) && !unreadable.has(id)), concurrency, async (id) => {
          if (await readItem(id)) updated = true;
        });
      }
      if (mtimeChanged) mtimeSignature = mtime!.signature;
    } finally {
      // Changes already applied must reach the cached results even if a later step failed (a
      // listing error, say); otherwise the next check sees nothing new and the cache stays stale.
      if (updated) version += 1;
    }
  }

  function sortedItems(sort: IndexSort) {
    const cacheKey = `${sort.key}:${sort.order}`;
    const cached = sortedCache.get(cacheKey);
    if (cached?.version === version) return cached.items;
    const sorted = [...items.values()].sort(comparatorFor(sort.key));
    if (sort.order !== DEFAULT_SORT_ORDER[sort.key]) sorted.reverse();
    sortedCache.set(cacheKey, { items: sorted, version });
    return sorted;
  }

  return {
    get status() {
      return status;
    },

    progress() {
      return { loaded, total };
    },

    /** Starts building on first use; resolves true once ready, or false if `waitMs` passes first. */
    async whenReady(waitMs: number) {
      if (status === "ready") return true;
      // A failed build (an unreadable library folder, say) is retried at most every FAILED_RETRY_MS.
      if (!building || (status === "failed" && Date.now() - failedAt >= FAILED_RETRY_MS)) {
        building = build();
        building.catch(() => {});
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          building.catch(() => {}),
          new Promise((resolve) => {
            timer = setTimeout(resolve, waitMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      return (status as IndexStatus) === "ready";
    },

    /** Matching ids for one page, in the requested order. Call only once ready. */
    async query(filter: IndexFilter, sort: IndexSort, offset: number, limit: number) {
      if (Date.now() - lastRefreshCheck >= refreshIntervalMs) {
        lastRefreshCheck = Date.now();
        refreshing ??= refresh().finally(() => {
          refreshing = null;
        });
      }
      if (refreshing) await refreshing.catch(() => {});
      const normalized = normalizeFilter(filter);
      const cacheKey = JSON.stringify([normalized, sort]);
      let ids = queryCache.get(cacheKey)?.version === version ? queryCache.get(cacheKey)!.ids : null;
      if (!ids) {
        ids = [];
        for (const item of sortedItems(sort)) {
          if (matchesFilter(item, normalized)) ids.push(item.id);
        }
        queryCache.delete(cacheKey);
        queryCache.set(cacheKey, { ids, version });
        while (queryCache.size > MAX_CACHED_QUERIES) queryCache.delete(queryCache.keys().next().value!);
      } else {
        // Most recently used last, so the oldest query is the one dropped.
        const entry = queryCache.get(cacheKey)!;
        queryCache.delete(cacheKey);
        queryCache.set(cacheKey, entry);
      }
      return { ids: ids.slice(offset, offset + limit), total: ids.length };
    },

    /** Applies an item Eagle just returned from an edit, so the next query sees it right away. */
    noteItem(item: unknown) {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
      const id = typeof record?.id === "string" ? record.id : "";
      const current = id ? items.get(id) : undefined;
      if (!record || !current) return;
      if ("star" in record) current.star = Math.max(0, Math.min(5, Math.trunc(finiteNumber(record.star))));
      if (Array.isArray(record.tags)) current.tags = stringList(record.tags, intern);
      if (Array.isArray(record.folders)) current.folders = stringList(record.folders, intern);
      if (typeof record.isDeleted === "boolean") current.isDeleted = record.isDeleted;
      version += 1;
    },

    /** Makes the next query check mtime.json without waiting for the refresh interval. */
    markStale() {
      lastRefreshCheck = 0;
    },

    dispose() {
      disposed = true;
      items.clear();
      strings.clear();
      missing.clear();
      unreadable.clear();
      sortedCache.clear();
      queryCache.clear();
    },
  };
}

type LibraryIndex = ReturnType<typeof createLibraryIndex>;

interface LibraryIndexManagerOptions extends LibraryIndexOptions {
  /** An index nobody has queried for this long is dropped to give the memory back. */
  idleMs?: number;
}

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

// Eagle reports a library with or without a trailing separator; both name the same index.
function libraryKey(libraryPath: string) {
  return String(libraryPath || "").replace(/[\\/]+$/, "");
}

// Holds the index for the library open in Eagle: a different path replaces it, and an unused one
// is released after `idleMs`, to be rebuilt by the next sorted request.
function createLibraryIndexManager({ idleMs = DEFAULT_IDLE_MS, ...indexOptions }: LibraryIndexManagerOptions = {}) {
  let current: { index: LibraryIndex; path: string } | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const release = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    current?.index.dispose();
    current = null;
  };

  return {
    forLibrary(libraryPath: string) {
      const path = libraryKey(libraryPath);
      if (current?.path !== path) {
        release();
        current = { index: createLibraryIndex(path, indexOptions), path };
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      // An infinite idleMs keeps the index for as long as the server runs.
      if (Number.isFinite(idleMs)) {
        idleTimer = setTimeout(release, idleMs);
        idleTimer.unref?.();
      }
      return current.index;
    },

    /**
     * The index for the current library if one is loaded; never starts a build. With a path, only
     * an index of that library is returned.
     */
    loaded(libraryPath?: string) {
      if (libraryPath !== undefined && current?.path !== libraryKey(libraryPath)) return null;
      return current?.index ?? null;
    },

    release,
  };
}

module.exports = {
  DEFAULT_SORT_ORDER,
  SORT_KEYS,
  createLibraryIndex,
  createLibraryIndexManager,
  parseIndexSort,
};
