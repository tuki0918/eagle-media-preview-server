const { appendFile, mkdir, readFile, rm, writeFile } = require("fs/promises");
const { tmpdir } = require("os");
const { join } = require("path");

// "browse" holds only failed requests; "system" is what the admin or the server itself did.
type AccessLogType = "auth" | "browse" | "edit" | "system" | "view";
type AccessLogRange = "1h" | "24h" | "7d";

interface AccessLogEntry {
  at: number;
  event: string;
  /** File type and size of the original a view served. */
  ext?: string;
  /** Which fields an edit or settings change touched; never their values. */
  fields?: string[];
  ip: string;
  itemId?: string;
  /** The library open in Eagle at the time, as the opaque id the viewer also uses. */
  libraryId?: string;
  method?: string;
  path?: string;
  size?: number;
  status?: number;
  type: AccessLogType;
  user?: string;
}

interface AccessLogBucket {
  auth: number;
  authFailures: number;
  browse: number;
  edit: number;
  editFailures: number;
  end: number;
  start: number;
  system: number;
  view: number;
  viewFailures: number;
}

// One row per address and signed-in user, so a shared address still shows who did what.
interface AccessLogClient {
  authFailures: number;
  editFailures: number;
  edits: number;
  ip: string;
  lastSeen: number;
  user: string;
  views: number;
}

interface AccessLogOptions {
  filePath?: string;
  flushDelayMs?: number;
  maxAgeMs?: number;
  maxEntries?: number;
  maxFileBytes?: number;
  now?: () => number;
}

const ACCESS_LOG_TYPES: AccessLogType[] = ["auth", "browse", "edit", "system", "view"];
// Viewers poll /api/health every few seconds, so anyone seen this recently is still connected.
const ACTIVE_CLIENT_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 20000;
const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_FLUSH_DELAY_MS = 500;
const MAX_PRESENCE_ENTRIES = 2000;
// The panel lists the most recently seen devices; the total is reported separately.
const MAX_SUMMARY_CLIENTS = 100;
const RANGE_BUCKETS: Record<AccessLogRange, { bucketMs: number; count: number }> = {
  "1h": { bucketMs: 5 * 60 * 1000, count: 12 },
  "24h": { bucketMs: 60 * 60 * 1000, count: 24 },
  "7d": { bucketMs: 24 * 60 * 60 * 1000, count: 7 },
};

// The log lives in the OS temp directory: it outlives a server stop or an Eagle restart for
// investigation, but is not meant to be kept, so a reboot (or the age limit) may drop it.
function defaultAccessLogPath() {
  return join(tmpdir(), "eagle-media-preview-server", "access-log.jsonl");
}

