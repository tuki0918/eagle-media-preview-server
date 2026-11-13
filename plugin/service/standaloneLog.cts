// Prints the standalone server's access log: as it is written (`--follow`), or from the file,
// from another terminal (`eagle-media-server logs [-f]`). The file is JSON lines, one entry each,
// in the format of accessLog.cts, which the plugin's Activity panel uses too.
const { open, stat } = require("fs").promises;

interface LogEntry {
  at?: number;
  event?: string;
  ext?: string;
  fields?: string[];
  ip?: string;
  itemId?: string;
  libraryId?: string;
  method?: string;
  path?: string;
  size?: number;
  status?: number;
  type?: string;
  user?: string;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function timestamp(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** One line per entry: time, kind, status, who, library, and what. */
function formatLogEntry(entry: LogEntry, libraryNames: ReadonlyMap<string, string> = new Map()) {
  const who = entry.user ? `${entry.user}@${entry.ip || "?"}` : entry.ip || "-";
  const library = entry.libraryId ? libraryNames.get(entry.libraryId) || entry.libraryId : "-";
  const what = [
    entry.event,
    entry.method && entry.path ? `${entry.method} ${entry.path}` : entry.path,
    entry.itemId ? `item ${entry.itemId}` : "",
    entry.ext ? `.${entry.ext}` : "",
    typeof entry.size === "number" ? formatSize(entry.size) : "",
    entry.fields?.length ? `(${entry.fields.join(", ")})` : "",
  ].filter(Boolean).join("  ");
  return [
    timestamp(entry.at ?? Date.now()),
    String(entry.type || "").padEnd(6),
    entry.status ? String(entry.status) : "   ",
    who.padEnd(22),
    library.padEnd(12),
    what,
  ].join("  ");
}

function parseLine(line: string): LogEntry | null {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Prints the last `lines` entries of the log file, then, with `follow`, each entry added to it
 * until `signal` aborts. A file rewritten shorter (the log trims itself) is read from its start.
 */
async function printLogFile(filePath: string, { follow = false, lines = 50, libraryNames = new Map<string, string>(), print = console.log, pollMs = 500, signal }: {
  follow?: boolean;
  libraryNames?: ReadonlyMap<string, string>;
  lines?: number;
  pollMs?: number;
  print?: (line: string) => void;
  signal?: AbortSignal;
} = {}) {
  let offset = 0;
  let partial = "";
  let first = true;

  const readFrom = async () => {
    let size = 0;
    try {
      size = (await stat(filePath)).size;
    } catch {
      return; // Not written yet.
    }
    if (size < offset) {
      offset = 0;
      partial = "";
    }
    if (size === offset) return;
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(size - offset);
      await handle.read(buffer, 0, buffer.length, offset);
      offset = size;
      const text = partial + buffer.toString("utf8");
      const parts = text.split("\n");
      partial = parts.pop() ?? "";
      let entries = parts.map(parseLine).filter((entry): entry is LogEntry => entry !== null);
      if (first) entries = entries.slice(-Math.max(0, lines));
      for (const entry of entries) print(formatLogEntry(entry, libraryNames));
    } finally {
      await handle.close();
    }
  };

  await readFrom();
  first = false;
  if (!follow) return;
  while (!signal?.aborted) {
    await new Promise<void>((resolveWait) => {
      const timer = setTimeout(resolveWait, pollMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolveWait();
      }, { once: true });
    });
    if (!signal?.aborted) await readFrom();
  }
}

module.exports = { formatLogEntry, printLogFile };
