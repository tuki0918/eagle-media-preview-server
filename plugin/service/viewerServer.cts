const { createReadStream, existsSync, readFileSync } = require("fs");
const { stat } = require("fs").promises;
const { createServer: createHttpServer } = require("http");
const { createServer: createHttpsServer } = require("https");
const { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } = require("crypto");
const { extname, join, normalize, resolve } = require("path");
const { createEagleClient, normalizeStringArray, pathFromFileValue, resolveLibraryItemFile } = require("./eagleClient.cjs");
const { buildConnectionCandidates, createConnectionContext } = require("./connection.cjs");

interface ViewerServerOptions {
  allowMetadataEditing?: boolean;
  authUsers?: AuthUser[];
  basicAuthUsername?: string;
  eagleClient?: EagleClient;
  host?: string;
  httpsCertPath?: string;
  httpsEnabled?: boolean;
  httpsKeyPath?: string;
  passwordHash?: string;
  port?: number;
  publicDir?: string;
  sessionSecret?: string;
  viewerPassword?: string;
}

type UserRole = "admin" | "editor" | "viewer";

interface AuthUser {
  passwordHash: string;
  role: UserRole;
  username: string;
}

interface AuthSession {
  expiresAt: number;
  role: UserRole;
  username: string;
}

const PASSWORD_HASH_ALGORITHM = "sha256";
const PASSWORD_HASH_KEY_LENGTH = 32;
const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const AUTH_USER_CACHE = Symbol("authUser");
const INVALID_LOGIN_MESSAGE = "Invalid username or password";
const RATING_WRITE_FORBIDDEN_MESSAGE = "Rating editing is not allowed for this viewer";
const METADATA_WRITE_FORBIDDEN_MESSAGE = "Metadata editing is not allowed for this viewer";
const MIN_PASSWORD_HASH_ITERATIONS = 100000;
const MAX_PASSWORD_HASH_ITERATIONS = 1000000;

interface EagleLibraryInfo {
  path?: string;
}

interface EagleItem {
  data?: EagleItem[];
  ext?: string;
  filePath?: string;
  fileURL?: string;
  folders?: unknown;
  id?: string;
  name?: string;
  star?: number;
  tags?: unknown;
  thumbnailPath?: string;
  thumbnailURL?: string;
  title?: string;
}

interface EagleClient {
  appInfo(): Promise<unknown>;
  folders(): Promise<unknown>;
  itemById(id: string): Promise<EagleItem>;
  legacyThumbnailPath(id: string): Promise<unknown>;
  libraryHistory(): Promise<unknown[]>;
  listItems(options: {
    ext?: string | null;
    folderId?: string | null;
    isUnfiled?: boolean;
    keywords?: string;
    limit?: string | number;
    offset?: string | number;
    rating?: string | null;
    tags?: string[];
  }): Promise<unknown>;
  listTags(options: { limit?: string | number; query?: string }): Promise<unknown>;
  searchItems(options: { limit?: string | number; offset?: string | number; query: string }): Promise<unknown>;
  switchLibrary(libraryPath: string): Promise<unknown>;
  updateItemMetadata(id: string, input: { folders?: unknown; tags?: unknown }): Promise<EagleItem>;
  updateItemStar(id: string, star: unknown): Promise<EagleItem>;
}

interface EagleSession {
  clearLibraryInfo?: () => void;
  client: EagleClient;
  connection: {
    host: string;
    port: number;
    token: string;
  };
  libraryInfo(): Promise<EagleLibraryInfo>;
}