function createAccessLog({
  filePath = defaultAccessLogPath(),
  flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
  now = Date.now,
}: AccessLogOptions = {}) {
  let entries: AccessLogEntry[] = [];
  // Last heartbeat per address and user; polls are counted here instead of being written as entries.
  const presence = new Map<string, { ip: string; lastSeen: number; user: string }>();
  let pendingLines: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let fileBytes = 0;
  let loaded: Promise<void> | null = null;
  // Bumped by clear(). A write queued before it must not pick up events recorded after it: the
  // file removal queued by clear() would run next and delete them.
  let generation = 0;

  function prune() {
    const cutoff = now() - maxAgeMs;
    let start = 0;
    while (start < entries.length && entries[start].at < cutoff) start += 1;
    if (entries.length - start > maxEntries) start = entries.length - maxEntries;
    if (start > 0) entries = entries.slice(start);
  }

  function enqueueWrite(task: () => Promise<void>) {
    // A failed write only loses log lines; it never breaks the request that produced them.
    writeChain = writeChain.then(task).catch(() => {});
    return writeChain;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, flushDelayMs);
    flushTimer.unref?.();
  }

  // Memory already holds every entry still waiting to be appended, so those lines are dropped here;
  // appending them later as well would write them twice.
  function rewriteFromMemory() {
    const body = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
    const bodyBytes = Buffer.byteLength(body);
    pendingLines = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    return writeFile(filePath, body, "utf8").then(() => {
      fileBytes = bodyBytes;
    });
  }

  function load() {
    if (loaded) return loaded;
    const readIn = generation;
    // Restore and compact in one task, before any append can include this run's events.
    loaded = enqueueWrite(async () => {
      if (readIn !== generation) return;
      let text = "";
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        return;
      }
      if (readIn !== generation) return;
      const restored: AccessLogEntry[] = [];
      for (const line of text.split("\n")) {
        const entry = parseEntry(line);
        if (entry) restored.push(entry);
      }
      const before = entries.length;
      entries = [...restored, ...entries].sort((a, b) => a.at - b.at);
      prune();
      fileBytes = Buffer.byteLength(text);
      if (restored.length !== entries.length || before > 0) await rewriteFromMemory();
    });
    return loaded;
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pendingLines.length) return writeChain;
    const queuedIn = generation;
    void load();
    return enqueueWrite(async () => {
      if (queuedIn !== generation) return;
      // Lines are taken when this write runs, not when it is queued: an earlier rotation may have
      // already written them from memory, and taking them early would append them a second time.
      const lines = pendingLines;
      pendingLines = [];
      if (!lines.length) return;
      const chunk = lines.join("");
      const chunkBytes = Buffer.byteLength(chunk);
      await mkdir(join(filePath, ".."), { recursive: true });
      // Cleared while waiting: these lines were cleared too, and memory now holds only later events.
      if (queuedIn !== generation) return;
      if (fileBytes + chunkBytes > maxFileBytes) {
        // Rewrite from memory, which already holds the newest entries within the limits.
        prune();
        await rewriteFromMemory();
        return;
      }
      await appendFile(filePath, chunk, "utf8");
      fileBytes += chunkBytes;
    });
  }

  return {
    filePath,

    // Restores what an earlier run (or a previous plugin window) left in the temp file.
    load,

    record(input: Omit<AccessLogEntry, "at"> & { at?: number }) {
      const entry = compactEntry({ ...input, at: input.at ?? now() });
      entries.push(entry);
      if (entries.length > maxEntries + 1000) prune();
      // A refused request (blocked, failed sign-in, 4xx) is history, not proof the device is connected.
      if (entry.type !== "system" && (entry.status ?? 0) < 400) touch(entry.ip, entry.user || "", entry.at);
      pendingLines.push(`${JSON.stringify(entry)}\n`);
      scheduleFlush();
      return entry;
    },

    // Marks an address as connected without adding a log entry (status polls, thumbnails).
    touch,

    flush,

    async clear() {
      generation += 1;
      entries = [];
      presence.clear();
      pendingLines = [];
      await enqueueWrite(async () => {
        await rm(filePath, { force: true });
        fileBytes = 0;
      });
    },

    // Walks back from the newest entry, so a short page costs the same however large the log is.
    entries({ limit = 200, type = "" }: { limit?: number; type?: string } = {}) {
      prune();
      const output: AccessLogEntry[] = [];
      for (let index = entries.length - 1; index >= 0 && output.length < limit; index -= 1) {
        if (!type || entries[index].type === type) output.push(entries[index]);
      }
      return output;
    },

    // Cheap enough to poll every few seconds: it only reads the per-address heartbeat table.
    activeClients: countActiveAddresses,

    summary({ clientLimit = MAX_SUMMARY_CLIENTS, range = "24h" }: { clientLimit?: number; range?: AccessLogRange } = {}) {
      prune();
      const at = now();
      const { bucketMs, count } = RANGE_BUCKETS[range] || RANGE_BUCKETS["24h"];
      const lastStart = Math.floor(at / bucketMs) * bucketMs;
      const firstStart = lastStart - (count - 1) * bucketMs;
      const buckets: AccessLogBucket[] = Array.from({ length: count }, (_, index) => ({
        start: firstStart + index * bucketMs,
        end: firstStart + (index + 1) * bucketMs,
        auth: 0,
        authFailures: 0,
        browse: 0,
        edit: 0,
        editFailures: 0,
        system: 0,
        view: 0,
        viewFailures: 0,
      }));
      const clients = new Map<string, AccessLogClient>();
      const clientFor = (ip: string, user: string) => {
        const key = clientKey(ip, user);
        let client = clients.get(key);
        if (!client) {
          client = { authFailures: 0, editFailures: 0, edits: 0, ip, lastSeen: 0, user, views: 0 };
          clients.set(key, client);
        }
        return client;
      };
      const totals = { auth: 0, authFailures: 0, browse: 0, edit: 0, editFailures: 0, system: 0, view: 0, viewFailures: 0 };
      for (const entry of entries) {
        // Devices, tiles and chart all count the selected range only.
        if (entry.at < firstStart) continue;
        const bucket = buckets[Math.floor((entry.at - firstStart) / bucketMs)];
        if (!bucket) continue;
        // Logs from before browsing stopped being kept also hold successful requests.
        if (entry.type === "browse" && (entry.status ?? 0) < 400) continue;
        // Server and settings events come from this computer's panel, not from a device.
        if (entry.type === "system") {
          bucket.system += 1;
          totals.system += 1;
          continue;
        }
        const client = clientFor(entry.ip, entry.user || "");
        // A failed fetch is listed under Views but is not a view; a refused edit changed nothing.
        const failed = (entry.status ?? 0) >= 400;
        const failedView = entry.type === "view" && failed;
        const failedEdit = entry.type === "edit" && failed;
        client.lastSeen = Math.max(client.lastSeen, entry.at);
        if (entry.type === "view" && !failedView) client.views += 1;
        if (entry.type === "edit" && !failedEdit) client.edits += 1;
        if (failedEdit) client.editFailures += 1;
        if (isAuthFailure(entry)) client.authFailures += 1;
        if (failedView) {
          bucket.viewFailures += 1;
          totals.viewFailures += 1;
          continue;
        }
        if (failedEdit) {
          bucket.editFailures += 1;
          totals.editFailures += 1;
          continue;
        }
        bucket[entry.type] += 1;
        totals[entry.type] += 1;
        if (isAuthFailure(entry)) {
          bucket.authFailures += 1;
          totals.authFailures += 1;
        }
      }
      // Only a successful request or poll shows a row as connected; refused ones don't touch presence.
      const connected = new Set<string>();
      const connectedSignedIn = new Set<string>();
      for (const seen of presence.values()) {
        if (at - seen.lastSeen > ACTIVE_CLIENT_WINDOW_MS) continue;
        connected.add(clientKey(seen.ip, seen.user));
        if (seen.user) connectedSignedIn.add(seen.ip);
      }
      for (const seen of presence.values()) {
        if (seen.lastSeen < firstStart) continue;
        // A signed-in device also polls without a user before its session is read; that adds no row
        // while the address has a connected signed-in row. Otherwise the unsigned row is shown, so a
        // connected device always has a connected row.
        if (!seen.user && connectedSignedIn.has(seen.ip) && !clients.has(clientKey(seen.ip, ""))) continue;
        const client = clientFor(seen.ip, seen.user);
        client.lastSeen = Math.max(client.lastSeen, seen.lastSeen);
      }
      // Rows of one address stay together, ordered by that address's latest activity.
      const addressLastSeen = new Map<string, number>();
      for (const client of clients.values()) addressLastSeen.set(client.ip, Math.max(addressLastSeen.get(client.ip) || 0, client.lastSeen));
      const clientList = [...clients.values()]
        .map((client) => ({ ...client, active: connected.has(clientKey(client.ip, client.user)) }))
        .sort((a, b) => (addressLastSeen.get(b.ip) || 0) - (addressLastSeen.get(a.ip) || 0) || a.ip.localeCompare(b.ip) || b.lastSeen - a.lastSeen);
      return {
        activeClients: countActiveAddresses(),
        buckets,
        clientCount: clientList.length,
        clients: clientList.slice(0, clientLimit),
        range,
        totals,
      };
    },
  };

  // Counts addresses, not rows: one device signed in as two users is still one connection.
  function countActiveAddresses() {
    const cutoff = now() - ACTIVE_CLIENT_WINDOW_MS;
    const addresses = new Set<string>();
    for (const seen of presence.values()) {
      if (seen.lastSeen >= cutoff) addresses.add(seen.ip);
    }
    return addresses.size;
  }

  function touch(ip: string, user = "", at = now()) {
    if (!ip) return;
    const key = clientKey(ip, user);
    const previous = presence.get(key);
    // Re-inserting keeps the Map in least-recently-seen order, so the first key is the oldest.
    presence.delete(key);
    presence.set(key, { ip, lastSeen: Math.max(previous?.lastSeen || 0, at), user });
    if (presence.size > MAX_PRESENCE_ENTRIES) {
      // Forget the address seen longest ago; its entries still carry its history.
      const oldest = presence.keys().next().value;
      if (oldest !== undefined) presence.delete(oldest);
    }
  }
}

