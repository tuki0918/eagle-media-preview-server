const { createReadStream, existsSync } = require("fs");
const { stat } = require("fs").promises;
const { extname, isAbsolute, relative, resolve } = require("path");

import type { ServerResponse } from "http";

function resolveDefaultPublicDir(baseDir = __dirname, pathExists: (path: string) => boolean = existsSync) {
  const packagedPublicDir = resolve(baseDir, "..", "..", "public");
  const workspaceDistPublicDir = resolve(baseDir, "..", "..", "dist", "public");
  return pathExists(workspaceDistPublicDir) ? workspaceDistPublicDir : packagedPublicDir;
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='",
  ].join("; "),
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};

async function serveStatic(pathname: string, res: ServerResponse, publicDir: string) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const publicRoot = resolve(publicDir);
  const requestPath = cleanPath.startsWith("/") ? `.${cleanPath}` : `./${cleanPath}`;
  const filePath = resolve(publicRoot, requestPath);
  const relativePath = relative(publicRoot, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

function mediaContentType(filePath: string, item?: { ext?: unknown } | null) {
  const pathExt = extname(filePath).toLowerCase();
  const itemExt = item?.ext ? `.${String(item.ext).toLowerCase().replace(/^\./, "")}` : "";
  return mimeTypes[pathExt] || mimeTypes[itemExt] || "application/octet-stream";
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

module.exports = {
  mediaContentType,
  resolveDefaultPublicDir,
  securityHeaders,
  serveStatic,
};