interface ApiContext {
  getSession: () => EagleSession;
  setSession: (nextSession: EagleSession) => void;
}

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
const MAX_JSON_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function createViewerServer({
  host = "0.0.0.0",
  allowMetadataEditing = false,
  authUsers = [],
  port = 41532,
  publicDir = defaultPublicDir,
  viewerPassword = "",
  passwordHash = "",
  basicAuthUsername = "eagle",
  httpsEnabled = false,
  httpsCertPath = "",
  httpsKeyPath = "",
  sessionSecret = "",
  eagleClient = createEagleClient(),
}: ViewerServerOptions = {}) {
  let serverInstance = null;
  let state = "stopped";
  let boundAddress = "";
  let boundPort = 0;
  let lastError = "";
  let requestCount = 0;
  const resolvedAuthUsers = resolveAuthUsers({ allowMetadataEditing, authUsers, basicAuthUsername, passwordHash, viewerPassword });
  const resolvedSessionSecret = String(sessionSecret || "").trim() || randomBytes(32).toString("base64url");
  const authSessions = new Map<string, AuthSession>();
  const revokedAuthSessions = new Set<string>();
  let currentSession = createConnectionContext({
    connection: {
      host: "127.0.0.1",
      port: 41595,
      token: "",
      baseUrl: "http://127.0.0.1:41595",
    },
    client: eagleClient,
  });

  const server = createProtocolServer({ httpsCertPath, httpsEnabled, httpsKeyPath }, async (req, res) => {
    try {
      const url = new URL(req.url || "/", `${httpsEnabled ? "https" : "http"}://${req.headers.host}`);
      const auth = { authSessions, revokedAuthSessions, secureCookies: httpsEnabled, sessionSecret: resolvedSessionSecret, users: resolvedAuthUsers };
      if (!isTrustedUnsafeRequest(req, url)) {
        sendJson(res, 403, { error: "Cross-origin writes are not allowed" });
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
          auth,
          getSession: () => currentSession,
          setSession: (nextSession) => {
            currentSession = nextSession;
          },
        });
        return;
      }
      const fileMatch = url.pathname.match(/^\/file\/([^/]+)(?:\/[^/]+)?$/);
      if (fileMatch) {
        if (!isAuthorized(req, auth)) {
          sendAuthRequired(res);
          return;
        }
        attachRequestCounter(res, () => {
          requestCount += 1;
        });
        const session = getSession(currentSession);
        await streamItemMedia(decodeURIComponent(fileMatch[1]), "file", req, res, session);
        return;
      }
      await serveStatic(url.pathname, res, publicDir);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, { error: error.message || "Internal server error" });
    }
  });

  return {
    async start() {
      if (state === "running") return this.status();
      state = "starting";
      lastError = "";
      try {
        await new Promise<void>((resolveStart, rejectStart) => {
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
      await new Promise<void>((resolveStop, rejectStop) => {
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
      pruneAuthSessions(authSessions);
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

function createProtocolServer({ httpsCertPath = "", httpsEnabled = false, httpsKeyPath = "" }, handler) {
  if (!httpsEnabled) return createHttpServer(handler);
  const keyPath = String(httpsKeyPath || "").trim();
  const certPath = String(httpsCertPath || "").trim();
  if (!keyPath || !certPath) {
    throw new Error("HTTPS requires both certificate and key paths");
  }
  return createHttpsServer({
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  }, handler);
}

async function handleApi(req, url, res, { auth, getSession, setSession }: ApiContext & { auth: AuthContext }) {
  if (url.pathname === "/api/connect") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    await handleConnect(req, res, setSession);
    return;
  }

  const session = getSession();

  if (url.pathname === "/api/health") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
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
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    sendJson(res, 200, await session.client.folders());
    return;
  }

  if (url.pathname === "/api/libraries") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
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
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    if (!hasAdminAccess(req, auth)) {
      sendJson(res, 403, { error: "Admin permission is required" });
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
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
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
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    const query = url.searchParams.get("q") || "";
    const limit = url.searchParams.get("limit") || 20;
    const result = await session.client.listTags({ query, limit });
    sendJson(res, 200, result);
    return;
  }

  const starMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/star$/);
  if (starMatch) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    if (!hasRatingWriteAccess(req, auth)) {
      sendJson(res, 403, { error: RATING_WRITE_FORBIDDEN_MESSAGE });
      return;
    }
    const itemId = decodeURIComponent(starMatch[1]);
    const body = await readJson(req);
    const star = normalizeStar(body.star);
    const item = await session.client.updateItemStar(itemId, star);
    sendJson(res, 200, { id: item.id || itemId, star: item.star ?? star });
    return;
  }

  const metadataMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/metadata$/);
  if (metadataMatch) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    if (!hasMetadataWriteAccess(req, auth)) {
      sendJson(res, 403, { error: METADATA_WRITE_FORBIDDEN_MESSAGE });
      return;
    }
    const itemId = decodeURIComponent(metadataMatch[1]);
    const body = await readJson(req);
    const metadataPatch = normalizeMetadataPatch(body);
    const item = await session.client.updateItemMetadata(itemId, metadataPatch);
    sendJson(res, 200, {
      id: item.id || itemId,
      tags: Array.isArray(item.tags) ? item.tags : metadataPatch.tags,
      folders: Array.isArray(item.folders) ? item.folders : metadataPatch.folders,
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

interface AuthContext {
  authSessions: Map<string, AuthSession>;
  revokedAuthSessions: Set<string>;
  secureCookies?: boolean;
  sessionSecret: string;
  users: AuthUser[];
}

async function handleAuthRoutes(req, url, res, auth: AuthContext) {
  if (url.pathname === "/api/auth/status") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return true;
    }
    pruneAuthSessions(auth.authSessions);
    const user = authenticatedUser(req, auth);
    const authenticated = !authRequired(auth) || Boolean(user);
    sendJson(res, 200, authStatusResponse(auth, user, { authenticated }));
    return true;
  }

  if (url.pathname === "/api/auth/login") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return true;
    }
    if (!authRequired(auth)) {
      sendJson(res, 200, authStatusResponse(auth, null, { authenticated: true }));
      return true;
    }
    const body = await readJson(req);
    const user = findPasswordUser(String(body.username || ""), String(body.password || ""), auth);
    if (!user) {
      sendJson(res, 401, { error: INVALID_LOGIN_MESSAGE });
      return true;
    }
    pruneAuthSessions(auth.authSessions);
    const session = {
      expiresAt: Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000,
      role: user.role,
      username: user.username,
    };
    const token = signedAuthSessionToken(session, auth);
    auth.authSessions.set(token, session);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": authSessionCookie(token, AUTH_SESSION_MAX_AGE_SECONDS, auth.secureCookies),
    });
    res.end(JSON.stringify(authStatusResponse(auth, user, { authenticated: true })));
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return true;
    }
    const token = parseCookies(req.headers.cookie || "").viewer_session;
    if (token) {
      auth.authSessions.delete(token);
      auth.revokedAuthSessions.add(token);
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": authSessionCookie("", 0, auth.secureCookies),
    });
    res.end(JSON.stringify(authStatusResponse(auth, null, { authenticated: !authRequired(auth) })));
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

