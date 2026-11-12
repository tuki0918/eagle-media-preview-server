// Experimental: an in-memory index of one library's item metadata, built only when a viewer asks
// for a sort order that Eagle's Web API can't give (`item/get` always answers newest-first).
//
// The ids come from the library folder (`<library>/images/<id>.info`), and their metadata from
// Eagle's `item/get` by `ids`, a batch at a time: Eagle holds every item in memory, so no
// metadata.json is opened. It stays current the way Eagle itself does: `<library>/mtime.json` maps
// every item id to its last change, so a changed file (checked with stat, at most every
// `refreshIntervalMs`) tells which items to ask for again. The index decides only which ids match
// and in what order; callers fetch the items themselves from Eagle.
const { readFile, readdir, stat } = require("fs").promises;
const { join } = require("path");
const { normalizeExtension, sortedExtensionCounts } = require("./eagleClient.cjs");

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

/** Where the index gets item metadata: Eagle's Web API for the library the index is for. */
interface ItemSource {
  /**
   * The items Eagle holds for these ids (at most batchSize of them). Eagle leaves out items in the
   * trash and ids it doesn't know. Rejects when Eagle can't answer, or now has another library open.
   */
  fetchItems(ids: string[]): Promise<unknown[]>;
}

interface LibraryIndexOptions {
  source: ItemSource;
  /** How many ids one request to Eagle asks for; Eagle takes at most 1,000. */
  batchSize?: number;
  /**
   * The most requests to Eagle per second, to spare Eagle (each one scans its whole item list);
   * Infinity turns it off. Up to one second's worth may go at once, so small libraries and small
   * updates aren't held back. Requests go one at a time.
   */
  batchesPerSecond?: number;
  /**
   * The most metadata.json reads per second, one at a time; Infinity turns pacing off. Only items
   * Eagle didn't return are read, to tell those in the trash from those Eagle hasn't loaded yet.
   */
  metadataReadsPerSecond?: number;
  /** How often a query may stat mtime.json for changes. */
  refreshIntervalMs?: number;
  /**
   * How long a query waits for an update in progress before answering from what the index holds;
   * the update carries on in the background (a bulk edit of many items takes a while at batchesPerSecond).
   */
  refreshWaitMs?: number;
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
// Eagle's item/get takes at most 1,000 ids.
const DEFAULT_BATCH_SIZE = 1000;
// Each item/get copies and filters Eagle's whole item list in Eagle's window (about 13 ms for
// 300,000 items on an M1, in a simulation of that code), so they are spread out: 300,000 items take
// about 2.5 minutes at this rate, as long as the paced reads of metadata.json used to.
const DEFAULT_BATCHES_PER_SECOND = 2;
// A trash of 20,000 items takes about 10 s to check once; at this rate Windows Defender, which checks
// every file opened, stayed mostly quiet when the whole library was read this way.
const DEFAULT_METADATA_READS_PER_SECOND = 2000;
// Shortest pause between requests once the budget is spent; shorter timers aren't reliable.
const MIN_PACING_PAUSE_MS = 10;
const DEFAULT_REFRESH_INTERVAL_MS = 2000;
const DEFAULT_REFRESH_WAIT_MS = 1000;
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
    ext: normalizeExtension(filter.ext),
    folderId: filter.folderId || "",
    isUnfiled: Boolean(filter.isUnfiled),
    isUntagged: Boolean(filter.isUntagged),
    keywords: filter.keywords ? String(filter.keywords).toLowerCase() : "",
    ratings: [...new Set(filter.ratings || [])].sort(),
    tags: [...new Set(filter.tags || [])].sort(),
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Resolves when `promise` settles or `ms` passes, whichever comes first.
async function waitAtMost(promise: Promise<unknown>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise.catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// A token bucket: each request takes one token; tokens come back at `perSecond`, holding at most one
// second's worth. Resolves when the caller may send the request.
function createPacer(perSecond: number) {
  if (!(perSecond > 0) || !Number.isFinite(perSecond)) return async () => {};
  const capacity = Math.max(1, perSecond);
  let tokens = capacity;
  let last = Date.now();
  return async function take(stopped: () => boolean = () => false) {
    while (!stopped()) {
      const now = Date.now();
      tokens = Math.min(capacity, tokens + (Math.max(0, now - last) * perSecond) / 1000);
      last = now;
      if (tokens >= 1) {
        tokens -= 1;
        return;
      }
      await sleep(Math.max(MIN_PACING_PAUSE_MS, Math.ceil(((1 - tokens) * 1000) / perSecond)));
    }
  };
}

function createLibraryIndex(libraryPath: string, {
  source,
  batchSize = DEFAULT_BATCH_SIZE,
  batchesPerSecond = DEFAULT_BATCHES_PER_SECOND,
  metadataReadsPerSecond = DEFAULT_METADATA_READS_PER_SECOND,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  refreshWaitMs = DEFAULT_REFRESH_WAIT_MS,
  rescanIntervalMs = DEFAULT_RESCAN_INTERVAL_MS,
}: LibraryIndexOptions) {
  const imagesDir = join(libraryPath, "images");
  const mtimePath = join(libraryPath, "mtime.json");
  const size = Math.max(1, Math.min(DEFAULT_BATCH_SIZE, Math.trunc(batchSize) || DEFAULT_BATCH_SIZE));
  // Shared by the build and later updates, so together they stay within batchesPerSecond.
  const pace = createPacer(batchesPerSecond);
  const paceMetadataRead = createPacer(metadataReadsPerSecond);
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
  // When the update in progress last got somewhere (started, listed the folder, or got a batch):
  // a paced update hears from Eagle every second or so, so a long pause means something hangs
  // (Eagle busy, or a NAS listing).
  let refreshProgressAt = 0;
  let loaded = 0;
  let total = 0;
  let version = 0;
  let disposed = false;
  let lastRefreshCheck = 0;
  let lastRescan = 0;
  let mtimeSignature = "";
  let failedAt = 0;
  // Bumped by each build: answers for an earlier, abandoned build (a failed one being retried) are dropped.
  let buildRun = 0;
  // Ids in mtime.json Eagle didn't return or couldn't answer for, with their latest change time
  // seen there: kept until Eagle returns the item, so a retry still knows how recent trash state
  // must be to count (see whyNotReturned), even for an item the index still holds from before.
  const missing = new Map<string, number>();
  // Ids Eagle didn't return whose metadata.json says they are in the trash. Eagle's item count
  // includes them, so they are counted against it; they are asked about again only when mtime.json
  // says they changed (restored, say).
  const trashed = new Set<string>();
  // Ids with an item folder that Eagle didn't return for another reason: not loaded by Eagle yet
  // (synced from another computer), or metadata missing or mid-write. The index may be missing them,
  // so it doesn't cover every item while there are any; they are asked about again at most every
  // rescanIntervalMs.
  const unconfirmed = new Set<string>();
  let lastUnconfirmedCheck = 0;
  // Ids Eagle couldn't answer for (a request failed). They are asked about again at every check,
  // whether or not mtime.json changed.
  const unreadable = new Set<string>();
  // A folder rescan that was due but held back by rescanIntervalMs; it runs at a later check.
  let rescanPending = false;
  // Eagle's own item count from mtime.json ("all"), or null when it doesn't say.
  let eagleItemCount: number | null = null;
  const sortedCache = new Map<string, { items: IndexedItem[]; version: number }>();
  const queryCache = new Map<string, { ids: string[]; version: number }>();
  const extensionCache = new Map<string, { items: Array<{ count: number; ext: string }>; version: number }>();

  function indexedItem(id: string, raw: Record<string, unknown>): IndexedItem {
    return {
      btime: finiteNumber(raw.btime),
      duration: finiteNumber(raw.duration),
      ext: intern(normalizeExtension(raw.ext)),
      folders: stringList(raw.folders, intern),
      height: finiteNumber(raw.height),
      id,
      isDeleted: false,
      lastModified: finiteNumber(raw.lastModified),
      modificationTime: finiteNumber(raw.modificationTime),
      mtime: finiteNumber(raw.mtime),
      name: typeof raw.name === "string" ? raw.name : "",
      size: finiteNumber(raw.size),
      star: Math.max(0, Math.min(5, Math.trunc(finiteNumber(raw.star)))),
      tags: stringList(raw.tags, intern),
      width: finiteNumber(raw.width),
    };
  }

  /**
   * Asks Eagle for these items, a paced batch at a time, and resolves true when the index changed
   * (an item set or dropped). An id Eagle doesn't return is dropped, and its metadata.json tells
   * why (see whyNotReturned). A batch Eagle couldn't answer keeps what was held and is retried.
   * `changeTime` gives an item's latest time in mtime.json, when known; `onProgress` is called after
   * each answer from Eagle and each metadata.json read.
   */
  async function readItems(ids: readonly string[], { changeTime = () => undefined, onBatch, onProgress, run = buildRun, stopped }: {
    changeTime?: (id: string) => number | undefined;
    onBatch?: (batch: string[]) => void;
    onProgress?: () => void;
    run?: number;
    stopped: () => boolean;
  }) {
    let updated = false;
    for (let start = 0; start < ids.length && !stopped(); start += size) {
      await pace(stopped);
      if (stopped()) break;
      const batch = ids.slice(start, start + size);
      let answered: unknown[] | null = null;
      try {
        answered = await source.fetchItems(batch);
      } catch {
        // Kept as it was and asked about again at the next check.
      }
      if (run !== buildRun) break;
      onProgress?.();
      if (!Array.isArray(answered)) {
        for (const id of batch) unreadable.add(id);
        onBatch?.(batch);
        continue;
      }
      const found = new Map<string, Record<string, unknown>>();
      for (const raw of answered) {
        if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).id === "string") {
          found.set((raw as Record<string, unknown>).id as string, raw as Record<string, unknown>);
        }
      }
      const notReturned: string[] = [];
      for (const id of batch) {
        unreadable.delete(id);
        const raw = found.get(id);
        if (raw && raw.isDeleted !== true) {
          items.set(id, indexedItem(id, raw));
          trashed.delete(id);
          unconfirmed.delete(id);
          updated = true;
        } else {
          if (items.delete(id)) updated = true;
          notReturned.push(id);
        }
      }
      for (const id of notReturned) {
        await paceMetadataRead(stopped);
        if (stopped()) return updated;
        const reason = await whyNotReturned(id, changeTime(id));
        // Checked again after the await: an abandoned build must not touch the next one's state.
        if (run !== buildRun) return updated;
        // A slow disk or NAS can take a while over many of these; each one is progress.
        onProgress?.();
        if (reason === "trashed") trashed.add(id);
        else trashed.delete(id);
        if (reason === "unconfirmed") unconfirmed.add(id);
        else unconfirmed.delete(id);
      }
      onBatch?.(batch);
    }
    return updated;
  }

