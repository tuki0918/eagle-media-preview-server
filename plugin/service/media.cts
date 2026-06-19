const { createReadStream } = require("fs");
const { stat } = require("fs").promises;
const { extname } = require("path");
const { pathFromFileValue, resolveLibraryItemFile } = require("./eagleClient.cjs");
const { mediaContentType } = require("./static.cjs");

import type { IncomingMessage, ServerResponse } from "http";

type MediaKind = "file" | "thumb";

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
  itemById(id: string): Promise<EagleItem>;
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

  const item = await session.client.itemById(id);
  const itemData = Array.isArray(item?.data) ? item.data[0] : item;
  let filePath = "";

  if (kind === "thumb") {
    filePath =
      pathFromFileValue(itemData?.thumbnailURL) ||
      pathFromFileValue(itemData?.thumbnailPath);
    if (!filePath) {
      try {
        filePath = pathFromFileValue(await session.client.legacyThumbnailPath(id));
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
  } else {
    filePath =
      pathFromFileValue(itemData?.fileURL) ||
      pathFromFileValue(itemData?.filePath);
    if (!filePath) {
      filePath = await resolveLibraryItemFile({
        libraryPath: await getLibraryPath(session),
        item: itemData,
        kind: "file",
      });
    }
  }

  if (!filePath) {
    sendJson(res, 404, { error: "Media path is unavailable from Eagle" });
    return;
  }

  const info = await stat(filePath);
  const contentType = mediaContentType(filePath, itemData);
  const range = parseRange(req.headers.range, info.size);

  if (req.headers.range && !range) {
    res.writeHead(416, {
      "Content-Range": `bytes */${info.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });
    res.end();
    return;
  }

  const commonHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(contentType, itemData, filePath),
    "Cache-Control": "private, max-age=3600",
    "Last-Modified": info.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };

  if (range) {
    res.writeHead(206, {
      ...commonHeaders,
      "Content-Length": range.end - range.start + 1,
      "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath, range).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...commonHeaders,
    "Content-Length": info.size,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
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
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendMethodNotAllowed(res: ServerResponse, methods: string[]) {
  res.writeHead(405, {
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

module.exports = { streamItemMedia };
