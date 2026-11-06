const { randomBytes } = require("crypto");
const { createWriteStream } = require("fs");
const { mkdir, readdir, rm, stat } = require("fs").promises;
const { tmpdir } = require("os");
const { extname, join } = require("path");
const { pipeline } = require("stream/promises");

import type { IncomingMessage } from "http";

const UPLOAD_PATH = "/api/uploads";
const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;
const MAX_UPLOAD_BYTES = 2 * BYTES_PER_GB;
const MAX_UPLOAD_NAME_LENGTH = 255;
// A connection that stops sending is dropped after this long, however large the file is.
const UPLOAD_IDLE_TIMEOUT_MS = 60 * 1000;
// Node's limit on receiving one whole request, which is 5 minutes by default. It covers the largest
// upload at about 0.6 MB/s; UPLOAD_IDLE_TIMEOUT_MS is what catches a stalled upload.
const UPLOAD_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;
// Uploads are removed as soon as Eagle answers. This is for what a crash or a failed removal leaves.
const UPLOAD_RETENTION_MS = 60 * 60 * 1000;
const FILE_EXTENSION_PATTERN = /^\.[A-Za-z0-9]{1,16}$/;

class UploadError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function defaultUploadDirectory() {
  return join(tmpdir(), "eagle-media-preview-server-uploads");
}

function formatLimit(bytes: number) {
  if (bytes < BYTES_PER_MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < BYTES_PER_GB) return `${Number((bytes / BYTES_PER_MB).toFixed(1))} MB`;
  return `${Number((bytes / BYTES_PER_GB).toFixed(2))} GB`;
}

// Everything is checked from the request line and headers, before any of the body is read.
function parseUploadRequest(req: IncomingMessage, url: URL, maxBytes: number = MAX_UPLOAD_BYTES) {
  const declaredLength = String(req.headers["content-length"] ?? "");
  if (!/^\d+$/.test(declaredLength)) throw new UploadError(411, "Content-Length is required");
  const size = Number(declaredLength);
  if (size === 0) throw new UploadError(400, "The file is empty");
  if (size > maxBytes) throw new UploadError(413, `The file is larger than the ${formatLimit(maxBytes)} upload limit`);

  // The name is a label for Eagle only; the file on disk gets a random one.
  const fileName = String(url.searchParams.get("name") ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!fileName) throw new UploadError(400, "A file name is required");
  if (fileName.length > MAX_UPLOAD_NAME_LENGTH) throw new UploadError(400, "The file name is too long");
  const extension = extname(fileName);
  const validExtension = FILE_EXTENSION_PATTERN.test(extension);

  return {
    extension: validExtension ? extension.toLowerCase() : "",
    folderId: String(url.searchParams.get("folderId") ?? "").trim(),
    name: (validExtension ? fileName.slice(0, -extension.length).trim() : fileName) || fileName,
    size,
    tags: url.searchParams.getAll("tag"),
  };
}

async function receiveUpload(req: IncomingMessage, {
  directory = defaultUploadDirectory(),
  extension = "",
  idleTimeoutMs = UPLOAD_IDLE_TIMEOUT_MS,
}: { directory?: string; extension?: string; idleTimeoutMs?: number } = {}): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = join(directory, `${randomBytes(16).toString("hex")}${extension}`);
  req.setTimeout(idleTimeoutMs, () => {
    req.destroy(new UploadError(408, "The upload stopped sending data"));
  });
  try {
    await pipeline(req, createWriteStream(filePath, { flags: "wx", mode: 0o600 }));
    return filePath;
  } catch (error) {
    await discardUpload(filePath);
    if (error instanceof UploadError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOSPC") throw new UploadError(507, "There isn't enough disk space for this file");
    if (code === "ERR_STREAM_PREMATURE_CLOSE" || code === "ECONNRESET") throw new UploadError(400, "The upload was interrupted");
    throw new UploadError(500, "Unable to save the upload");
  }
}

async function discardUpload(filePath: string) {
  await rm(filePath, { force: true }).catch(() => {});
}

// Never throws: a file that can't be removed now is tried again by the next sweep.
async function sweepUploads({
  directory = defaultUploadDirectory(),
  now = Date.now(),
  retentionMs = UPLOAD_RETENTION_MS,
}: { directory?: string; now?: number; retentionMs?: number } = {}) {
  const names: string[] = await readdir(directory).catch(() => []);
  await Promise.all(names.map(async (name) => {
    const filePath = join(directory, name);
    try {
      const info = await stat(filePath);
      // A file still being written keeps a recent modification time.
      if (now - info.mtimeMs >= retentionMs) await rm(filePath, { force: true });
    } catch {
      // Removed by another sweep, or not removable yet.
    }
  }));
}

module.exports = {
  BYTES_PER_MB,
  MAX_UPLOAD_BYTES,
  UPLOAD_PATH,
  UPLOAD_REQUEST_TIMEOUT_MS,
  UploadError,
  discardUpload,
  parseUploadRequest,
  receiveUpload,
  sweepUploads,
};
