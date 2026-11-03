const { appendFile, mkdir, readFile, rm, writeFile } = require("fs/promises");
const { tmpdir } = require("os");
const { join } = require("path");

type AccessLogType = "auth" | "browse" | "edit" | "view";
type AccessLogRange = "1h" | "24h" | "7d";

interface AccessLogEntry {
  at: number;
  event: string;
  ip: string;
  itemId?: string;
  method?: string;
  path?: string;
  status?: number;
  type: AccessLogType;
  user?: string;
}

interface AccessLogBucket {
  auth: number;
  authFailures: number;
  browse: number;
  edit: number;
  end: number;
  start: number;
  view: number;
}

// One row per address and signed-in user, so a shared address still shows who did what.
interface AccessLogClient {
  authFailures: number;
  ip: string;
  lastSeen: number;
  requests: number;
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

const ACCESS_LOG_TYPES: AccessLogType[] = ["auth", "browse", "edit", "view"];
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

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const lines = pendingLines;
    pendingLines = [];
    if (!lines.length) return writeChain;
    return enqueueWrite(async () => {
      const chunk = lines.join("");
      await mkdir(join(filePath, ".."), { recursive: true });
      if (fileBytes + chunk.length > maxFileBytes) {
        // Rewrite from memory, which already holds the newest entries within the limits.
        prune();
        const body = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
        await writeFile(filePath, body, "utf8");
        fileBytes = body.length;
        return;
      }
      await appendFile(filePath, chunk, "utf8");
      fileBytes += chunk.length;
    });
  }

  return {
    filePath,

    // Restores what an earlier run (or a previous plugin window) left in the temp file.
    load() {
      if (loaded) return loaded;
      loaded = (async () => {
        let text = "";
        try {
          text = await readFile(filePath, "utf8");
        } catch {
          return;
        }
        const restored: AccessLogEntry[] = [];
        for (const line of text.split("\n")) {
          const entry = parseEntry(line);
          if (entry) restored.push(entry);
        }
        entries = [...restored, ...entries].sort((a, b) => a.at - b.at);
        prune();
        fileBytes = text.length;
        if (restored.length !== entries.length) {
          const body = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
          await enqueueWrite(async () => {
            await writeFile(filePath, body, "utf8");
            fileBytes = body.length;
          });
        }
      })();
      return loaded;
    },

    record(input: Omit<AccessLogEntry, "at"> & { at?: number }) {
      const entry = compactEntry({ ...input, at: input.at ?? now() });
      entries.push(entry);
      if (entries.length > maxEntries + 1000) prune();
      touch(entry.ip, entry.user || "", entry.at);
      pendingLines.push(`${JSON.stringify(entry)}\n`);
      scheduleFlush();
      return entry;
    },

    // Marks an address as connected without adding a log entry (status polls, thumbnails).
    touch,

    flush,

    async clear() {
      entries = [];
      presence.clear();
      pendingLines = [];
      fileBytes = 0;
      await enqueueWrite(() => rm(filePath, { force: true }));
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
        view: 0,
      }));
      const clients = new Map<string, AccessLogClient>();
      const clientFor = (ip: string, user: string) => {
        const key = clientKey(ip, user);
        let client = clients.get(key);
        if (!client) {
          client = { authFailures: 0, ip, lastSeen: 0, requests: 0, user, views: 0 };
          clients.set(key, client);
        }
        return client;
      };
      const totals = { auth: 0, authFailures: 0, browse: 0, edit: 0, view: 0 };
      for (const entry of entries) {
        const client = clientFor(entry.ip, entry.user || "");
        client.requests += 1;
        client.lastSeen = Math.max(client.lastSeen, entry.at);
        if (entry.type === "view") client.views += 1;
        if (isAuthFailure(entry)) client.authFailures += 1;
        if (entry.at < firstStart) continue;
        const bucket = buckets[Math.floor((entry.at - firstStart) / bucketMs)];
        if (!bucket) continue;
        bucket[entry.type] += 1;
        totals[entry.type] += 1;
        if (isAuthFailure(entry)) {
          bucket.authFailures += 1;
          totals.authFailures += 1;
        }
      }
      const signedInAddresses = new Set<string>();
      for (const client of clients.values()) if (client.user) signedInAddresses.add(client.ip);
      for (const seen of presence.values()) if (seen.user) signedInAddresses.add(seen.ip);
      for (const seen of presence.values()) {
        // Polls before sign-in carry no user; they don't add a row next to the address's signed-in rows.
        if (!seen.user && signedInAddresses.has(seen.ip) && !clients.has(clientKey(seen.ip, ""))) continue;
        const client = clientFor(seen.ip, seen.user);
        client.lastSeen = Math.max(client.lastSeen, seen.lastSeen);
      }
      // Rows of one address stay together, ordered by that address's latest activity.
      const addressLastSeen = new Map<string, number>();
      for (const client of clients.values()) addressLastSeen.set(client.ip, Math.max(addressLastSeen.get(client.ip) || 0, client.lastSeen));
      const clientList = [...clients.values()]
        .map((client) => ({ ...client, active: at - client.lastSeen <= ACTIVE_CLIENT_WINDOW_MS }))
        .sort((a, b) => (addressLastSeen.get(b.ip) || 0) - (addressLastSeen.get(a.ip) || 0) || a.ip.localeCompare(b.ip) || b.lastSeen - a.lastSeen);
      return {
        activeClients: countActiveAddresses(),
        bucketMs,
        buckets,
        clientCount: clientList.length,
        clients: clientList.slice(0, clientLimit),
        filePath,
        oldestAt: entries[0]?.at ?? null,
        range,
        retainedEntries: entries.length,
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
    presence.set(key, { ip, lastSeen: Math.max(previous?.lastSeen || 0, at), user });
    if (presence.size > MAX_PRESENCE_ENTRIES) {
      // Forget the addresses seen longest ago; their entries still carry their history.
      const oldest = [...presence.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (const [key] of oldest.slice(0, presence.size - MAX_PRESENCE_ENTRIES)) presence.delete(key);
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
  const columns: Array<keyof AccessLogEntry> = ["at", "type", "event", "ip", "user", "method", "path", "itemId", "status"];
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };
  const rows = entries.map((entry) => columns.map((column) => cell(column === "at" ? new Date(entry.at).toISOString() : entry[column])).join(","));
  return `${columns.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

module.exports = {
  accessLogCsv,
  createAccessLog,
  defaultAccessLogPath,
};