  // Why Eagle didn't return an item: its metadata.json says it is in the trash, or its folder is
  // gone (removed), or anything else ("unconfirmed": not loaded by Eagle yet, metadata missing or
  // mid-write). Only the trash is certain, so only it counts as covered. Metadata older than the
  // item's time in mtime.json (`changedAt`) is not trusted: mtime.json can announce a restore before
  // Eagle and metadata.json show it, and the item must then be asked about again.
  async function whyNotReturned(id: string, changedAt: number | undefined): Promise<"removed" | "trashed" | "unconfirmed"> {
    try {
      const raw = JSON.parse(await readFile(join(imagesDir, `${id}.info`, "metadata.json"), "utf8"));
      if (!raw || raw.id !== id || raw.isDeleted !== true) return "unconfirmed";
      const stale = changedAt !== undefined && typeof raw.lastModified === "number" && raw.lastModified < changedAt;
      return stale ? "unconfirmed" : "trashed";
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT" && !(await itemFolderExists(id))) return "removed";
      return "unconfirmed";
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
      await readItems(ids, {
        changeTime: (id) => (mtime && id in mtime.values ? finiteNumber(mtime.values[id]) : undefined),
        onBatch: (batch) => {
          if (!stopped()) loaded += batch.length;
        },
        run,
        stopped,
      });
      if (stopped()) return;
      // Eagle not answering at all (another library open, say) is a failed build, retried later.
      if (ids.length && unreadable.size === ids.length) throw new Error("Eagle returned none of the library's items");
      if (mtime) {
        mtimeSignature = mtime.signature;
        noteEagleItemCount(mtime.values);
        for (const id of [...trashed, ...unconfirmed, ...unreadable]) {
          if (!items.has(id) && id in mtime.values) missing.set(id, finiteNumber(mtime.values[id]));
        }
      }
      // Items the build couldn't see (a folder still syncing, say) leave the counts apart: check the
      // folder again later, even if mtime.json doesn't change.
      if (mtime && countDisagrees()) rescanPending = true;
      lastRefreshCheck = Date.now();
      lastRescan = lastRefreshCheck;
      lastUnconfirmedCheck = lastRefreshCheck;
      version += 1;
      status = "ready";
    } catch (error) {
      if (stopped()) return;
      status = "failed";
      failedAt = Date.now();
      throw error;
    }
  }

