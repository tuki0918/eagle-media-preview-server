// @ts-nocheck
const { createReadStream, existsSync } = require("fs");
const { stat } = require("fs").promises;
const { createServer } = require("http");
const { createHash, randomUUID, timingSafeEqual } = require("crypto");
const { extname, join, normalize, resolve } = require("path");
const { createEagleClient, pathFromFileValue, resolveLibraryItemFile } = require("./eagleClient.cjs");
const { buildConnectionCandidates, createConnectionContext } = require("./connection.cjs");

function resolveDefaultPublicDir(baseDir = __dirname, pathExists = existsSync) {
  const packagedPublicDir = resolve(baseDir, "..", "..", "public");
  const workspaceDistPublicDir = resolve(baseDir, "..", "..", "dist", "public");
  return pathExists(workspaceDistPublicDir) ? workspaceDistPublicDir : packagedPublicDir;
}

const defaultPublicDir = resolveDefaultPublicDir();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

function createViewerServer({
  host = "0.0.0.0",
  port = 41532,
  publicDir = defaultPublicDir,
  viewerPassword = "",
  passwordHash = "",
  basicAuthUsername = "eagle",
  eagleClient = createEagleClient(),
} = {}) {
  let serverInstance = null;
  let state = "stopped";
  let boundAddress = "";
  let boundPort = 0;
  let lastError = "";
  let requestCount = 0;
  const authSessions = new Set();
  let currentSession = createConnectionContext({
    connection: {
      host: "127.0.0.1",
      port: 41595,
      token: "",
      baseUrl: "http://127.0.0.1:41595",
    },
    client: eagleClient,
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const auth = { authSessions, viewerPassword, passwordHash, basicAuthUsername };
      if (authRequired(auth) && !url.pathname.startsWith("/api/auth/") && !isAuthorized(req, auth)) {
        sendAuthRequired(res);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        attachRequestCounter(res, () => {
          requestCount += 1;
        });
        if (await handleAuthRoutes(req, url, res, auth)) return;
        if (!isAuthorized(req, auth)) {
          sendAuthRequired(res);
          return;
        }
        await handleApi(req, url, res, {
          getSession: () => currentSession,
          setSession: (nextSession) => {
            currentSession = nextSession;
          },
          publicDir,
        });
        return;
      }
      const fileMatch = url.pathname.match(/^\/file\/([^/]+)(?:\/[^/]+)?$/);
      if (fileMatch) {
        attachRequestCounter(res, () => {
          requestCount += 1;
        });
        const session = getSession(currentSession);
        await streamItemMedia(decodeURIComponent(fileMatch[1]), "file", req, res, session);
        return;
      }
      await serveStatic(url.pathname, res, publicDir);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Internal server error" });
    }
  });

  return {
    async start() {
      if (state === "running") return this.status();
      state = "starting";
      lastError = "";
      try {
        await new Promise((resolveStart, rejectStart) => {
          server.once("error", rejectStart);
          server.listen(port, host, () => {
            server.off("error", rejectStart);
            resolveStart();
          });
        });
        serverInstance = server;
        const address = server.address();
        boundAddress = typeof address === "object" && address ? address.address : host;
        boundPort = typeof address === "object" && address ? address.port : port;
        state = "running";
        return this.status();
      } catch (error) {
        state = "error";
        lastError = error.message || String(error);
        throw error;
      }
    },

    async stop() {
      if (!serverInstance || state === "stopped") {
        state = "stopped";
        return this.status();
      }
      state = "stopping";
      await new Promise((resolveStop, rejectStop) => {
        serverInstance.close((error) => {
          if (error) rejectStop(error);
          else resolveStop();
        });
      });
      serverInstance = null;
      boundAddress = "";
      boundPort = 0;
      state = "stopped";
      return this.status();
    },

    status() {
      return {
        state,
        host,
        port: boundPort || port,
        boundAddress,
        boundPort,
        lastError,
        activeSessions: authSessions.size,
        requestCount,
      };
    },

    server,
  };
}

