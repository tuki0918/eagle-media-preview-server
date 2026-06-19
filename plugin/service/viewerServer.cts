const { readFileSync } = require("fs");
const { createServer: createHttpServer } = require("http");
const { createServer: createHttpsServer } = require("https");
const { randomBytes } = require("crypto");
const { createEagleClient, normalizeStringArray } = require("./eagleClient.cjs");
const { buildConnectionCandidates, createConnectionContext } = require("./connection.cjs");
const { streamItemMedia } = require("./media.cjs");
const { resolveDefaultPublicDir, serveStatic } = require("./static.cjs");
const {
  AUTH_SESSION_MAX_AGE_SECONDS,
  authRequired,
  authSessionCookie,
  authSessionTokenFromRequest,
  authStatusResponse,
  authenticatedUser,
  findPasswordUser,
  hasAdminAccess,
  hasMetadataWriteAccess,
  hasRatingWriteAccess,
  isAuthorized,
  isTrustedUnsafeRequest,
  parseCookies,
  pruneAuthSessions,
  resolveAuthUsers,
  sha256,
  signedAuthSessionToken,
} = require("./auth.cjs");

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

interface LoginFailure {
  count: number;
  firstFailedAt: number;
  lockedUntil: number;
}

const INVALID_LOGIN_MESSAGE = "Invalid username or password";
const LOGIN_RATE_LIMIT_MESSAGE = "Too many failed login attempts. Try again later.";
const RATING_WRITE_FORBIDDEN_MESSAGE = "Rating editing is not allowed for this viewer";
const METADATA_WRITE_FORBIDDEN_MESSAGE = "Metadata editing is not allowed for this viewer";
const ADMIN_WRITE_FORBIDDEN_MESSAGE = "Admin actions are not allowed for this viewer";

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
  isDeleted?: boolean;
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
  updateItemTrash(id: string, isDeleted: boolean): Promise<EagleItem>;
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

const defaultPublicDir = resolveDefaultPublicDir();
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const DEFAULT_ITEMS_LIMIT = 30;
const MAX_ITEMS_LIMIT = 1000;
const MAX_ITEMS_OFFSET = 1000000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

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
  const loginFailures = new Map<string, LoginFailure>();
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
      const auth = { authSessions, loginFailures, revokedAuthSessions, secureCookies: httpsEnabled, sessionSecret: resolvedSessionSecret, users: resolvedAuthUsers };
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
    await handleConnect(req, res, setSession, auth);
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
    const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, MAX_ITEMS_OFFSET);
    const limit = boundedInteger(url.searchParams.get("limit"), DEFAULT_ITEMS_LIMIT, 1, MAX_ITEMS_LIMIT);
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

  const trashMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/trash$/);
  if (trashMatch) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    if (!hasAdminAccess(req, auth)) {
      sendJson(res, 403, { error: ADMIN_WRITE_FORBIDDEN_MESSAGE });
      return;
    }
    const itemId = decodeURIComponent(trashMatch[1]);
    const body = await readJson(req);
    if (typeof body.isDeleted !== "boolean") {
      throw new HttpError(400, "isDeleted must be a boolean");
    }
    const item = await session.client.updateItemTrash(itemId, body.isDeleted);
    sendJson(res, 200, {
      id: item.id || itemId,
      isDeleted: typeof item.isDeleted === "boolean" ? item.isDeleted : body.isDeleted,
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

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

interface AuthContext {
  authSessions: Map<string, AuthSession>;
  loginFailures: Map<string, LoginFailure>;
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
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const loginKey = loginFailureKey(req, username);
    const activeLockSeconds = activeLoginLockSeconds(auth.loginFailures, loginKey);
    if (activeLockSeconds > 0) {
      sendLoginRateLimited(res, activeLockSeconds);
      return true;
    }
    const user = findPasswordUser(username, password, auth);
    if (!user) {
      const retryAfterSeconds = recordFailedLogin(auth.loginFailures, loginKey);
      if (retryAfterSeconds > 0) {
        sendLoginRateLimited(res, retryAfterSeconds);
        return true;
      }
      sendJson(res, 401, { error: INVALID_LOGIN_MESSAGE });
      return true;
    }
    auth.loginFailures.delete(loginKey);
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
    res.end(JSON.stringify({
      ...authStatusResponse(auth, user, { authenticated: true }),
      sessionToken: token,
    }));
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return true;
    }
    const token = authSessionTokenFromRequest(req);
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

function loginFailureKey(req, username: string) {
  return `${clientAddress(req)}:${username.toLowerCase()}`;
}

function clientAddress(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwardedFor || req.socket?.remoteAddress || "unknown";
}

function activeLoginLockSeconds(loginFailures: Map<string, LoginFailure>, key: string) {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.lockedUntil > now) return Math.ceil((entry.lockedUntil - now) / 1000);
  if (now - entry.firstFailedAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.delete(key);
  }
  return 0;
}

function recordFailedLogin(loginFailures: Map<string, LoginFailure>, key: string) {
  const now = Date.now();
  const current = loginFailures.get(key);
  const entry = current && now - current.firstFailedAt <= LOGIN_FAILURE_WINDOW_MS
    ? current
    : { count: 0, firstFailedAt: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_FAILURE_LIMIT) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
  }
  loginFailures.set(key, entry);
  return entry.lockedUntil > now ? Math.ceil((entry.lockedUntil - now) / 1000) : 0;
}

function sendLoginRateLimited(res, retryAfterSeconds: number) {
  res.writeHead(429, {
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": String(Math.max(1, retryAfterSeconds)),
  });
  res.end(JSON.stringify({ error: LOGIN_RATE_LIMIT_MESSAGE }));
}

async function handleConnect(req, res, setSession, auth: AuthContext) {
  const input = await readJson(req);
  if (!hasAdminAccess(req, auth) && !isDefaultLocalEagleConnectionInput(input)) {
    sendJson(res, 403, { error: "Admin permission is required to change the Eagle API connection" });
    return;
  }
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

function isDefaultLocalEagleConnectionInput(input) {
  const host = String(input.host || "127.0.0.1").trim() || "127.0.0.1";
  const port = String(input.port || "41595").trim() || "41595";
  const token = String(input.token || "").trim();
  return ["127.0.0.1", "localhost", "::1"].includes(host) && port === "41595" && !token;
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

function sendAuthRequired(res) {
  res.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "Authentication required" }));
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