  function coversAllItems() {
    return !refreshing && unreadable.size === 0 && unconfirmed.size === 0 && !countDisagrees();
  }

  // Eagle's own item count, "all" (0 included, trashed items included), against the items held and
  // the other item folders Eagle didn't return.
  function countDisagrees() {
    return eagleItemCount !== null && eagleItemCount !== items.size + trashed.size + unconfirmed.size;
  }

  function noteEagleItemCount(values: Record<string, unknown>) {
    eagleItemCount = typeof values.all === "number" && Number.isFinite(values.all) ? values.all : null;
  }

  async function refresh() {
    // A disposed index asks for nothing more: answers in flight are dropped (dispose bumps buildRun).
    const stopped = () => disposed;
    refreshProgressAt = Date.now();
    const mtime = await readMtimeFile();
    if (stopped()) return;
    refreshProgressAt = Date.now();
    const mtimeChanged = Boolean(mtime && mtime.signature !== mtimeSignature);
    // An item synced from another computer may reach Eagle only after mtime.json says so; asked
    // about too early it isn't returned, so unconfirmed ones are asked about again now and then.
    const unconfirmedDue = unconfirmed.size > 0 && Date.now() - lastUnconfirmedCheck >= rescanIntervalMs;
    if (!mtimeChanged && !unreadable.size && !rescanPending && !unconfirmedDue) return;
    const values = mtimeChanged ? mtime!.values : {};
    if (mtimeChanged) noteEagleItemCount(values);
    const changed = new Set<string>(unreadable);
    if (unconfirmedDue) {
      lastUnconfirmedCheck = Date.now();
      for (const id of unconfirmed) changed.add(id);
    }
    for (const [id, value] of Object.entries(values)) {
      if (id === "all" || !ITEM_ID_PATTERN.test(id)) continue;
      const item = items.get(id);
      const changedAt = finiteNumber(value);
      // Eagle leaves ids of removed items in mtime.json; skip those it didn't return last time.
      if (item ? changedAt > item.lastModified : missing.get(id) !== changedAt) changed.add(id);
    }
    // Only real changes bump the version: a file that keeps failing must not force a re-sort each time.
    let updated = false;
    try {
      if (await readItems([...changed], {
        changeTime: (id) => (id in values ? finiteNumber(values[id]) : missing.get(id)),
        onBatch: (batch) => {
          for (const id of batch) {
            // Kept for one Eagle couldn't answer too, held or not: its retry may find stale trash state.
            if (items.has(id) && !unreadable.has(id)) missing.delete(id);
            else if (id in values) missing.set(id, finiteNumber(values[id]));
          }
        },
        onProgress: () => {
          refreshProgressAt = Date.now();
        },
        stopped,
      })) updated = true;
      if (stopped()) return;
      // Eagle rescans the folder when its item count disagrees; permanent deletes show up only there.
      // A rescan held back by the interval is remembered, so it still happens without another change.
      if (mtimeChanged && countDisagrees()) rescanPending = true;
      const now = Date.now();
      if (rescanPending && now - lastRescan >= rescanIntervalMs) {
        lastRescan = now;
        // Settled only once the folder could be listed, so a failed listing is tried again later.
        const present = new Set(await listItemIds());
        refreshProgressAt = Date.now();
        if (stopped()) return;
        for (const id of items.keys()) {
          if (!present.has(id) && items.delete(id)) updated = true;
        }
        for (const id of unreadable) {
          if (!present.has(id)) unreadable.delete(id);
        }
        for (const id of [...trashed, ...unconfirmed]) {
          if (!present.has(id)) {
            trashed.delete(id);
            unconfirmed.delete(id);
          }
        }
        // Unreadable items were already asked about at the start of this check, and trashed ones
        // are asked about once mtime.json says they changed.
        if (await readItems([...present].filter((id) => !items.has(id) && !unreadable.has(id) && !trashed.has(id)), {
          changeTime: (id) => missing.get(id),
          onProgress: () => {
            refreshProgressAt = Date.now();
          },
          stopped,
        })) updated = true;
        if (stopped()) return;
        // Folders still syncing arrive later without touching mtime.json: keep rescanning, at the
        // interval, until the index holds as many items as Eagle counts.
        rescanPending = countDisagrees();
      }
      if (mtimeChanged) mtimeSignature = mtime!.signature;
    } finally {
      // Changes already applied must reach the cached results even if a later step failed (a
      // listing error, say); otherwise the next check sees nothing new and the cache stays stale.
      if (updated) version += 1;
    }
  }

