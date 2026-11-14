// A read-only LibraryBackend that reads an Eagle library folder directly, without Eagle
// (docs/design/standalone-server.md, section 5). Every item's metadata.json is read once into
// memory, then kept current the way Eagle keeps its own cache: `mtime.json` maps each item id to its
// last change, so only items whose time changed are read again, and the `images/` folder is listed
// again only when Eagle's item count ("all") disagrees.
//
// What it answers follows Eagle's Web API (`item/get`, `item/query`, `folder/get`, `tag/get`, ...),
// so the viewer can't tell the two backends apart. Folders with a password are never shown, and
// neither is any item in one: reading the folder directly must not be a way around Eagle's lock.
const { readFile, readdir, realpath, stat } = require("fs").promises;
const { basename, isAbsolute, join, relative } = require("path");
const {
  ITEM_FIELDS,
  TAG_COVER_FIELDS,
  clampLimit,
  clampTagLimit,
  normalizeExtension,
  normalizeOffset,
  parseRatingFilter,
  resolveLibraryItemFile,
  sortedExtensionCounts,
} = require("./eagleClient.cjs");
const { DEFAULT_SORT_ORDER, comparatorFor, finiteNumber, matchesFilter, normalizeFilter } = require("./libraryIndex.cjs");

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
  keywords?: string | null;
  ratings?: number[];
  tags?: string[];
}

/** What filtering and sorting read (the shape libraryIndex.cts works with). */
interface IndexedItem {
  btime: number;
  duration: number;
  ext: string;
  folders: readonly string[];
  height: number;
  id: string;
  /** In the trash, or in a folder with a password: never listed or served. */
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

interface StoredItem {
  indexed: IndexedItem;
  /** The item's metadata.json as read. */
  raw: Record<string, unknown>;
}

interface FolderRecord {
  [key: string]: unknown;
  children?: unknown;
  id?: unknown;
  password?: unknown;
}

type StoreStatus = "building" | "failed" | "idle" | "ready";

interface FsBackendOptions {
  libraryPath: string;
  /** Shown to viewers; defaults to the folder name without `.library`. */
  name?: string;
  /** Serve a library last saved by an Eagle version this server doesn't know (see KNOWN_MAJOR_VERSIONS). */
  allowUnknownFormat?: boolean;
  /** How many metadata.json files are read at once while building. */
  readConcurrency?: number;
  /** How often a query may check mtime.json and the library's own files for changes. */
  refreshIntervalMs?: number;
  /** How long a query waits for an update in progress before answering from what is held. */
  refreshWaitMs?: number;
  /**
   * How often items left out for leading outside the library, and items mtime.json announced whose
   * folder wasn't there yet, are checked again, besides when their time in mtime.json changes:
   * mtime.json can arrive (from a sync, say) before the real files do.
   */
  recheckIntervalMs?: number;
  /**
   * A full listing of `images` (when Eagle's item count disagrees with what is held) runs at most
   * this often. It costs about a second per 300,000 items, more on a NAS.
   */
  rescanIntervalMs?: number;
  /** How long an item mtime.json announced, whose folder isn't there, is looked for. */
  awaitFolderMs?: number;
  /** How many cached answers are kept; each can hold every item. */
  maxCachedAnswers?: number;
  /** The clock, for tests. */
  now?: () => number;
}

/**
 * Why an item mtime.json lists (or the folder listing showed) isn't held:
 * - "unreadable": its folder is there but its metadata.json is missing or mid-write. Hidden, and
 *   its files refused, until it reads cleanly; tried again at every check.
 * - "gone": its folder isn't there. Eagle keeps the ids of deleted items in mtime.json for good, so
 *   it is skipped until its `time` in mtime.json changes; while `lookingSince` is set (announced
 *   recently, likely still syncing) it is also looked for every recheckIntervalMs.
 * - "outside": its folder or metadata.json leads outside the library. Never read; checked again
 *   when its time changes and every recheckIntervalMs (a link replaced by the real file comes back),
 *   and counted against Eagle's item count, which includes it.
 */
type Absence =
  | { kind: "unreadable" }
  | { kind: "gone"; lookingSince?: number; time: number }
  | { kind: "outside"; time: number };

// Library format versions (the major part of `applicationVersion` in the library's metadata.json)
// this backend was checked against. Another one may have moved or renamed what is read here.
const KNOWN_MAJOR_VERSIONS = ["4"];
const DEFAULT_READ_CONCURRENCY = 64;
const DEFAULT_REFRESH_INTERVAL_MS = 2000;
const DEFAULT_REFRESH_WAIT_MS = 1000;
const DEFAULT_RECHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_RESCAN_INTERVAL_MS = 60 * 1000;
// How long an item mtime.json announced, but whose folder isn't there, is looked for again. Eagle
// keeps the ids of deleted items in mtime.json, so one that never arrives is given up on.
const DEFAULT_AWAIT_FOLDER_MS = 60 * 60 * 1000;
const FAILED_RETRY_MS = 30 * 1000;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const EMPTY_LIST: readonly string[] = Object.freeze([]);
const IMPORT_ORDER: IndexSort = { key: "import", order: "desc" };
// Answers kept between changes: sorted lists, query and search results, folders, tags. Each query
// result can hold every item, so only the most recently used are kept.
const DEFAULT_MAX_CACHED_ANSWERS = 16;
// Paths in an item's metadata.json are never used: a library's metadata could point anywhere.
// Files are found in the item's own folder instead (see resolveItemFile).
const PATH_FIELDS = new Set(["fileURL", "filePath", "thumbnailPath", "thumbnailURL"]);
const OUTPUT_ITEM_FIELDS: readonly string[] = ITEM_FIELDS.filter((field: string) => !PATH_FIELDS.has(field));

class LibraryFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryFormatError";
  }
}