function clientKey(ip: string, user: string) {
  return `${ip}\u0000${user}`;
}

function isAuthFailure(entry: AccessLogEntry) {
  return entry.type === "auth" && (entry.event === "login_failure" || entry.event === "login_locked");
}

function compactEntry(entry: AccessLogEntry): AccessLogEntry {
  const output: AccessLogEntry = { at: entry.at, type: entry.type, event: String(entry.event || ""), ip: String(entry.ip || "unknown") };
  if (entry.user) output.user = String(entry.user).slice(0, 128);
  if (entry.method) output.method = String(entry.method);
  if (entry.path) output.path = String(entry.path).slice(0, 512);
  if (entry.itemId) output.itemId = String(entry.itemId);
  if (entry.libraryId) output.libraryId = String(entry.libraryId).slice(0, 64);
  if (Array.isArray(entry.fields) && entry.fields.length) output.fields = entry.fields.map((field) => String(field).slice(0, 64)).slice(0, 32);
  if (entry.ext) output.ext = String(entry.ext).slice(0, 16);
  if (typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size >= 0) output.size = entry.size;
  if (typeof entry.status === "number") output.status = entry.status;
  return output;
}

function parseEntry(line: string): AccessLogEntry | null {
  if (!line.trim()) return null;
  try {
    const value = JSON.parse(line);
    if (!value || typeof value.at !== "number" || !ACCESS_LOG_TYPES.includes(value.type)) return null;
    return compactEntry(value);
  } catch {
    return null;
  }
}

function accessLogCsv(entries: AccessLogEntry[]) {
  const columns: Array<keyof AccessLogEntry> = ["at", "type", "event", "ip", "user", "method", "path", "libraryId", "itemId", "fields", "ext", "size", "status"];
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    // User names and paths come from clients; a leading quote keeps a spreadsheet from running them as formulas.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };
  const value = (entry: AccessLogEntry, column: keyof AccessLogEntry) => {
    if (column === "at") return new Date(entry.at).toISOString();
    return column === "fields" ? entry.fields?.join(" ") : entry[column];
  };
  const rows = entries.map((entry) => columns.map((column) => cell(value(entry, column))).join(","));
  return `${columns.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

module.exports = {
  accessLogCsv,
  createAccessLog,
  defaultAccessLogPath,
};
