const { createReadStream } = require("fs");
const { readFile, stat } = require("fs").promises;
const { extname } = require("path");
const { pathFromFileValue, resolveLibraryItemFile } = require("./eagleClient.cjs");
const { mediaContentType, securityHeaders } = require("./static.cjs");

import type { IncomingMessage, ServerResponse } from "http";

type MediaKind = "file" | "thumb";
const MAX_INTERNET_SHORTCUT_BYTES = 128 * 1024;

interface EagleItem {
  data?: EagleItem[];
  ext?: unknown;
  filePath?: unknown;
  fileURL?: unknown;
  id?: string;
  name?: unknown;
  thumbnailPath?: unknown;
  thumbnailURL?: unknown;
  title?: unknown;
}

interface EagleMediaClient {
  itemById(id: string): Promise<EagleItem | EagleItem[]>;
  legacyThumbnailPath(id: string): Promise<unknown>;
}

interface EagleMediaSession {
  client: EagleMediaClient;
  libraryInfo(): Promise<{ path?: string } | null>;
}

interface ByteRange {
  end: number;
  start: number;
}

async function streamItemMedia(id: string, kind: MediaKind, req: IncomingMessage, res: ServerResponse, session: EagleMediaSession) {
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    sendMethodNotAllowed(res, ["GET", "HEAD"]);
    return;
  }

  const { filePath, itemData } = await resolveItemMediaPath(id, kind, session);

  if (!filePath) {
    sendJson(res, 404, { error: "Media path is unavailable from Eagle" });
    return;
  }

  const info = await safeStat(filePath);
  if (!info) {
    sendJson(res, 404, { error: "Media file is unavailable" });
    return;
  }
  if (!info.isFile()) {
    sendJson(res, 404, { error: "Media file is unavailable" });
    return;
  }
  const contentType = mediaContentType(filePath, itemData);
  const range = parseRange(req.headers.range, info.size);

  if (req.headers.range && !range) {
    res.writeHead(416, {
      ...securityHeaders,
      "Content-Range": `bytes */${info.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });
    res.end();
    return;
  }

  const commonHeaders = {
    ...securityHeaders,
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(contentType, itemData, filePath),
    "Cache-Control": "private, max-age=3600",
    "Last-Modified": info.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };

  if (range) {
    const headers = {
      ...commonHeaders,
      "Content-Length": range.end - range.start + 1,
      "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
    };
    if (req.method === "HEAD") {
      res.writeHead(206, headers);
      res.end();
      return;
    }
    pipeMediaStream(filePath, range, res, 206, headers);
    return;
  }

  const headers = {
    ...commonHeaders,
    "Content-Length": info.size,
  };
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  pipeMediaStream(filePath, undefined, res, 200, headers);
}

async function readInternetShortcutUrl(id: string, session: EagleMediaSession) {
  const { filePath } = await resolveItemMediaPath(id, "file", session);
  if (!filePath) return "";
  const info = await safeStat(filePath);
  if (!info || !info.isFile() || info.size > MAX_INTERNET_SHORTCUT_BYTES) return "";
  return parseInternetShortcutUrl(decodeInternetShortcutText(await readFile(filePath)));
}

function decodeInternetShortcutText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return swapUtf16Bytes(buffer.subarray(2)).toString("utf16le");
  }
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  return buffer.toString("utf8");
}

function swapUtf16Bytes(buffer: Buffer) {
  const output = Buffer.from(buffer);
  for (let index = 0; index + 1 < output.length; index += 2) {
    const left = output[index];
    output[index] = output[index + 1];
    output[index + 1] = left;
  }
  return output;
}

function parseInternetShortcutUrl(text: string) {
  let inInternetShortcutSection = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inInternetShortcutSection = section[1].trim().toLowerCase() === "internetshortcut";
      continue;
    }
    if (!inInternetShortcutSection) continue;
    const match = line.match(/^URL\s*=\s*(.+)$/i);
    if (match) return match[1].trim();
  }
  return "";
}

async function resolveItemMediaPath(id: string, kind: MediaKind, session: EagleMediaSession) {
  let itemData: EagleItem = { id };
  try {
    itemData = mediaItemById(await session.client.itemById(id), id);
  } catch {
    // The library folder can still resolve the original by its stable item id.
  }
  let filePath = "";

  if (kind === "thumb") {
    const thumbnailPath =
      pathFromFileValue(itemData?.thumbnailURL) ||
      pathFromFileValue(itemData?.thumbnailPath);
    filePath = await existingFilePath(thumbnailPath);
    let unresolvedPath = thumbnailPath;
    if (!filePath) {
      try {
        const legacyPath = pathFromFileValue(await session.client.legacyThumbnailPath(id));
        unresolvedPath ||= legacyPath;
        filePath = await existingFilePath(legacyPath);
      } catch {
        filePath = "";
      }
    }
    if (!filePath) {
      filePath = await resolveLibraryItemFile({
        libraryPath: await getLibraryPath(session),
        item: itemData,
        kind: "thumb",
      });
    }
    filePath ||= unresolvedPath;
  } else {
    const originalPath =
      pathFromFileValue(itemData?.fileURL) ||
      pathFromFileValue(itemData?.filePath);
    filePath = await existingFilePath(originalPath);
    if (!filePath) {
      filePath = await resolveLibraryItemFile({
        libraryPath: await getLibraryPath(session),
        item: itemData,
        kind: "file",
      });
    }
    filePath ||= originalPath;
  }

  return { filePath, itemData };
}

function mediaItemById(item: EagleItem | EagleItem[], id: string): EagleItem {
  const items = Array.isArray(item)
    ? item
    : Array.isArray(item?.data)
      ? item.data
      : [item];
  return items.find((candidate) => candidate?.id === id) || { id };
}

async function existingFilePath(filePath: string) {
  if (!filePath) return "";
  const info = await safeStat(filePath);
  return info?.isFile() ? filePath : "";
}

function pipeMediaStream(
  filePath: string,
  options: ByteRange | undefined,
  res: ServerResponse,
  status: number,
  headers: Record<string, string | number>,
) {
  const stream = options ? createReadStream(filePath, options) : createReadStream(filePath);
  let opened = false;

  stream.once("open", () => {
    opened = true;
    res.writeHead(status, headers);
    stream.pipe(res);
  });

  stream.once("error", (error: Error) => {
    if (!opened && !res.headersSent) {
      sendJson(res, 500, { error: "Unable to read media file" });
      return;
    }
    res.destroy(error);
  });
}

async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function contentDisposition(contentType: string, item: EagleItem | null | undefined, filePath: string) {
  if (contentType !== "application/pdf") return "inline";
  const name = mediaFileName(item, filePath);
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeRFC5987ValueChars(name)}`;
}

function mediaFileName(item: EagleItem | null | undefined, filePath: string) {
  const rawName = String(item?.name || item?.title || "").trim();
  const ext = String(item?.ext || extname(filePath).replace(/^\./, "") || "").trim().replace(/^\./, "");
  const fallbackName = rawName || `file${ext ? `.${ext}` : ""}`;
  if (!ext || fallbackName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return fallbackName;
  return `${fallbackName}.${ext}`;
}

function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function sendMethodNotAllowed(res: ServerResponse, methods: string[]) {
  res.writeHead(405, {
    ...securityHeaders,
    "Allow": methods.join(", "),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

function parseRange(header: string | undefined, size: number): ByteRange | null {
  if (!header?.startsWith("bytes=")) return null;
  const range = header.slice(6).split(",", 1)[0]?.trim();
  const match = range?.match(/^(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;
  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

async function getLibraryPath(session: EagleMediaSession) {
  const library = await session.libraryInfo();
  return library?.path || "";
}

module.exports = { readInternetShortcutUrl, streamItemMedia };