function sendMethodNotAllowed(res, methods) {
  res.writeHead(405, {
    "Allow": methods.join(", "),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

function normalizeMetadataPatch(body) {
  return {
    tags: body.tags === undefined ? undefined : normalizeStringArray(body.tags, "tags"),
    folders: body.folders === undefined ? undefined : normalizeStringArray(body.folders, "folders"),
  };
}

function normalizeStar(value: unknown) {
  const star = Number(value);
  if (!Number.isInteger(star) || star < 0 || star > 5) {
    throw new HttpError(400, "star must be an integer from 0-5");
  }
  return star;
}

function authRequired({ users = [] }: { users?: AuthUser[] }) {
  return Boolean(users.length);
}

function isAuthorized(req, auth) {
  if (!authRequired(auth)) return true;
  return Boolean(authenticatedUser(req, auth));
}

function isTrustedUnsafeRequest(req, requestUrl) {
  if (!isUnsafeMethod(req.method)) return true;
  const expectedOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
  const origin = headerValue(req.headers.origin);
  if (origin) return origin === expectedOrigin;
  const referer = headerValue(req.headers.referer);
  if (!referer) return true;
  try {
    const refererUrl = new URL(referer);
    return `${refererUrl.protocol}//${refererUrl.host}` === expectedOrigin;
  } catch {
    return false;
  }
}

function isUnsafeMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : String(value || "");
}

function hasMetadataWriteAccess(req, auth: AuthContext) {
  const user = authenticatedUser(req, auth);
  return rolePermissions(user?.role).writeMetadata;
}

function hasRatingWriteAccess(req, auth: AuthContext) {
  const user = authenticatedUser(req, auth);
  return rolePermissions(user?.role).writeRating;
}

function hasAdminAccess(req, auth: AuthContext) {
  const user = authenticatedUser(req, auth);
  return rolePermissions(user?.role).manageLibrary;
}

function authenticatedUser(req, auth: AuthContext): AuthSession | null {
  if (Object.prototype.hasOwnProperty.call(req, AUTH_USER_CACHE)) {
    return req[AUTH_USER_CACHE];
  }
  const user = resolveAuthenticatedUser(req, auth);
  req[AUTH_USER_CACHE] = user;
  return user;
}

function resolveAuthenticatedUser(req, auth: AuthContext): AuthSession | null {
  if (!authRequired(auth)) return null;
  const token = parseCookies(req.headers.cookie || "").viewer_session;
  if (!token) return null;
  if (auth.revokedAuthSessions.has(token)) return null;
  const session = verifyAuthSessionToken(token, auth);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    auth.authSessions.delete(token);
    return null;
  }
  return session;
}

function pruneAuthSessions(authSessions: Map<string, AuthSession>) {
  const now = Date.now();
  for (const [token, session] of authSessions) {
    if (session.expiresAt <= now) authSessions.delete(token);
  }
}

function findPasswordUser(username, password, auth: AuthContext): AuthUser | null {
  const user = auth.users.find((entry) => entry.username === username);
  if (user?.passwordHash && passwordMatches(password, user.passwordHash)) return user;
  return null;
}

function signedAuthSessionToken(session: AuthSession, auth: AuthContext) {
  const user = auth.users.find((entry) => entry.username === session.username && entry.role === session.role);
  const payload = Buffer.from(JSON.stringify({
    e: session.expiresAt,
    r: session.role,
    u: session.username,
    v: userAuthVersion(user),
  })).toString("base64url");
  return `${payload}.${authSessionSignature(payload, auth)}`;
}

function verifyAuthSessionToken(token: string, auth: AuthContext): AuthSession | null {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(authSessionSignature(payload, auth), signature)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const username = String(session.u || "");
    const role = normalizeRole(session.r);
    const expiresAt = Number(session.e);
    if (!username || !Number.isFinite(expiresAt)) return null;
    const user = auth.users.find((entry) => entry.username === username && entry.role === role);
    if (!user) return null;
    if (String(session.v || "") !== userAuthVersion(user)) return null;
    return { expiresAt, role, username };
  } catch {
    return null;
  }
}