// A file whose real path isn't where it should be under the library folder.
class OutsideLibraryError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function libraryNameFromPath(path: string) {
  return basename(path).replace(/\.library$/i, "") || path;
}

function stringList(value: unknown, intern: (text: string) => string): readonly string[] {
  const list = Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry).map(intern) : [];
  return list.length ? list : EMPTY_LIST;
}

function project(raw: Record<string, unknown>, fields: readonly string[]) {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (raw[field] !== undefined) output[field] = raw[field];
  }
  return output;
}

function page<T>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
}

function hasPassword(folder: FolderRecord) {
  return typeof folder.password === "string" && folder.password !== "";
}

function folderChildren(folder: FolderRecord): FolderRecord[] {
  return Array.isArray(folder.children) ? folder.children.filter(isRecord) : [];
}

// Folders with a password, and every folder inside one.
function lockedFolderIds(folders: unknown[]) {
  const ids = new Set<string>();
  const walk = (list: FolderRecord[], locked: boolean) => {
    for (const folder of list) {
      const isLocked = locked || hasPassword(folder);
      if (isLocked && typeof folder.id === "string") ids.add(folder.id);
      walk(folderChildren(folder), isLocked);
    }
  };
  walk(folders.filter(isRecord), false);
  return ids;
}

// Eagle's search terms: words must all match, `-word` must not, `"two words"` matches as one, and
// words joined by OR (or |) need only one to match. Case is ignored.
function parseSearchQuery(query: string) {
  const tokens = query.match(/-?"[^"]*"|\S+/g) || [];
  const all: string[] = [];
  const none: string[] = [];
  const any: string[][] = [];
  const clean = (token: string) => token.replace(/"/g, "").toLowerCase();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "OR" || token === "|") continue;
    if (token.startsWith("-") && token.length > 1) {
      const word = clean(token.slice(1));
      if (word) none.push(word);
      continue;
    }
    const group = [clean(token)];
    while (tokens[index + 1] === "OR" || tokens[index + 1] === "|") {
      const next = tokens[index + 2];
      if (next === undefined) break;
      group.push(clean(next));
      index += 2;
    }
    const words = group.filter(Boolean);
    if (words.length > 1) any.push(words);
    else if (words.length) all.push(words[0]);
  }
  return { all, any, none };
}