async function handleApi(req, url, res, { getSession, setSession }) {
  if (url.pathname === "/api/connect") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    await handleConnect(req, res, setSession);
    return;
  }

  const session = getSession();

  if (url.pathname === "/api/health") {
    const [app, library] = await Promise.allSettled([
      session.client.appInfo(),
      session.libraryInfo(),
    ]);
    sendJson(res, 200, {
      app: app.status === "fulfilled" ? app.value : null,
      library: library.status === "fulfilled" ? library.value : null,
      error: app.status === "rejected" ? app.reason.message : null,
    });
    return;
  }

  if (url.pathname === "/api/folders") {
    sendJson(res, 200, await session.client.folders());
    return;
  }

  if (url.pathname === "/api/libraries") {
    const [library, history] = await Promise.all([
      session.libraryInfo(),
      session.client.libraryHistory(),
    ]);
    const paths = uniquePaths([library?.path, ...(Array.isArray(history) ? history : [])]);
    sendJson(res, 200, {
      current: library?.path || "",
      items: paths.map((path) => ({ path, name: libraryNameFromPath(path) })),
    });
    return;
  }

  if (url.pathname === "/api/library/switch") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const body = await readJson(req);
    const libraryPath = String(body.libraryPath || "").trim();
    if (!libraryPath) {
      sendJson(res, 400, { error: "libraryPath is required" });
      return;
    }
    await session.client.switchLibrary(libraryPath);
    session.clearLibraryInfo?.();
    const library = await waitForLibrarySwitch(session, libraryPath);
    sendJson(res, 200, { library });
    return;
  }

  if (url.pathname === "/api/items") {
    const query = url.searchParams.get("q")?.trim();
    const offset = url.searchParams.get("offset") || 0;
    const limit = url.searchParams.get("limit") || 30;
    const tags = [...url.searchParams.getAll("tags"), ...url.searchParams.getAll("tag")]
      .map((tag) => tag.trim())
      .filter(Boolean);
    const hasStructuredFilters = Boolean(
      url.searchParams.get("folderId") || url.searchParams.get("ext") || url.searchParams.get("rating") || tags.length,
    );
    const result = query && !hasStructuredFilters
      ? await session.client.searchItems({ query, offset, limit })
      : await session.client.listItems({
          offset,
          limit,
          keywords: query,
          folderId: url.searchParams.get("folderId"),
          isUnfiled: url.searchParams.get("folderId") === "__uncategorized__",
          ext: url.searchParams.get("ext"),
          rating: url.searchParams.get("rating"),
          tags,
        });
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/tags") {
    const query = url.searchParams.get("q") || "";
    const limit = url.searchParams.get("limit") || 20;
    const result = await session.client.listTags({ query, limit });
    sendJson(res, 200, result);
    return;
  }

  const starMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/star$/);
  if (starMatch) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const itemId = decodeURIComponent(starMatch[1]);
    const body = await readJson(req);
    const item = await session.client.updateItemStar(itemId, body.star);
    sendJson(res, 200, { id: item.id || itemId, star: item.star ?? Number(body.star) });
    return;
  }

  const metadataMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/metadata$/);
  if (metadataMatch) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const itemId = decodeURIComponent(metadataMatch[1]);
    const body = await readJson(req);
    const item = await session.client.updateItemMetadata(itemId, {
      tags: body.tags,
      folders: body.folders,
    });
    sendJson(res, 200, {
      id: item.id || itemId,
      tags: Array.isArray(item.tags) ? item.tags : body.tags,
      folders: Array.isArray(item.folders) ? item.folders : body.folders,
    });
    return;
  }

  const mediaMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/(thumb|file)$/);
  if (mediaMatch) {
    await streamItemMedia(decodeURIComponent(mediaMatch[1]), mediaMatch[2], req, res, session);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function handleAuthRoutes(req, url, res, { authSessions, viewerPassword, passwordHash, basicAuthUsername }) {
  if (url.pathname === "/api/auth/status") {
    sendJson(res, 200, {
      required: authRequired({ viewerPassword, passwordHash }),
      authenticated: isAuthorized(req, { authSessions, viewerPassword, passwordHash, basicAuthUsername }),
    });
    return true;
  }

  if (url.pathname === "/api/auth/login") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    }
    if (!authRequired({ viewerPassword, passwordHash })) {
      sendJson(res, 200, { authenticated: true });
      return true;
    }
    const body = await readJson(req);
    if (String(body.username || basicAuthUsername) !== basicAuthUsername || !passwordMatches(String(body.password || ""), { viewerPassword, passwordHash })) {
      sendJson(res, 401, { error: "Invalid password" });
      return true;
    }
    const token = randomUUID();
    authSessions.add(token);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `viewer_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
    });
    res.end(JSON.stringify({ authenticated: true }));
    return true;
  }

  return false;
}

async function handleConnect(req, res, setSession) {
  const input = await readJson(req);
  let candidates = [];
  try {
    candidates = buildConnectionCandidates({
      input,
      requestHost: req.headers.host || "",
    });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }
  const errors = [];
  const requestedHost = String(input.host || "127.0.0.1").trim() || "127.0.0.1";

  for (const connection of candidates) {
    try {
      const session = createConnectionContext({ connection });
      const [app, library] = await Promise.all([
        session.client.appInfo(),
        session.libraryInfo(),
      ]);
      setSession(session);
      sendJson(res, 200, {
        app,
        library,
        connection: {
          host: session.connection.host,
          port: session.connection.port,
          hasToken: Boolean(session.connection.token),
          fallbackToLocalhost: requestedHost !== session.connection.host,
        },
      });
      return;
    } catch (error) {
      errors.push(`${connection.baseUrl}: ${error.message}`);
    }
  }

  sendJson(res, 502, { error: `Unable to connect to Eagle API: ${errors.join(" / ")}` });
}

async function streamItemMedia(id, kind, req, res, session) {
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    sendJson(res, 405, { error: "Method not allowed" });
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

function mediaContentType(filePath, item) {
  const pathExt = extname(filePath).toLowerCase();
  const itemExt = item?.ext ? `.${String(item.ext).toLowerCase().replace(/^\./, "")}` : "";
  return mimeTypes[pathExt] || mimeTypes[itemExt] || "application/octet-stream";
}

function contentDisposition(contentType, item, filePath) {
  if (contentType !== "application/pdf") return "inline";
  const name = mediaFileName(item, filePath);
  const asciiName = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeRFC5987ValueChars(name)}`;
}