function authSessionSignature(payload: string, auth: AuthContext) {
  return createHmac("sha256", auth.sessionSecret).update(payload).digest("base64url");
}

function userAuthVersion(user: AuthUser | undefined) {
  if (!user) return "";
  return sha256(`eagle-media-preview-user-auth-version:${canonicalAuthUser(user)}`).slice(0, 16);
}

function canonicalAuthUser(user: AuthUser) {
  return JSON.stringify({
    passwordHash: user.passwordHash,
    role: user.role,
    username: user.username,
  });
}

function authStatusResponse(auth: AuthContext, user: AuthSession | AuthUser | null, { authenticated = Boolean(user) } = {}) {
  return {
    required: authRequired(auth),
    authenticated,
    user: user ? { role: user.role, username: user.username } : null,
    permissions: permissionsForUser(user, { authenticated }),
  };
}

function permissionsForUser(user: AuthSession | AuthUser | null, { authenticated = Boolean(user) } = {}) {
  const read = authenticated;
  const roleAccess = rolePermissions(user?.role);
  return {
    manageLibrary: roleAccess.manageLibrary,
    read,
    writeMetadata: roleAccess.writeMetadata,
    writeRating: roleAccess.writeRating,
  };
}

function rolePermissions(role: UserRole | undefined) {
  const manageLibrary = role === "admin";
  const writeMetadata = role === "admin" || role === "editor";
  const writeRating = writeMetadata;
  return {
    manageLibrary,
    writeMetadata,
    writeRating,
  };
}

function resolveAuthUsers({ allowMetadataEditing, authUsers, basicAuthUsername, passwordHash, viewerPassword }: {
  allowMetadataEditing?: boolean;
  authUsers?: AuthUser[];
  basicAuthUsername?: string;
  passwordHash?: string;
  viewerPassword?: string;
}): AuthUser[] {
  const users = Array.isArray(authUsers)
    ? authUsers.map((user) => ({
        username: String(user.username || "").trim(),
        passwordHash: String(user.passwordHash || ""),
        role: normalizeRole(user.role),
      })).filter((user) => user.username && user.passwordHash)
    : [];
  if (users.length) return users;
  const legacyPasswordHash = passwordHash || (viewerPassword ? sha256(viewerPassword) : "");
  return legacyPasswordHash ? [{
    username: basicAuthUsername || "eagle",
    passwordHash: legacyPasswordHash,
    role: allowMetadataEditing ? "editor" as const : "viewer" as const,
  }] : [];
}

function normalizeRole(value): UserRole {
  return value === "admin" || value === "editor" ? value : "viewer";
}

function sendAuthRequired(res) {
  res.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "Authentication required" }));
}

function authSessionCookie(token: string, maxAge = AUTH_SESSION_MAX_AGE_SECONDS, secure = false) {
  return `viewer_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function passwordMatches(value: string, passwordHash: string) {
  if (passwordHash.startsWith("pbkdf2$")) return pbkdf2PasswordMatches(value, passwordHash);
  return safeEqual(sha256(value), passwordHash);
}

function pbkdf2PasswordMatches(value, passwordHash: string) {
  const [scheme, algorithm, rawIterations, salt, expectedDigest] = passwordHash.split("$");
  if (scheme !== "pbkdf2" || algorithm !== PASSWORD_HASH_ALGORITHM || !salt || !expectedDigest) return false;
  const iterations = Number.parseInt(rawIterations, 10);
  if (!Number.isInteger(iterations) || iterations < MIN_PASSWORD_HASH_ITERATIONS || iterations > MAX_PASSWORD_HASH_ITERATIONS) {
    return false;
  }
  const actualDigest = pbkdf2Sync(String(value), salt, iterations, PASSWORD_HASH_KEY_LENGTH, algorithm).toString("base64url");
  return safeEqual(actualDigest, expectedDigest);
}

function safeEqual(actualValue, expectedValue) {
  const expected = Buffer.from(String(expectedValue));
  const actual = Buffer.from(String(actualValue));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function parseCookies(header: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = safeDecodeCookieValue(part.slice(index + 1).trim());
    if (name && value !== null) output[name] = value;
  }
  return output;
}

function safeDecodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
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
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
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