  // At most every refreshIntervalMs, checks mtime.json for changes. Callers wait for a check in
  // progress up to refreshWaitMs, then go on with what the index holds while it finishes, and
  // coversAllItems() is false until it does. Meanwhile `version` stays put on purpose: a query asked
  // before keeps its cached order while the update is read, while a query not cached yet sees the
  // items read so far. The update shows up in every query once it ends and bumps `version`; pages
  // asked for after that come from the new order, so a viewer paging across that moment can see an
  // item twice or miss one, as with any change in Eagle while paging (pages aren't pinned to a
  // snapshot).
  async function refreshIfDue() {
    if (disposed) return;
    if (Date.now() - lastRefreshCheck >= refreshIntervalMs) {
      lastRefreshCheck = Date.now();
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
    }
    if (refreshing) await waitAtMost(refreshing, refreshWaitMs);
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

    /**
     * False while the index may be missing items or hold old ones: an update is still being read
     * (see refreshIfDue), Eagle couldn't answer for some items or didn't return items that aren't in
     * the trash, or it holds a different number of items than Eagle counts (an item folder not
     * synced yet, say). Reflects the last check, so ask right
     * after query() or extensionCounts(), which check first.
     */
    coversAllItems() {
      return coversAllItems();
    },

    /** Starts building on first use; resolves true once ready, or false if `waitMs` passes first. */
    async whenReady(waitMs: number) {
      if (status === "ready") return true;
      // A failed build (an unreadable library folder, say) is retried at most every FAILED_RETRY_MS.
      if (!building || (status === "failed" && Date.now() - failedAt >= FAILED_RETRY_MS)) {
        building = build();
        building.catch(() => {});
      }
      await waitAtMost(building, waitMs);
      return (status as IndexStatus) === "ready";
    },

    /**
     * Matching ids for one page, in the requested order, and whether the index covered every item
     * when the page was made (see coversAllItems). Call only once ready.
     */
    async query(filter: IndexFilter, sort: IndexSort, offset: number, limit: number) {
      await refreshIfDue();
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
      // Taken with the page itself: an update that ends while the caller still works on the page
      // must not make the page look complete.
      return { complete: coversAllItems(), ids: ids.slice(offset, offset + limit), total: ids.length };
    },

    /**
     * Counts by extension and the state of the index at the time of the count. While an update is
     * read, gives the counts cached before it (null when there are none) and how long the update
     * has gone without progress, so the caller can turn to Eagle instead. Call only once ready.
     */
    async extensionCounts(filter: IndexFilter) {
      await refreshIfDue();
      const normalized = normalizeFilter(filter);
      const cacheKey = JSON.stringify(normalized);
      const cached = extensionCache.get(cacheKey);
      if (refreshing) return { status: "refreshing" as const, items: cached?.items ?? null, stalledForMs: Date.now() - refreshProgressAt };
      if (!coversAllItems()) return { status: "incomplete" as const, items: [] };
      if (cached?.version === version) return { status: "complete" as const, items: cached.items };
      const counts = new Map<string, number>();
      for (const item of items.values()) {
        if (item.ext && matchesFilter(item, normalized)) counts.set(item.ext, (counts.get(item.ext) || 0) + 1);
      }
      const result: Array<{ count: number; ext: string }> = sortedExtensionCounts(counts);
      extensionCache.delete(cacheKey);
      extensionCache.set(cacheKey, { items: result, version });
      while (extensionCache.size > MAX_CACHED_QUERIES) extensionCache.delete(extensionCache.keys().next().value!);
      return { status: "complete" as const, items: result };
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
      // Requests still in flight (a build or an update) see a newer run and drop their answers.
      buildRun += 1;
      items.clear();
      strings.clear();
      missing.clear();
      trashed.clear();
      unconfirmed.clear();
      unreadable.clear();
      sortedCache.clear();
      queryCache.clear();
      extensionCache.clear();
    },
  };
}

type LibraryIndex = ReturnType<typeof createLibraryIndex>;

interface LibraryIndexManagerOptions extends Omit<LibraryIndexOptions, "source"> {
  /** An index nobody has queried for this long is dropped to give the memory back. */
  idleMs?: number;
  /** Where an index for this library gets item metadata (see ItemSource). */
  sourceFor: (libraryPath: string) => ItemSource;
}

const DEFAULT_IDLE_MS = 30 * 60 * 1000;

// Eagle reports a library with or without a trailing separator; both name the same index.
function libraryKey(libraryPath: string) {
  return String(libraryPath || "").replace(/[\\/]+$/, "");
}

// Holds the index for the library open in Eagle: a different path replaces it, and an unused one
// is released after `idleMs`, to be rebuilt by the next sorted request.
function createLibraryIndexManager({ idleMs = DEFAULT_IDLE_MS, sourceFor, ...indexOptions }: LibraryIndexManagerOptions) {
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
        current = { index: createLibraryIndex(path, { ...indexOptions, source: sourceFor(path) }), path };
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