function createFsBackend({
  libraryPath,
  name,
  allowUnknownFormat = false,
  readConcurrency = DEFAULT_READ_CONCURRENCY,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  refreshWaitMs = DEFAULT_REFRESH_WAIT_MS,
  recheckIntervalMs = DEFAULT_RECHECK_INTERVAL_MS,
  rescanIntervalMs = DEFAULT_RESCAN_INTERVAL_MS,
  awaitFolderMs = DEFAULT_AWAIT_FOLDER_MS,
  maxCachedAnswers = DEFAULT_MAX_CACHED_ANSWERS,
  now = Date.now,
}: FsBackendOptions) {
  const root = String(libraryPath || "").trim().replace(/[\\/]+$/, "");
  if (!root) throw new Error("libraryPath is required");
  const libraryName = String(name || "").trim() || libraryNameFromPath(root);
  const imagesDir = join(root, "images");
  const metadataPath = join(root, "metadata.json");
  const tagsPath = join(root, "tags.json");
  const mtimePath = join(root, "mtime.json");

  const items = new Map<string, StoredItem>();
  const strings = new Map<string, string>();
  const intern = (text: string) => {
    const existing = strings.get(text);
    if (existing !== undefined) return existing;
    strings.set(text, text);
    return text;
  };
  // Each item's time in mtime.json when it was last read; a different time means read it again.
  const readAt = new Map<string, number>();
  // Items mtime.json lists, or the folder listing showed, that aren't held, and why (see Absence).
  // Most are old deletions Eagle keeps in mtime.json, so it can be large and is never walked in
  // full on a check: the few ids a check acts on are indexed beside it. All changes go through
  // setAbsence, clearAbsence, and setLookingSince, which keep the indexes in step.
  const absent = new Map<string, Absence>();
  // Held back as unreadable: tried again at every check.
  const unreadableIds = new Set<string>();
  // Left out as outside, or gone and looked for: checked again every recheckIntervalMs.
  const recheckIds = new Set<string>();
  let outsideTotal = 0;

  function needsRecheck(entry: Absence) {
    return entry.kind === "outside" || (entry.kind === "gone" && entry.lookingSince !== undefined);
  }

  function clearAbsence(id: string) {
    const entry = absent.get(id);
    if (!entry) return;
    absent.delete(id);
    unreadableIds.delete(id);
    recheckIds.delete(id);
    if (entry.kind === "outside") outsideTotal -= 1;
  }

  function setAbsence(id: string, entry: Absence) {
    clearAbsence(id);
    absent.set(id, entry);
    if (entry.kind === "unreadable") unreadableIds.add(id);
    if (entry.kind === "outside") outsideTotal += 1;
    if (needsRecheck(entry)) recheckIds.add(id);
  }

  // Starts (a time) or stops (undefined) looking for a gone item.
  function setLookingSince(id: string, since: number | undefined) {
    const entry = absent.get(id);
    if (entry?.kind !== "gone") return;
    entry.lookingSince = since;
    if (needsRecheck(entry)) recheckIds.add(id);
    else recheckIds.delete(id);
  }

  function clearAbsences() {
    absent.clear();
    unreadableIds.clear();
    recheckIds.clear();
    outsideTotal = 0;
  }
  // mtime.json as last read, for the times of items read again outside a change to it.
  let lastTimes: Record<string, unknown> | null = null;
  let library: Record<string, unknown> = {};
  let folders: unknown[] = [];
  let lockedFolders = new Set<string>();
  let starredTags: string[] = [];
  let status: StoreStatus = "idle";
  let lastError: Error | null = null;
  let failedAt = 0;
  let building: Promise<void> | null = null;
  let refreshing: Promise<void> | null = null;
  let lastRefreshCheck = 0;
  // When items left out ("outside", or "gone" and looked for) were last checked again on their own.
  let lastRecheck = now();
  // A full listing of `images` is due (Eagle's item count disagrees with what is held), and when the
  // last one ran. It runs at most every rescanIntervalMs, and stays due while the counts disagree:
  // an item folder still syncing can arrive later without mtime.json changing again.
  let rescanDue = false;
  let lastRescan = 0;
  let loaded = 0;
  let total = 0;
  let disposed = false;
  const signatures = { metadata: "", tags: "", mtime: "" };
  // The library folder's real path, found when the library is first read. Every file read or
  // served must really be where it is expected under it: a link anywhere on the way (the library's
  // own files, `images`, an item folder, an item's metadata.json) could lead outside the library.
  let realRoot = "";

  // Cached answers (sorted lists, query and search results, folders, tags) for the current version
  // only, most recently used last. Any change bumps the version, which drops them all at once, so
  // a list never shows an item whose files are already refused.
  let version = 0;
  const caches = new Map<string, unknown>();
  let cachesVersion = version;

  function changed() {
    version += 1;
  }

  function cached<T>(key: string, compute: () => T): T {
    if (cachesVersion !== version) {
      caches.clear();
      cachesVersion = version;
    }
    if (caches.has(key)) {
      const value = caches.get(key) as T;
      caches.delete(key);
      caches.set(key, value);
      return value;
    }
    const value = compute();
    caches.set(key, value);
    while (caches.size > maxCachedAnswers) caches.delete(caches.keys().next().value!);
    return value;
  }

  // --- Reading the library's files ---------------------------------------------------------------

  async function signature(path: string) {
    try {
      const info = await stat(path);
      return `${info.mtimeMs}:${info.size}`;
    } catch {
      return "";
    }
  }

  // Reads a JSON file of this library, only if its real path is exactly where `parts` say under the
  // library folder. Rejects with OutsideLibraryError otherwise, and as readFile does when missing.
  async function readLibraryJson(...parts: string[]) {
    if (!realRoot) realRoot = await realpath(root);
    const real = await realpath(join(root, ...parts));
    if (real !== join(realRoot, ...parts)) throw new OutsideLibraryError(`${join(root, ...parts)} leads outside the library`);
    return JSON.parse(await readFile(real, "utf8"));
  }

  // The library's own metadata.json: folders, smart folders, tag groups, and the format version.
  async function readLibraryMetadata() {
    const sig = await signature(metadataPath);
    let value: unknown;
    try {
      value = await readLibraryJson("metadata.json");
    } catch (error) {
      // A metadata.json that leads elsewhere isn't this library's: it is never read.
      if (error instanceof OutsideLibraryError) throw new LibraryFormatError(error.message);
      throw error;
    }
    if (!isRecord(value)) throw new LibraryFormatError(`${metadataPath} is not a library metadata file`);
    const appVersion = typeof value.applicationVersion === "string" ? value.applicationVersion : "";
    if (!allowUnknownFormat && !KNOWN_MAJOR_VERSIONS.includes(appVersion.split(".")[0])) {
      throw new LibraryFormatError(
        `This library was saved by Eagle ${appVersion || "(unknown version)"}, a format this server hasn't been checked against. ` +
        "Update the server, or start it with --allow-unknown-format to try anyway.",
      );
    }
    library = value;
    folders = Array.isArray(value.folders) ? value.folders : [];
    lockedFolders = lockedFolderIds(folders);
    signatures.metadata = sig;
  }

  async function readTagsFile() {
    const sig = await signature(tagsPath);
    try {
      const value = await readLibraryJson("tags.json");
      starredTags = isRecord(value) && Array.isArray(value.starredTags)
        ? value.starredTags.filter((tag): tag is string => typeof tag === "string")
        : [];
    } catch {
      starredTags = [];
    }
    signatures.tags = sig;
  }

  async function readMtimeFile(): Promise<Record<string, unknown> | null> {
    const sig = await signature(mtimePath);
    if (!sig) return null;
    try {
      const value = await readLibraryJson("mtime.json");
      if (!isRecord(value)) return null;
      signatures.mtime = sig;
      lastTimes = value;
      return value;
    } catch {
      // Mid-write: read again at the next check.
      return null;
    }
  }

  async function listItemIds() {
    const entries: string[] = await readdir(imagesDir);
    return entries
      .filter((entry) => entry.endsWith(".info"))
      .map((entry) => entry.slice(0, -".info".length))
      .filter((id) => ITEM_ID_PATTERN.test(id));
  }

  // --- Items -------------------------------------------------------------------------------------

  function indexedItem(id: string, raw: Record<string, unknown>): IndexedItem {
    const itemFolders = stringList(raw.folders, intern);
    return {
      btime: finiteNumber(raw.btime),
      duration: finiteNumber(raw.duration),
      ext: intern(normalizeExtension(raw.ext)),
      folders: itemFolders,
      height: finiteNumber(raw.height),
      id,
      isDeleted: unreadableIds.has(id) || raw.isDeleted === true || itemFolders.some((folder) => lockedFolders.has(folder)),
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

  function timeIn(times: Record<string, unknown> | null, id: string) {
    const time = times && id in times ? Number(times[id]) : NaN;
    return Number.isFinite(time) ? time : NaN;
  }

  // Reads one item (its time in mtime.json is `time`, NaN when unknown) and records the outcome:
  // held, held back as unreadable, or left out as gone or outside (see Absence).
  async function readItem(id: string, time: number) {
    try {
      const raw = await readLibraryJson("images", `${id}.info`, "metadata.json");
      if (!isRecord(raw) || raw.id !== id) return holdBack(id);
      clearAbsence(id);
      items.set(id, { indexed: indexedItem(id, raw), raw });
      if (Number.isFinite(time)) readAt.set(id, time);
      changed();
    } catch (error) {
      if (error instanceof OutsideLibraryError) return leaveOut(id, "outside", time);
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        try {
          if ((await stat(join(imagesDir, `${id}.info`))).isDirectory()) return holdBack(id);
        } catch {
          return leaveOut(id, "gone", time);
        }
      }
      holdBack(id);
    }
  }

  // Missing or mid-write metadata: hidden (and its files refused) until it reads cleanly, since the
  // edit being written may be a move to the trash. Tried again at every check.
  function holdBack(id: string) {
    setAbsence(id, { kind: "unreadable" });
    const stored = items.get(id);
    if (stored) stored.indexed = indexedItem(id, stored.raw);
    changed();
  }

  function leaveOut(id: string, kind: "gone" | "outside", time: number) {
    const previous = absent.get(id);
    setAbsence(id, kind === "gone"
      ? { kind, time, lookingSince: previous?.kind === "gone" ? previous.lookingSince : undefined }
      : { kind, time });
    items.delete(id);
    readAt.delete(id);
    changed();
  }

  async function readItems(ids: readonly string[], times: Record<string, unknown> | null, onRead?: () => void) {
    let next = 0;
    const worker = async () => {
      while (next < ids.length && !disposed) {
        const id = ids[next++];
        await readItem(id, timeIn(times, id));
        if (disposed) return;
        onRead?.();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(readConcurrency, ids.length)) }, worker));
  }

  // Starts looking again, every recheckIntervalMs for up to awaitFolderMs, for an item mtime.json
  // announced recently whose folder isn't there: a sync can deliver mtime.json first, and Eagle's
  // item count can't tell when another item was deleted in the same sync.
  function lookFor(id: string) {
    const entry = absent.get(id);
    if (entry?.kind === "gone" && entry.lookingSince === undefined) setLookingSince(id, now());
  }

  function lookedFor(id: string) {
    const entry = absent.get(id);
    return entry?.kind === "gone" && entry.lookingSince !== undefined;
  }

  // Ids `times` lists (or just `ids`) that weren't read: a folder never listed, or listed but gone
  // before it was read. Eagle keeps the ids of deleted items in mtime.json for good, so most are old
  // deletions, left out until their time changes; one changed within awaitFolderMs is likely still
  // syncing, and is looked for.
  function noteMissingFolders(times: Record<string, unknown> | null, ids: Iterable<string> = Object.keys(times || {})) {
    if (!times) return;
    for (const id of ids) {
      if (id === "all" || !ITEM_ID_PATTERN.test(id) || !(id in times) || items.has(id)) continue;
      const entry = absent.get(id);
      // Held back as unreadable or left out as outside: its folder is there.
      if (entry && entry.kind !== "gone") continue;
      const time = timeIn(times, id);
      if (entry) entry.time = time;
      else setAbsence(id, { kind: "gone", time });
      if (Number.isFinite(time) && Math.abs(now() - time) <= awaitFolderMs) lookFor(id);
    }
  }

  // Whether Eagle's item count ("all" in mtime.json) differs from the items held (and those left
  // out as outside the library, which Eagle counts but this backend never reads).
  function countsDisagree(times: Record<string, unknown> | null) {
    const count = Number(times?.all);
    return Number.isFinite(count) && count !== items.size + outsideTotal;
  }

  // --- Reading the library, and keeping up with it ------------------------------------------------

  async function build() {
    status = "building";
    try {
      realRoot = await realpath(root);
      await readLibraryMetadata();
      // Items are listed from `images`, which must be the library's own folder, not a link elsewhere.
      if ((await realpath(imagesDir)) !== join(realRoot, "images")) {
        throw new LibraryFormatError(`${imagesDir} leads outside the library, so the library isn't served`);
      }
      await readTagsFile();
      const times = await readMtimeFile();
      const ids = await listItemIds();
      items.clear();
      readAt.clear();
      clearAbsences();
      rescanDue = false;
      loaded = 0;
      total = ids.length;
      await readItems(ids, times, () => {
        loaded += 1;
      });
      lastRefreshCheck = now();
      noteMissingFolders(times);
      // A folder still syncing when the library is read is looked for again later.
      rescanDue = countsDisagree(times);
      changed();
      status = "ready";
      lastError = null;
    } catch (error) {
      status = "failed";
      failedAt = now();
      lastError = error instanceof Error ? error : new Error(String(error));
      throw lastError;
    }
  }

  function ensureBuilding() {
    if (!building || (status === "failed" && now() - failedAt >= FAILED_RETRY_MS)) {
      building = build();
      building.catch(() => {});
    }
    return building;
  }

  async function waitAtMost(promise: Promise<unknown>, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([promise.catch(() => {}), new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }

  // The library's metadata.json (folders, locks, format) and tags.json, when they changed. Returns
  // false when the format is no longer one this backend knows, which stops it.
  async function refreshLibraryFiles() {
    const metadataSig = await signature(metadataPath);
    if (metadataSig && metadataSig !== signatures.metadata) {
      try {
        await readLibraryMetadata();
        // Locked folders may have changed: which items are hidden is worked out again, at once.
        for (const [id, stored] of items) stored.indexed = indexedItem(id, stored.raw);
        changed();
      } catch (error) {
        // Mid-write: read again at the next check. A format change stops the backend.
        if (error instanceof LibraryFormatError) {
          status = "failed";
          lastError = error;
          failedAt = now();
          return false;
        }
      }
    }
    if ((await signature(tagsPath)) !== signatures.tags) {
      await readTagsFile();
      changed();
    }
    return true;
  }

  // Items held back as unreadable, at every check; items left out as outside, or gone and looked
  // for, every recheckIntervalMs. Their real paths are checked again, so one still outside (or
  // still missing) is simply left out again.
  async function retryAbsent() {
    if (unreadableIds.size) await readItems([...unreadableIds], lastTimes);
    if (!recheckIds.size || now() - lastRecheck < recheckIntervalMs) return;
    for (const id of [...recheckIds]) {
      const entry = absent.get(id);
      if (entry?.kind === "gone" && entry.lookingSince !== undefined && now() - entry.lookingSince > awaitFolderMs) setLookingSince(id, undefined);
    }
    const recheck = [...recheckIds];
    if (!recheck.length) return;
    lastRecheck = now();
    await readItems(recheck, lastTimes);
    // An item that arrived may make the counts disagree now (another one deleted meanwhile).
    if (countsDisagree(lastTimes)) rescanDue = true;
  }

  // Items whose time in mtime.json changed since they were read (or left out).
  async function readChanges() {
    const mtimeSig = await signature(mtimePath);
    if (!mtimeSig || mtimeSig === signatures.mtime) return;
    const times = await readMtimeFile();
    if (!times) return;
    const wanted = Object.keys(times).filter((id) => {
      if (id === "all" || !ITEM_ID_PATTERN.test(id)) return false;
      const time = timeIn(times, id);
      const entry = absent.get(id);
      // Left out (gone or outside): read again only once its time has changed since.
      if (entry && entry.kind !== "unreadable") return entry.time !== time;
      return readAt.get(id) !== time;
    });
    if (wanted.length) {
      await readItems(wanted, times);
      // Announced, but no folder yet: looked for, and the folder listed once more, since a deletion
      // in the same sync can leave Eagle's count matching what is held.
      const missing = wanted.filter((id) => absent.get(id)?.kind === "gone");
      for (const id of missing) lookFor(id);
      if (missing.length) rescanDue = true;
    }
    if (countsDisagree(times)) rescanDue = true;
  }

  // A full listing of `images`, at most every rescanIntervalMs, while it is due.
  async function rescanIfDue() {
    if (!rescanDue || now() - lastRescan < rescanIntervalMs) return;
    lastRescan = now();
    const ids = await listItemIds();
    const present = new Set(ids);
    for (const id of [...items.keys()]) {
      if (present.has(id)) continue;
      items.delete(id);
      readAt.delete(id);
      clearAbsence(id);
      changed();
    }
    const added = ids.filter((id) => !items.has(id) && absent.get(id)?.kind !== "outside");
    if (added.length) await readItems(added, lastTimes);
    // Listed, but gone before it was read: looked for like any recently announced item.
    noteMissingFolders(lastTimes, added);
    rescanDue = countsDisagree(lastTimes);
  }

  async function refresh() {
    if (!(await refreshLibraryFiles())) return;
    await retryAbsent();
    await readChanges();
    await rescanIfDue();
  }

  // At most every refreshIntervalMs, checks the library for changes; waits for that at most
  // refreshWaitMs, then answers from what is held while the update carries on.
  async function current() {
    await ensureBuilding();
    if (status === "failed" && lastError) throw lastError;
    if (!refreshing && now() - lastRefreshCheck >= refreshIntervalMs) {
      lastRefreshCheck = now();
      refreshing = refresh().finally(() => {
        refreshing = null;
      });
      refreshing.catch(() => {});
    }
    if (refreshing) await waitAtMost(refreshing, refreshWaitMs);
    if (status === "failed" && lastError) throw lastError;
  }

  // --- Answers -----------------------------------------------------------------------------------

  function visibleSorted(sort: IndexSort): IndexedItem[] {
    return cached(`sorted:${sort.key}:${sort.order}`, () => {
      const list = [...items.values()].map((stored) => stored.indexed).filter((item) => !item.isDeleted);
      list.sort(comparatorFor(sort.key));
      if (sort.order !== DEFAULT_SORT_ORDER[sort.key]) list.reverse();
      return list;
    });
  }

  function visibleItem(id: string) {
    const stored = items.get(String(id || ""));
    return stored && !stored.indexed.isDeleted ? stored : null;
  }

  function filtered(filter: IndexFilter, sort: IndexSort = IMPORT_ORDER) {
    const normalized = normalizeFilter(filter);
    return cached(`query:${JSON.stringify([normalized, sort])}`, () => visibleSorted(sort).filter((item) => matchesFilter(item, normalized)));
  }

  function outputItems(list: readonly IndexedItem[], fields: readonly string[] = OUTPUT_ITEM_FIELDS) {
    return list.map((item) => project(items.get(item.id)!.raw, fields));
  }

  // Items directly in each folder, as Eagle counts them for `imageCount`.
  function folderCounts() {
    return cached("folderCounts", () => {
      const counts = new Map<string, number>();
      for (const item of visibleSorted(IMPORT_ORDER)) {
        for (const folder of item.folders) counts.set(folder, (counts.get(folder) || 0) + 1);
      }
      return counts;
    });
  }

  // The folder tree without locked folders, without password fields, and with item counts.
  function visibleFolders() {
    return cached("folders", () => {
      const counts = folderCounts();
      const map = (list: FolderRecord[]): Record<string, unknown>[] => list
        .filter((folder) => !(typeof folder.id === "string" && lockedFolders.has(folder.id)))
        .map((folder) => {
          const { password: _password, passwordTips: _tips, children, ...rest } = folder;
          return {
            ...rest,
            imageCount: typeof folder.id === "string" ? counts.get(folder.id) || 0 : 0,
            children: map(folderChildren({ children })),
          };
        });
      return map(folders.filter(isRecord));
    });
  }

  function folderSearchText() {
    return cached("folderText", () => {
      const text = new Map<string, string>();
      const walk = (list: FolderRecord[]) => {
        for (const folder of list) {
          if (typeof folder.id === "string" && !lockedFolders.has(folder.id)) {
            text.set(folder.id, [folder.name, folder.description].filter((part) => typeof part === "string" && part).join(" "));
          }
          walk(folderChildren(folder));
        }
      };
      walk(folders.filter(isRecord));
      return text;
    });
  }

  function tagGroups(): Record<string, unknown>[] {
    return Array.isArray(library.tagsGroups) ? library.tagsGroups.filter(isRecord) : [];
  }

  function tagRecords() {
    return cached("tags", () => {
      const counts = new Map<string, number>();
      for (const item of visibleSorted(IMPORT_ORDER)) {
        for (const tag of item.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
      }
      const groupsOf = new Map<string, string[]>();
      for (const group of tagGroups()) {
        if (typeof group.id !== "string" || !Array.isArray(group.tags)) continue;
        for (const tag of group.tags) {
          if (typeof tag === "string") groupsOf.set(tag, [...(groupsOf.get(tag) || []), group.id]);
        }
      }
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      return [...counts.entries()]
        .sort(([left], [right]) => collator.compare(left, right))
        .map(([tagName, count]) => ({ name: tagName, count, imageCount: count, groups: groupsOf.get(tagName) || [] }));
    });
  }

  function searchText(item: IndexedItem) {
    const raw = items.get(item.id)!.raw;
    const folderText = folderSearchText();
    const parts: unknown[] = [raw.name, raw.annotation, item.ext ? `.${item.ext}` : "", raw.url, ...item.tags];
    for (const folder of item.folders) parts.push(folderText.get(folder));
    if (Array.isArray(raw.comments)) {
      for (const comment of raw.comments) if (isRecord(comment)) parts.push(comment.annotation);
    }
    return parts.filter((part) => typeof part === "string" && part).join(" ").toLowerCase();
  }

  function scopeFilter({ folderId, isUnfiled = false, isUntagged = false }: { folderId?: unknown; isUnfiled?: boolean; isUntagged?: boolean }): IndexFilter {
    return isUnfiled ? { isUnfiled: true } : isUntagged ? { isUntagged: true } : folderId ? { folderId: String(folderId) } : {};
  }

  // A sort index over the items already in memory, shaped like libraryIndex.cts's, so the server's
  // Advanced Sort (orders, filters, item types) works without asking Eagle anything.
  const sortIndex = {
    get status() {
      return status;
    },
    progress() {
      return { loaded, total };
    },
    coversAllItems() {
      return true;
    },
    async whenReady(waitMs: number) {
      if (status === "ready") return true;
      await waitAtMost(ensureBuilding(), waitMs);
      return (status as StoreStatus) === "ready";
    },
    async query(filter: IndexFilter, sort: IndexSort, offset: number, limit: number) {
      await current();
      const list = filtered(filter, sort);
      return { complete: true, ids: list.slice(offset, offset + limit).map((item) => item.id), total: list.length };
    },
    async extensionCounts(filter: IndexFilter) {
      await current();
      const counts = new Map<string, number>();
      for (const item of filtered(filter)) if (item.ext) counts.set(item.ext, (counts.get(item.ext) || 0) + 1);
      return { status: "complete" as const, items: sortedExtensionCounts(counts) as Array<{ count: number; ext: string }> };
    },
    noteItem() {},
    markStale() {
      lastRefreshCheck = 0;
    },
    dispose() {},
  };

  const libraryKey = root;
  const sortIndexes = {
    forLibrary() {
      return sortIndex;
    },
    loaded(path?: string) {
      if (path !== undefined && String(path).replace(/[\\/]+$/, "") !== libraryKey) return null;
      return status === "idle" ? null : sortIndex;
    },
    release() {},
  };

  return {
    kind: "fs" as const,
    libraryPath: root,
    name: libraryName,
    sortIndexes,

    /** Reads the whole library; rejects when it can't be read or its format isn't known. */
    async open() {
      await current();
    },

    /** Where reading the library stands, without waiting for it. */
    state() {
      return { status, loaded, total, error: status === "failed" && lastError ? lastError.message : "" };
    },

    /** Counts of what is held, for diagnostics and tests. */
    stats() {
      const counts = { unreadable: 0, gone: 0, lookedFor: 0, outside: 0 };
      for (const [id, entry] of absent) {
        counts[entry.kind] += 1;
        if (lookedFor(id)) counts.lookedFor += 1;
      }
      return {
        items: items.size,
        cachedAnswers: cachesVersion === version ? caches.size : 0,
        ...counts,
        // What a check acts on, from the indexes kept beside the record (they must agree with it).
        indexed: { unreadable: unreadableIds.size, recheck: recheckIds.size, outside: outsideTotal },
      };
    },

    // Answers at once, even while the library is read: which library a request is for never
    // waits on reading it, and status checks stay quick.
    async libraryInfo() {
      return {
        path: root,
        name: libraryName,
        applicationVersion: library.applicationVersion,
        modificationTime: library.modificationTime,
      };
    },
    lastLibraryInfo() {
      return { path: root, name: libraryName };
    },
    clearLibraryInfo() {},

    // No Eagle behind this server; the viewer only needs to know the server is reachable.
    async appInfo() {
      return { standalone: true, platform: process.platform };
    },

    async folders() {
      await current();
      const tree = visibleFolders();
      return { items: tree, total: tree.length, offset: 0, limit: tree.length };
    },

    // Smart folder rules are evaluated only by Eagle for now (design section 5.4).
    async smartFolders() {
      await current();
      return { items: [], total: 0, offset: 0, limit: 0 };
    },
    async smartFolderItems() {
      await current();
      return { items: [], total: 0, offset: 0, limit: 0 };
    },

    // Eagle's item/get: newest first (date added). Several ratings are listed as consecutive
    // groups, highest first and "no rating" last, as the Eagle client pages them.
    async listItems({ offset = 0, limit = 30, folderId, isUntagged = false, isUnfiled = false, ext, rating, keywords, tags }: {
      ext?: unknown;
      folderId?: unknown;
      isUnfiled?: boolean;
      isUntagged?: boolean;
      keywords?: unknown;
      limit?: unknown;
      offset?: unknown;
      rating?: unknown;
      tags?: unknown;
    } = {}) {
      await current();
      const ratings: number[] = parseRatingFilter(rating);
      const cleanTags = (Array.isArray(tags) ? tags : [tags]).map((tag) => String(tag || "").trim()).filter(Boolean);
      const keywordText = Array.isArray(keywords) ? keywords.join(" ") : keywords ? String(keywords) : "";
      let list = filtered({
        ...scopeFilter({ folderId, isUnfiled, isUntagged }),
        ext: ext ? String(ext) : "",
        keywords: keywordText,
        ratings,
        tags: cleanTags,
      });
      if (ratings.length > 1) list = ratings.flatMap((value) => list.filter((item) => item.star === value));
      const result = page(list, normalizeOffset(offset), clampLimit(limit));
      return { ...result, items: outputItems(result.items) };
    },

    // Eagle's item/query, over the same text Eagle searches: name, notes, extension, URL, tags,
    // folder names and descriptions, and comments.
    async searchItems({ query, offset = 0, limit = 30 }: { limit?: unknown; offset?: unknown; query: string }) {
      await current();
      const terms = parseSearchQuery(String(query || ""));
      const empty = !terms.all.length && !terms.any.length && !terms.none.length;
      const list = cached(`search:${JSON.stringify(terms)}`, () => visibleSorted(IMPORT_ORDER).filter((item) => {
        if (empty) return true;
        const text = searchText(item);
        return terms.all.every((word) => text.includes(word))
          && terms.none.every((word) => !text.includes(word))
          && terms.any.every((group) => group.some((word) => text.includes(word)));
      }));
      const result = page(list, normalizeOffset(offset), clampLimit(limit));
      return { ...result, items: outputItems(result.items) };
    },

    // Eagle's item/get by id answers a list: the item, or nothing for one in the trash.
    async itemById(id: string) {
      await current();
      const stored = visibleItem(id);
      return stored ? [project(stored.raw, OUTPUT_ITEM_FIELDS)] : [];
    },

    async itemsByIds(ids: string[]) {
      await current();
      return ids.map((id) => visibleItem(id)).filter((stored): stored is StoredItem => stored !== null).map((stored) => project(stored.raw, OUTPUT_ITEM_FIELDS));
    },

    /** False for an item in the trash, in a locked folder, or not read yet, so its file is never served. */
    async isItemServable(id: string) {
      await current();
      return visibleItem(id) !== null;
    },

    /**
     * The file to serve for an item, or "" when there is none or it may not be served. Only a file
     * whose real path (links resolved) is inside the item's own folder in this library's `images/`
     * is served; the folder itself must be a real folder there, not a link elsewhere.
     */
    async resolveItemFile(id: string, kind: "file" | "thumb") {
      await current();
      const stored = visibleItem(id);
      if (!stored) return "";
      try {
        // Measured from the library's own folder: `images` and the item folder must both really be
        // there, not links elsewhere (a link would make its target the allowed area).
        const itemDir = join(realRoot || await realpath(root), "images", `${stored.indexed.id}.info`);
        const candidate = await resolveLibraryItemFile({ libraryPath: root, item: { id: stored.indexed.id, ext: stored.raw.ext }, kind });
        if (!candidate) return "";
        const real = await realpath(candidate);
        const inside = relative(itemDir, real);
        if (!inside || inside.startsWith("..") || isAbsolute(inside)) return "";
        return (await stat(real)).isFile() ? real : "";
      } catch {
        return "";
      }
    },

    async itemExtensions(options: { folderId?: unknown; isUnfiled?: boolean; isUntagged?: boolean } = {}) {
      await current();
      const counts = new Map<string, number>();
      for (const item of filtered(scopeFilter(options))) if (item.ext) counts.set(item.ext, (counts.get(item.ext) || 0) + 1);
      return sortedExtensionCounts(counts);
    },

    // Thumbnails are found in the item's folder by the media code.
    async legacyThumbnailPath() {
      return "";
    },

    async listTags({ query = "", offset = 0, limit = 20 }: { limit?: unknown; offset?: unknown; query?: unknown } = {}) {
      await current();
      const search = String(query || "").trim().toLowerCase();
      const list = search ? tagRecords().filter((tag) => tag.name.toLowerCase().includes(search)) : tagRecords();
      return page(list, normalizeOffset(offset), clampTagLimit(limit));
    },

    async tagOverview() {
      await current();
      const tags = tagRecords();
      const byName = new Map(tags.map((tag) => [tag.name, tag]));
      return {
        tags,
        groups: tagGroups(),
        starred: starredTags.map((tag) => byName.get(tag)).filter((tag) => tag !== undefined),
      };
    },

    async tagCoverItem(tag: string) {
      const tagName = String(tag || "").trim();
      if (!tagName) throw new Error("tag is required");
      await current();
      const item = visibleSorted(IMPORT_ORDER).find((entry) => entry.tags.includes(tagName));
      return item ? project(items.get(item.id)!.raw, TAG_COVER_FIELDS) : null;
    },

    async dispose() {
      disposed = true;
      items.clear();
      strings.clear();
      readAt.clear();
      clearAbsences();
      caches.clear();
    },
  };
}

module.exports = { KNOWN_MAJOR_VERSIONS, LibraryFormatError, createFsBackend, parseSearchQuery };