function mediaFileName(item, filePath) {
  const rawName = String(item?.name || item?.title || "").trim();
  const ext = String(item?.ext || extname(filePath).replace(/^\./, "") || "").trim().replace(/^\./, "");
  const fallbackName = rawName || `file${ext ? `.${ext}` : ""}`;
  if (!ext || fallbackName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return fallbackName;
  return `${fallbackName}.${ext}`;
}

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(value)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

async function serveStatic(pathname, res, publicDir) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, cleanPath));
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function authRequired({ viewerPassword, passwordHash }) {
  return Boolean(viewerPassword || passwordHash);
}

function isAuthorized(req, auth) {
  if (!authRequired(auth)) return true;
  if (basicAuthMatches(req.headers.authorization || "", auth)) return true;
  const token = parseCookies(req.headers.cookie || "").viewer_session;
  return Boolean(token && auth.authSessions.has(token));
}

function basicAuthMatches(header, { basicAuthUsername, viewerPassword, passwordHash }) {
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === basicAuthUsername && passwordMatches(password, { viewerPassword, passwordHash });
  } catch {
    return false;
  }
}

function sendAuthRequired(res) {
  res.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Media Preview Server", charset="UTF-8"',
  });
  res.end(JSON.stringify({ error: "Authentication required" }));
}

function passwordMatches(value, { viewerPassword, passwordHash }) {
  const expectedValue = passwordHash || viewerPassword;
  const actualValue = passwordHash ? sha256(value) : value;
  const expected = Buffer.from(expectedValue);
  const actual = Buffer.from(actualValue);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function parseCookies(header) {
  const output = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    output[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return output;
}

function attachRequestCounter(res, onFinish) {
  const startedAt = Date.now();
  res.on("finish", () => {
    onFinish?.({
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
}

function getSession(session) {
  if (!session) {
    throw new Error("No Eagle connection is configured. Please connect again.");
  }
  return session;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseRange(header, size) {
  if (!header?.startsWith("bytes=")) return null;
  const range = header.slice(6).split(",", 1)[0]?.trim();
  const match = range?.match(/^(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start;
  let end;
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

async function getLibraryPath(session) {
  const library = await session.libraryInfo();
  return library?.path || "";
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((path) => path.replace(/\/+$/, "")))];
}

function libraryNameFromPath(path) {
  return path.split(/[\\/]/).filter(Boolean).at(-1)?.replace(/\.library$/i, "") || path;
}

async function waitForLibrarySwitch(session, expectedPath) {
  const expected = expectedPath.replace(/\/+$/, "");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    session.clearLibraryInfo?.();
    const library = await session.libraryInfo();
    if ((library?.path || "").replace(/\/+$/, "") === expected) {
      return library;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  session.clearLibraryInfo?.();
  return session.libraryInfo();
}
module.exports = { createViewerServer, resolveDefaultPublicDir, sha256 };
