const { readFileSync } = require("fs");
const { createServer: createHttpServer } = require("http");
const { createServer: createHttpsServer } = require("https");
const { isIP } = require("net");
const { randomBytes } = require("crypto");
const { createAddressBlockList, normalizeClientAddress } = require("./addressBlockList.cjs");
const { normalizeCustomDomain } = require("./customDomain.cjs");
const { EagleRequestError, createEagleClient, normalizeStringArray } = require("./eagleClient.cjs");
const { createConnectionContext } = require("./connection.cjs");
const { createLibraryAccessPolicy, libraryIdFor } = require("./libraryAccess.cjs");
const { readInternetShortcutUrl, servedMediaInfo, streamItemMedia } = require("./media.cjs");
const { resolveDefaultPublicDir, securityHeaders, serveStatic } = require("./static.cjs");
const { MAX_UPLOAD_BYTES, UPLOAD_PATH, UPLOAD_REQUEST_TIMEOUT_MS, UploadError, discardUpload, parseUploadRequest, receiveUpload, sweepUploads } = require("./upload.cjs");
const {
  AUTH_SESSION_MAX_AGE_SECONDS,
  authRequired,
  permissionsForUser,
  authSessionTokenFromRequest,
  authStatusResponse,
  authenticatedUser,
  expiredAuthSessionCookies,
  findPasswordUser,
  hasAdminAccess,
  hasUploadAccess,
  hasMetadataWriteAccess,
  hasRatingWriteAccess,
  isAuthorized,
  isTrustedUnsafeRequest,
  loginAuthSessionCookies,
  parseCookies,
  pruneAuthSessions,
  resolveAuthUsers,
  sha256,
  signedAuthSessionToken,
} = require("./auth.cjs");

import type { IncomingMessage, RequestListener, ServerResponse } from "http";
import type { Server as NetServer, Socket } from "net";

interface AccessLogRecorder {
  record(entry: { event: string; ext?: string; fields?: string[]; ip: string; itemId?: string; libraryId?: string; method?: string; path?: string; size?: number; status?: number; type: "auth" | "browse" | "edit" | "view"; user?: string }): unknown;
  touch(ip: string, user?: string): void;
}

interface ViewerServerOptions {
  accessLog?: AccessLogRecorder | null;
  blockedAddresses?: Array<string | { address: string; addedAt?: number }>;
  /** Believe X-Forwarded-For from a proxy on this machine. Off unless the admin confirms the proxy sets it. */
  trustForwardedFor?: boolean;
  uploadMaxBytes?: number;
  uploadRequestTimeoutMs?: number;
  /** How long a request other than an upload may take to send its body. */
  requestBodyTimeoutMs?: number;
  customDomain?: string;
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
  sessionMaxAgeSeconds?: number;
  sessionSecret?: string;
  sharedLibraries?: string[] | null;
  /** Shared libraries limited to named users; ignored unless password protection is on. */
  libraryUserRules?: Array<{ path: string; users: string[] }>;
  viewerPassword?: string;
}

type UserRole = "admin" | "editor" | "viewer";

interface AuthUser {
  canUpload?: boolean;
  passwordHash: string;
  role: UserRole;
  username: string;
}

interface AuthSession {
  canUpload?: boolean;
  expiresAt: number;
  role: UserRole;
  username: string;
}

interface LoginFailure {
  count: number;
  firstFailedAt: number;
  lockedUntil: number;
}

interface JsonObject {
  [key: string]: unknown;
}

const INVALID_LOGIN_MESSAGE = "Invalid username or password";
const LOGIN_RATE_LIMIT_MESSAGE = "Too many failed login attempts. Try again later.";
const RATING_WRITE_FORBIDDEN_MESSAGE = "Rating editing is not allowed for this viewer";
const METADATA_WRITE_FORBIDDEN_MESSAGE = "Metadata editing is not allowed for this viewer";
const ADMIN_WRITE_FORBIDDEN_MESSAGE = "Admin actions are not allowed for this viewer";
const UPLOAD_FORBIDDEN_MESSAGE = "Uploading is not allowed for this viewer";
const LIBRARY_NOT_SHARED_MESSAGE = "The library open in Eagle is not shared";
const LIBRARY_FORBIDDEN_MESSAGE = "Your account can't open the library that is open in Eagle";
const LIBRARY_CHANGED_MESSAGE = "The library open in Eagle has changed";
const LIBRARY_REQUIRED_MESSAGE = "A library id is required for library requests";
const UNTAGGED_FOLDER_ID = "__untagged__";

interface EagleLibraryInfo {
  name?: string;
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

interface ItemExtension {
  count: number;
  ext: string;
}

interface ItemTypesScan {
  complete: boolean;
  expiresAt: number;
  items: ItemExtension[];
  libraryPath: string;
  value: Promise<ItemExtension[]>;
}

interface EagleClient {
  appInfo(): Promise<unknown>;
  folders(): Promise<unknown>;
  addItemFromPath(input: { folderId?: string; name: string; path: string; tags?: string[] }): Promise<unknown>;
  itemById(id: string): Promise<EagleItem>;
  itemExtensions(options?: { onProgress?: (extensions: ItemExtension[]) => void }): Promise<ItemExtension[]>;
  legacyThumbnailPath(id: string): Promise<unknown>;
  listItems(options: {
    ext?: string | null;
    folderId?: string | null;
    isUntagged?: boolean;
    isUnfiled?: boolean;
    keywords?: string;
    limit?: string | number;
    offset?: string | number;
    rating?: string | null;
    tags?: string[];
  }): Promise<unknown>;
  listTags(options: { limit?: string | number; query?: string }): Promise<unknown>;
  searchItems(options: { limit?: string | number; offset?: string | number; query: string }): Promise<unknown>;
  smartFolderItems(options: { limit?: string | number; offset?: string | number; smartFolderId: string }): Promise<unknown>;
  smartFolders(): Promise<unknown>;
  tagCoverItem(tag: string): Promise<unknown>;
  tagOverview(): Promise<{ groups: unknown[]; starred: unknown[]; tags: unknown[] }>;
  updateItemMetadata(id: string, input: { folders?: unknown; tags?: unknown }): Promise<EagleItem>;
  updateItemStar(id: string, star: unknown): Promise<EagleItem>;
  updateItemTrash(id: string, isDeleted: boolean): Promise<EagleItem>;
}

interface EagleSession {
  clearLibraryInfo?: () => void;
  client: EagleClient;
  lastLibraryInfo?: () => unknown;
  libraryInfo(): Promise<EagleLibraryInfo>;
}

interface LibraryUser {
  role?: string;
  username: string;
}

interface LibraryAccessPolicy {
  /** Pass the signed-in user (or null) to apply per-library users; leave it out to skip them. */
  status(libraryPath: unknown, user?: { role?: string; username: string } | null): "forbidden" | "not_shared" | "shared" | "unrestricted";
}

interface ApiContext {
  /** Re-reads the open library from Eagle right before a write and throws if it changed. */
  confirmLibraryBeforeWrite: (res: ServerResponse) => Promise<void>;
  uploadMaxBytes: number;
  getSession: () => EagleSession;
  libraryAccess: LibraryAccessPolicy;
  libraryId: (libraryPath: unknown) => string;
}

const defaultPublicDir = resolveDefaultPublicDir();
const MAX_JSON_BODY_BYTES = 1024 * 1024;
// In-flight requests get this long to finish after stop() before their sockets are destroyed.
const STOP_GRACE_MS = 1000;
const DEFAULT_ITEMS_LIMIT = 30;
const MAX_ITEMS_LIMIT = 1000;
const MAX_ITEMS_OFFSET = 1000000;
// The scan reads every item, which is slow for large libraries; new extensions show up after this.
const ITEM_TYPES_CACHE_MS = 10 * 60 * 1000;
// How long a request waits for the scan before answering with the extensions found so far.
const ITEM_TYPES_PROGRESS_WAIT_MS = 1000;
const itemTypesCache = new WeakMap<object, ItemTypesScan>();
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_MAX_ENTRIES = 500;
const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const BLOCKED_LOG_INTERVAL_MS = 60 * 1000;
// Refused or failing requests tend to repeat, so the same one is logged at most this often.
const REPEATED_FAILURE_LOG_INTERVAL_MS = 60 * 1000;
const MAX_RECENT_FAILURES = 1000;

class HttpError extends Error {
  code: string;
  status: number;

  constructor(status: number, message: string, code = "") {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface LibraryGuard {
  currentLibraryId(): string;
  stillOpen(): boolean;
}

// Pinned requests remember which library they were admitted for; sendJson and media streaming
// consult this right before responding so a switch during the request never leaks the new library.
const libraryGuards = new WeakMap<ServerResponse, LibraryGuard>();

const REQUEST_BODY_TIMEOUT_MS = 60 * 1000;

// The server's requestTimeout has to cover a whole upload. Everything else sends little or nothing,
// so it doesn't get that long to hold a connection open. Only the body is timed: a slow download
// or a paused video is a finished request.
function dropStalledRequestBody(req: IncomingMessage, res: ServerResponse, timeoutMs: number) {
  // Kept here because req.socket can be null once the request has closed.
  const { socket } = req;
  const timer = setTimeout(() => {
    // The socket, since answering early closes the request while the body is still outstanding.
    if (!req.complete) socket.destroy();
  }, timeoutMs);
  timer.unref?.();
  const stopIfDone = () => {
    if (req.complete || socket.destroyed) clearTimeout(timer);
  };
  req.once("close", stopIfDone);
  res.once("close", stopIfDone);
}

function createViewerServer({
  accessLog: requestedAccessLog = null,
  blockedAddresses = [],
  customDomain = "",
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
  sessionMaxAgeSeconds = AUTH_SESSION_MAX_AGE_SECONDS,
  sessionSecret = "",
  sharedLibraries = null,
  libraryUserRules = [],
  trustForwardedFor = false,
  uploadMaxBytes = MAX_UPLOAD_BYTES,
  uploadRequestTimeoutMs = UPLOAD_REQUEST_TIMEOUT_MS,
  requestBodyTimeoutMs = REQUEST_BODY_TIMEOUT_MS,
  eagleClient = createEagleClient(),
}: ViewerServerOptions = {}) {
  let serverInstance: NetServer | null = null;
  let state = "stopped";
  let boundAddress = "";
  let boundPort = 0;
  let lastError = "";
  let requestCount = 0;
  const resolvedAuthUsers = resolveAuthUsers({ allowMetadataEditing, authUsers, basicAuthUsername, passwordHash, viewerPassword });
  const trustedCustomDomain = normalizeCustomDomain(customDomain);
  const resolvedSessionSecret = String(sessionSecret || "").trim() || randomBytes(32).toString("base64url");
  const authSessions = new Map<string, AuthSession>();
  const revokedAuthSessions = new Set<string>();
  const loginFailures = new Map<string, LoginFailure>();
  // Logging is never allowed to affect a request: a failure here only loses the log entry.
  const accessLog: AccessLogRecorder | null = requestedAccessLog && {
    record(entry) {
      try {
        return requestedAccessLog.record(entry);
      } catch {
        return undefined;
      }
    },
    touch(ip, user) {
      try {
        requestedAccessLog.touch(ip, user);
      } catch {
        // Only the connected count misses it.
      }
    },
  };
  const blockList = createAddressBlockList(blockedAddresses);
  // A blocked client usually retries in a loop, so each address is logged at most once a minute.
  const blockedLoggedAt = new Map<string, number>();
  const logBlocked = (ip: string, path = "") => {
    if (!accessLog) return;
    const at = Date.now();
    if (at - (blockedLoggedAt.get(ip) || 0) < BLOCKED_LOG_INTERVAL_MS) return;
    if (blockedLoggedAt.size > LOGIN_FAILURE_MAX_ENTRIES) blockedLoggedAt.clear();
    blockedLoggedAt.set(ip, at);
    accessLog.record({ type: "auth", event: "blocked", ip, path, status: 403 });
  };
  // Per-library users need a signed-in user to check; without password protection they are not applied.
  const libraryAccess: LibraryAccessPolicy = createLibraryAccessPolicy(sharedLibraries, resolvedAuthUsers.length ? libraryUserRules : []);
  const libraryId = (libraryPath: unknown) => libraryIdFor(libraryPath, resolvedSessionSecret);
  const currentSession: EagleSession = createConnectionContext({ client: eagleClient });
  // Bumped whenever the plugin reports a library switch.
  let libraryGeneration = 0;
  // What was known when Eagle reported a switch; it stays readable until Eagle is asked again.
  let libraryInfoBeforeSwitch: unknown = null;
  const trackLibrary = (res: ServerResponse, admittedLibraryId: string, admittedGeneration: number, user: LibraryUser | null) => {
    // Only the id of a library this user may open is ever reported, even when a request is refused mid-way.
    const currentLibraryId = () => {
      const library = currentSession.lastLibraryInfo?.() as EagleLibraryInfo | null | undefined;
      return library && libraryOpenFor(library.path, user) ? libraryId(library.path) : "";
    };
    libraryGuards.set(res, {
      currentLibraryId,
      stillOpen: () => admittedGeneration === libraryGeneration && currentLibraryId() === admittedLibraryId,
    });
  };
  // One snapshot of the open library decides sharing, the id check, and the X-Library-Id header.
  // The switch generation is read before that snapshot, so a switch at any point (between checks,
  // or while Eagle answers) fails closed instead of admitting the new library.
  const libraryOpenFor = (libraryPath: unknown, user: LibraryUser | null) => {
    const status = libraryAccess.status(libraryPath, user);
    return status === "shared" || status === "unrestricted";
  };
  const admitLibraryRequest = async (req: IncomingMessage, url: URL, res: ServerResponse, user: LibraryUser | null) => {
    const isHealth = url.pathname === "/api/health";
    const pin = libraryPinFor(url.pathname);
    const protectedLibraries = libraryAccess.status(null) !== "unrestricted";
    const admittedGeneration = libraryGeneration;
    let openLibrary: EagleLibraryInfo | null = null;
    try {
      openLibrary = await currentSession.libraryInfo();
    } catch (error) {
      // With protection on, a library that cannot be read is never served; health still answers.
      if (protectedLibraries && !isHealth) throw error;
    }
    const switched = admittedGeneration !== libraryGeneration;
    const status = openLibrary ? libraryAccess.status(openLibrary.path, user) : "not_shared";
    const shared = status !== "not_shared";
    const open = status === "shared" || status === "unrestricted";
    // The id of a library this user may not open is never sent, so it cannot be replayed after a switch.
    const openLibraryId = openLibrary && open && !switched ? libraryId(openLibrary.path) : "";
    if (openLibraryId) res.setHeader("X-Library-Id", openLibraryId);
    if (isHealth) return true;
    if (switched) {
      sendJson(res, 409, { error: LIBRARY_CHANGED_MESSAGE, code: "LIBRARY_CHANGED" });
      return false;
    }
    if (protectedLibraries && !shared) {
      sendLibraryNotShared(res);
      return false;
    }
    // Checked on every request, not only at sign-in: a session outlives a library switch in Eagle.
    if (status === "forbidden") {
      sendLibraryForbidden(res);
      return false;
    }
    if (pin === "none") {
      // /api/connect waits for its body and then reads the library again, so its answer is guarded too.
      if (openLibraryId) trackLibrary(res, openLibraryId, admittedGeneration, user);
      return true;
    }
    const expectedLibraryId = String(req.headers["x-library-id"] || url.searchParams.get("library") || "").trim();
    if (!expectedLibraryId) {
      sendJson(res, 400, { error: LIBRARY_REQUIRED_MESSAGE, code: "LIBRARY_REQUIRED" });
      return false;
    }
    if (!openLibraryId) {
      // The open library cannot be confirmed, so a pinned request is never answered.
      sendJson(res, 502, { error: "Unable to reach Eagle API" });
      return false;
    }
    if (expectedLibraryId !== openLibraryId) {
      sendJson(res, 409, { error: LIBRARY_CHANGED_MESSAGE, code: "LIBRARY_CHANGED" });
      return false;
    }
    trackLibrary(res, openLibraryId, admittedGeneration, user);
    return true;
  };
  const confirmLibraryBeforeWrite = async (res: ServerResponse) => {
    const guard = libraryGuards.get(res);
    if (!guard) return;
    currentSession.clearLibraryInfo?.();
    await currentSession.libraryInfo();
    if (!guard.stillOpen()) throw new HttpError(409, LIBRARY_CHANGED_MESSAGE, "LIBRARY_CHANGED");
  };

  const server = createProtocolServer({ httpsCertPath, httpsEnabled, httpsKeyPath }, async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || "/", `${httpsEnabled ? "https" : "http"}://${req.headers.host}`);
      if (url.pathname !== UPLOAD_PATH) dropStalledRequestBody(req, res, requestBodyTimeoutMs);
      // Direct clients are dropped when they connect; this also catches clients behind a local proxy.
      const requestAddress = displayClientAddress(req, trustForwardedFor);
      if (blockList.isBlocked(requestAddress)) {
        logBlocked(requestAddress, url.pathname);
        res.writeHead(403, { ...securityHeaders, "Connection": "close", "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Access from this address is blocked" }));
        return;
      }
      // Stays on this computer, so it names the open library even when it isn't shared with this visitor.
      // No extra Eagle lookup for this: left empty when the last known library may no longer be open.
      const logLibraryId = () => {
        const library = currentSession.lastLibraryInfo?.() as EagleLibraryInfo | null | undefined;
        return library && library !== libraryInfoBeforeSwitch ? libraryId(library.path) : "";
      };
      const recordAuth: AuthContext["recordAuth"] = (event, username, status) => {
        try {
          accessLog?.record({ type: "auth", event, ip: requestAddress, libraryId: logLibraryId(), method: req.method, path: url.pathname, status, user: username });
        } catch {
          // A sign-in never depends on its log entry.
        }
      };
      const auth = { authSessions, clientAddress: requestAddress, loginFailures, recordAuth, revokedAuthSessions, secureCookies: httpsEnabled, sessionMaxAgeSeconds, sessionSecret: resolvedSessionSecret, users: resolvedAuthUsers };
      // A refused upload must not make this server read the rest of a large body before moving on.
      if (url.pathname === UPLOAD_PATH) res.setHeader("Connection", "close");
      if (!isTrustedUnsafeRequest(req, url, trustedCustomDomain)) {
        sendJson(res, 403, { error: "Cross-origin writes are not allowed" });
        return;
      }
      const countRequest = () => attachRequestCounter(res, ({ status }) => {
        requestCount += 1;
        if (accessLog) logAccess(accessLog, req, res, url, status, authenticatedUser(req, auth)?.username || "", requestAddress, logLibraryId());
      });
      if (url.pathname.startsWith("/api/")) {
        countRequest();
        if (await handleAuthRoutes(req, url, res, auth)) return;
        if (url.pathname === "/api/library-status") {
          await handleLibraryStatus(req, res, currentSession, libraryAccess, authenticatedUser(req, auth));
          return;
        }
        if (!isAuthorized(req, auth)) {
          sendAuthRequired(res);
          return;
        }
        if (!(await admitLibraryRequest(req, url, res, authenticatedUser(req, auth)))) return;
        await handleApi(req, url, res, {
          auth,
          confirmLibraryBeforeWrite,
          getSession: () => currentSession,
          libraryAccess,
          libraryId,
          uploadMaxBytes,
        });
        return;
      }
      const fileMatch = url.pathname.match(/^\/file\/([^/]+)(?:\/[^/]+)?$/);
      if (fileMatch) {
        countRequest();
        if (!isAuthorized(req, auth)) {
          sendAuthRequired(res);
          return;
        }
        if (!(await admitLibraryRequest(req, url, res, authenticatedUser(req, auth)))) return;
        await streamItemMedia(decodeURIComponent(fileMatch[1]), "file", req, res, currentSession, libraryGuards.get(res)?.stillOpen);
        return;
      }
      await serveStatic(url.pathname, res, publicDir);
    } catch (error) {
      const status = error instanceof HttpError || error instanceof EagleRequestError || error instanceof UploadError
        ? (error as { status: number }).status
        : 500;
      const code = error instanceof HttpError && error.code ? { code: error.code } : {};
      sendJson(res, status, { error: errorMessage(error) || "Internal server error", ...code });
    }
  });
  (server as NetServer & { requestTimeout?: number }).requestTimeout = uploadRequestTimeoutMs;
  const openSockets = new Set<Socket>();
  // The raw TCP socket is reported for both HTTP and HTTPS, so destroying it also ends TLS sessions.
  server.on("connection", (socket: Socket) => {
    const remote = socket.remoteAddress || "";
    if (blockList.isBlocked(remote)) {
      logBlocked(normalizeClientAddress(remote));
      socket.destroy();
      return;
    }
    openSockets.add(socket);
    socket.once("close", () => openSockets.delete(socket));
  });

  return {
    async start() {
      if (state === "running") return this.status();
      state = "starting";
      void sweepUploads();
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
        lastError = errorMessage(error);
        throw error;
      }
    },

    async stop() {
      if (!serverInstance || state === "stopped") {
        state = "stopped";
        return this.status();
      }
      state = "stopping";
      const closingServer = serverInstance;
      // close() only stops accepting; it waits for every open socket, so keep-alive connections
      // and long media streams would keep stop() pending until the browser lets go.
      const closed = new Promise<void>((resolveStop, rejectStop) => {
        closingServer.close((error?: Error) => {
          if (error) rejectStop(error);
          else resolveStop();
        });
      });
      closeIdleSockets(closingServer);
      const forceTimer = setTimeout(() => {
        for (const socket of openSockets) socket.destroy();
      }, STOP_GRACE_MS);
      try {
        await closed;
      } finally {
        clearTimeout(forceTimer);
      }
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

    // Takes effect for the next request; open connections from a newly blocked address are closed.
    setBlockedAddresses(next: Array<string | { address: string; addedAt?: number }>) {
      blockList.replace(next);
      for (const socket of openSockets) {
        if (blockList.isBlocked(socket.remoteAddress || "")) socket.destroy();
      }
    },

    // Asks Eagle which library is open, for the access log when the server starts.
    async openLibraryId() {
      const library = await currentSession.libraryInfo();
      return libraryId(library?.path);
    },

    // Called when Eagle reports a library switch so no request is answered from stale library info,
    // including requests that are already in progress.
    notifyLibraryChanged() {
      libraryGeneration += 1;
      libraryInfoBeforeSwitch = currentSession.lastLibraryInfo?.();
      currentSession.clearLibraryInfo?.();
    },

    server,
  };
}

// Public so the viewer can show the offline page before sign-in. It never names the library,
// and with protection off it answers without asking Eagle.
// A visitor who is not signed in never learns who may open the library; "forbidden" is only
// reported to a signed-in user the library is not shared with.
async function handleLibraryStatus(req: IncomingMessage, res: ServerResponse, session: EagleSession, libraryAccess: LibraryAccessPolicy, user: LibraryUser | null) {
  if (req.method !== "GET") {
    sendMethodNotAllowed(res, ["GET"]);
    return;
  }
  let libraryStatus: "forbidden" | "not_shared" | "shared" | null = "shared";
  if (libraryAccess.status(null) !== "unrestricted") {
    const library = await session.libraryInfo().catch(() => null);
    const status = library ? libraryAccess.status(library.path, user ?? undefined) : null;
    libraryStatus = status === null ? null : status === "not_shared" ? "not_shared" : status === "forbidden" ? "forbidden" : "shared";
  }
  sendJson(res, 200, { libraryStatus });
}

type LibraryPin = "none" | "required";

// Viewers send the library id they connected to, as the X-Library-Id header on fetches or a
// `library` query parameter on media URLs (media elements cannot send headers).
// Every request that reads or changes library data must name the library it expects, because an
// item or folder id alone could match whichever library Eagle has open. `/api/connect` and
// `/api/health` hand out the id, so they are never pinned (auth routes and /api/library-status are
// answered before this check).
function libraryPinFor(pathname: string): LibraryPin {
  if (pathname === "/api/connect" || pathname === "/api/health") return "none";
  return "required";
}

// Node 18.2+ can drop keep-alive sockets that have no request in flight right away.
function closeIdleSockets(server: NetServer) {
  (server as NetServer & { closeIdleConnections?: () => void }).closeIdleConnections?.();
}

function createProtocolServer({ httpsCertPath = "", httpsEnabled = false, httpsKeyPath = "" }: {
  httpsCertPath?: string;
  httpsEnabled?: boolean;
  httpsKeyPath?: string;
}, handler: RequestListener): NetServer {
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

async function cachedItemTypes(session: { client: EagleClient; libraryInfo(): Promise<unknown> }) {
  const library = await session.libraryInfo().catch(() => null);
  const libraryPath = String((library as { path?: unknown } | null)?.path || "");
  let scan = itemTypesCache.get(session.client);
  if (!scan || scan.libraryPath !== libraryPath || (scan.complete && scan.expiresAt <= Date.now())) {
    const nextScan: ItemTypesScan = { complete: false, expiresAt: Infinity, items: [], libraryPath, value: Promise.resolve([]) };
    nextScan.value = session.client.itemExtensions({
      onProgress: (items) => {
        if (!nextScan.complete) nextScan.items = items;
      },
    });
    nextScan.value.then(
      (items) => Object.assign(nextScan, { complete: true, expiresAt: Date.now() + ITEM_TYPES_CACHE_MS, items }),
      () => {
        if (itemTypesCache.get(session.client) === nextScan) itemTypesCache.delete(session.client);
      },
    );
    itemTypesCache.set(session.client, nextScan);
    scan = nextScan;
  }
  // Large libraries take many pages to scan, so answer with what has been found so far and let
  // the viewer ask again until the scan is complete.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      scan.value,
      new Promise((resolve) => {
        timer = setTimeout(resolve, ITEM_TYPES_PROGRESS_WAIT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return { complete: scan.complete, items: scan.items };
}

async function handleApi(req: IncomingMessage, url: URL, res: ServerResponse, { auth, confirmLibraryBeforeWrite, getSession, libraryAccess, libraryId, uploadMaxBytes }: ApiContext & { auth: AuthContext }) {
  const session = getSession();

  if (url.pathname === "/api/connect") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    await handleConnect(req, res, session, libraryId, libraryAccess, authenticatedUser(req, auth), hasUploadAccess(req, auth) ? uploadMaxBytes : undefined);
    return;
  }

  if (url.pathname === "/api/health") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    const [app, library] = await Promise.allSettled([
      session.client.appInfo(),
      session.libraryInfo(),
    ]);
    const libraryInfo = library.status === "fulfilled" ? library.value : null;
    const accessStatus = libraryInfo ? libraryAccess.status(libraryInfo.path, authenticatedUser(req, auth)) : null;
    const libraryStatus = accessStatus === null ? null : accessStatus === "not_shared" ? "not_shared" : accessStatus === "forbidden" ? "forbidden" : "shared";
    sendJson(res, 200, {
      app: app.status === "fulfilled" ? app.value : null,
      library: libraryStatus === "shared" ? publicLibraryInfo(libraryInfo, libraryId) : null,
      libraryStatus,
      error: app.status === "rejected" ? app.reason.message : null,
      // Changing the upload permission keeps sessions valid, so open viewers learn about it here.
      permissions: permissionsForUser(authenticatedUser(req, auth), { authenticated: true }),
      uploadMaxBytes: hasUploadAccess(req, auth) ? uploadMaxBytes : undefined,
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

  if (url.pathname === "/api/smart-folders") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    sendJson(res, 200, await session.client.smartFolders());
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
    const smartFolderId = url.searchParams.get("smartFolderId")?.trim();
    const tags = [...url.searchParams.getAll("tags"), ...url.searchParams.getAll("tag")]
      .map((tag) => tag.trim())
      .filter(Boolean);
    const hasStructuredFilters = Boolean(
      url.searchParams.get("folderId") || url.searchParams.get("ext") || url.searchParams.get("rating") || tags.length,
    );
    const folderId = url.searchParams.get("folderId");
    const result = smartFolderId
      ? await session.client.smartFolderItems({ smartFolderId, offset, limit })
      : query && !hasStructuredFilters
      ? await session.client.searchItems({ query, offset, limit })
      : await session.client.listItems({
          offset,
          limit,
          keywords: query,
          folderId: folderId === UNTAGGED_FOLDER_ID ? undefined : folderId,
          isUntagged: folderId === UNTAGGED_FOLDER_ID,
          isUnfiled: folderId === "__uncategorized__",
          ext: url.searchParams.get("ext"),
          rating: url.searchParams.get("rating"),
          tags,
        });
    sendJson(res, 200, result);
    return;
  }

  if (url.pathname === "/api/item-types") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    sendJson(res, 200, await cachedItemTypes(session));
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

  if (url.pathname === "/api/tag-overview") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    sendJson(res, 200, await session.client.tagOverview());
    return;
  }

  if (url.pathname === "/api/tag-cover") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    const tag = url.searchParams.get("tag")?.trim();
    if (!tag) {
      sendJson(res, 400, { error: "tag is required" });
      return;
    }
    sendJson(res, 200, { item: await session.client.tagCoverItem(tag) });
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
    editedItems.set(res, { fields: ["rating"] });
    await confirmLibraryBeforeWrite(res);
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
    // Named from the request: no await may separate the library check below from the write.
    editedItems.set(res, { fields: (["tags", "folders"] as const).filter((field) => metadataPatch[field] !== undefined) });
    await confirmLibraryBeforeWrite(res);
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
    editedItems.set(res, { event: body.isDeleted ? "trash" : "restore" });
    await confirmLibraryBeforeWrite(res);
    const item = await session.client.updateItemTrash(itemId, body.isDeleted);
    sendJson(res, 200, {
      id: item.id || itemId,
      isDeleted: typeof item.isDeleted === "boolean" ? item.isDeleted : body.isDeleted,
    });
    return;
  }

  if (url.pathname === UPLOAD_PATH) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return;
    }
    if (!hasUploadAccess(req, auth)) {
      sendJson(res, 403, { error: UPLOAD_FORBIDDEN_MESSAGE });
      return;
    }
    const upload = parseUploadRequest(req, url, uploadMaxBytes);
    editedItems.set(res, { ext: upload.extension.slice(1), size: upload.size });
    void sweepUploads();
    const filePath = await receiveUpload(req, { extension: upload.extension });
    try {
      // A library switch during a long upload must not put the file in the other library.
      await confirmLibraryBeforeWrite(res);
      const added = await session.client.addItemFromPath({ path: filePath, name: upload.name, folderId: upload.folderId, tags: upload.tags });
      editedItems.set(res, { ext: upload.extension.slice(1), itemId: addedItemId(added), size: upload.size });
    } catch (error) {
      await discardUpload(filePath);
      throw error;
    }
    sendJson(res, 201, { name: upload.name });
    return;
  }

  const urlPreviewMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/url-preview$/);
  if (urlPreviewMatch) {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res, ["GET"]);
      return;
    }
    const shortcutUrl = await readInternetShortcutUrl(decodeURIComponent(urlPreviewMatch[1]), session);
    if (!shortcutUrl) {
      sendJson(res, 404, { error: "URL preview is unavailable" });
      return;
    }
    sendJson(res, 200, { url: shortcutUrl });
    return;
  }

  const mediaMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/(thumb|file)$/);
  if (mediaMatch) {
    await streamItemMedia(decodeURIComponent(mediaMatch[1]), mediaMatch[2], req, res, session, libraryGuards.get(res)?.stillOpen);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const rawValue = String(value ?? "").trim();
  const parsed = /^-?\d+$/.test(rawValue) ? Number(rawValue) : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

interface AuthContext {
  authSessions: Map<string, AuthSession>;
  /** The client as the log and block list see it, so a trusted proxy's clients are locked out one by one. */
  clientAddress?: string;
  loginFailures: Map<string, LoginFailure>;
  revokedAuthSessions: Set<string>;
  secureCookies?: boolean;
  sessionMaxAgeSeconds: number;
  /** Writes login and logout outcomes to the access log; never given the password. */
  recordAuth?: (event: "login_failure" | "login_locked" | "login_success" | "logout", username: string, status: number) => void;
  sessionSecret: string;
  users: AuthUser[];
}

async function handleAuthRoutes(req: IncomingMessage, url: URL, res: ServerResponse, auth: AuthContext) {
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
    const loginKey = loginFailureKey(auth.clientAddress || clientAddress(req), username);
    const activeLockSeconds = activeLoginLockSeconds(auth.loginFailures, loginKey);
    if (activeLockSeconds > 0) {
      auth.recordAuth?.("login_locked", username, 429);
      sendLoginRateLimited(res, activeLockSeconds);
      return true;
    }
    const user = findPasswordUser(username, password, auth);
    if (!user) {
      const retryAfterSeconds = recordFailedLogin(auth.loginFailures, loginKey);
      if (retryAfterSeconds > 0) {
        auth.recordAuth?.("login_locked", username, 429);
        sendLoginRateLimited(res, retryAfterSeconds);
        return true;
      }
      auth.recordAuth?.("login_failure", username, 401);
      sendJson(res, 401, { error: INVALID_LOGIN_MESSAGE });
      return true;
    }
    auth.recordAuth?.("login_success", user.username, 200);
    auth.loginFailures.delete(loginKey);
    pruneAuthSessions(auth.authSessions);
    const session = {
      expiresAt: Date.now() + auth.sessionMaxAgeSeconds * 1000,
      role: user.role,
      username: user.username,
    };
    const token = signedAuthSessionToken(session, auth);
    auth.authSessions.set(token, session);
    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": loginAuthSessionCookies(token, auth.secureCookies, auth.sessionMaxAgeSeconds),
    });
    res.end(JSON.stringify(authStatusResponse(auth, user, { authenticated: true })));
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res, ["POST"]);
      return true;
    }
    const token = authSessionTokenFromRequest(req, auth.secureCookies);
    const signedInUser = authenticatedUser(req, auth);
    if (signedInUser) auth.recordAuth?.("logout", signedInUser.username, 200);
    if (token) {
      auth.authSessions.delete(token);
      auth.revokedAuthSessions.add(token);
    }
    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": expiredAuthSessionCookies(auth.secureCookies),
    });
    res.end(JSON.stringify(authStatusResponse(auth, null, { authenticated: !authRequired(auth) })));
    return true;
  }

  return false;
}

function loginFailureKey(address: string, username: string) {
  return `${address}:${username.toLowerCase()}`;
}

function clientAddress(req: IncomingMessage) {
  return req.socket?.remoteAddress || "unknown";
}

// Status polls and thumbnails only mark the client as connected; everything else becomes an entry.
const PRESENCE_ONLY_PATHS = new Set(["/api/auth/status", "/api/connect", "/api/health", "/api/library-status"]);

const recentFailures = new WeakMap<AccessLogRecorder, Map<string, number>>();

function isRepeatedFailure(accessLog: AccessLogRecorder, key: string) {
  let failures = recentFailures.get(accessLog);
  if (!failures) {
    failures = new Map();
    recentFailures.set(accessLog, failures);
  }
  const now = Date.now();
  const last = failures.get(key);
  if (last !== undefined && now - last < REPEATED_FAILURE_LOG_INTERVAL_MS) return true;
  // Re-inserted so the Map stays oldest first; past the cap, the oldest failure is forgotten.
  failures.delete(key);
  failures.set(key, now);
  if (failures.size > MAX_RECENT_FAILURES) {
    const oldest = failures.keys().next().value;
    if (oldest !== undefined) failures.delete(oldest);
  }
  return false;
}

function logAccess(accessLog: AccessLogRecorder, req: IncomingMessage, res: ServerResponse, url: URL, status: number, user: string, ip: string, libraryId: string) {
  const pathname = url.pathname;
  // Login and logout write their own entries with the outcome.
  if (pathname.startsWith("/api/auth/") && pathname !== "/api/auth/status") return;
  if (libraryForbiddenResponses.has(res)) {
    // Signed in, but not one of the users the open library is limited to (Connect included).
    if (!isRepeatedFailure(accessLog, `library_denied\u0000${ip}\u0000${user}\u0000${libraryId}`)) {
      accessLog.record({ type: "auth", event: "library_denied", ip, libraryId, method: req.method, path: pathname, status: 403, user });
    }
    return;
  }
  if (PRESENCE_ONLY_PATHS.has(pathname) || /^\/api\/items\/[^/]+\/thumb$/.test(pathname)) {
    if (status < 400) {
      accessLog.touch(ip, user);
      return;
    }
    // Only a failed Connect is worth keeping: it is why someone can't get into the viewer.
    if (pathname !== "/api/connect" || isRepeatedFailure(accessLog, `${ip}\u0000${pathname}\u0000${status}`)) return;
    accessLog.record({ ip, libraryId, method: req.method, status, user, type: "browse", event: "connect", path: pathname });
    return;
  }
  const base = { ip, libraryId, method: req.method, status, user };
  const media = pathname.match(/^\/file\/([^/]+)/) || pathname.match(/^\/api\/items\/([^/]+)\/file$/);
  if (media) {
    // A failed fetch stays in the history (under Views); the summary leaves it out of the view counts.
    if (status >= 400) {
      // A player may keep retrying a file it can't get.
      if (!isRepeatedFailure(accessLog, `${ip}\u0000${pathname}\u0000${status}`)) {
        accessLog.record({ ...base, type: "view", event: "view_failed", itemId: safeDecode(media[1]), path: pathname });
      }
      return;
    }
    // A video plays as many range requests, and players probe first: HEAD, or Safari's
    // "bytes=0-1". Only the request that starts reading the file counts as a view.
    const range = String(req.headers.range || "").trim();
    if (req.method === "HEAD" || (range && (!/^bytes=0-/.test(range) || /^bytes=0-[01]$/.test(range)))) {
      accessLog.touch(ip, user);
      return;
    }
    const served = servedMediaInfo(res);
    accessLog.record({ ...base, type: "view", event: "view", ext: served?.ext, itemId: safeDecode(media[1]), path: pathname, size: served?.size });
    return;
  }
  const urlPreview = pathname.match(/^\/api\/items\/([^/]+)\/url-preview$/);
  if (urlPreview) {
    if (status < 400 || !isRepeatedFailure(accessLog, `${ip}\u0000${pathname}\u0000${status}`)) {
      accessLog.record({ ...base, type: "view", event: status >= 400 ? "view_failed" : "url_preview", itemId: safeDecode(urlPreview[1]), path: pathname });
    }
    return;
  }
  if (pathname === UPLOAD_PATH) {
    const noted = editedItems.get(res);
    accessLog.record({ ...base, type: "edit", event: "upload", ext: noted?.ext || undefined, itemId: noted?.itemId, path: pathname, size: noted?.size });
    return;
  }
  const edit = pathname.match(/^\/api\/items\/([^/]+)\/(star|metadata|trash)$/);
  if (edit) {
    const noted = editedItems.get(res);
    accessLog.record({ ...base, type: "edit", event: noted?.event || edit[2], fields: noted?.fields, itemId: safeDecode(edit[1]), path: pathname });
    return;
  }
  // Browsing itself isn't kept, only that this device is connected. A failure is kept for working
  // out why something didn't load, such as Eagle not answering.
  if (status < 400) {
    accessLog.touch(ip, user);
    return;
  }
  if (isRepeatedFailure(accessLog, `${ip}\u0000${pathname}\u0000${status}`)) return;
  accessLog.record({ ...base, type: "browse", event: pathname.replace(/^\/api\//, "") || "api", path: pathname });
}

// Requests relayed by a proxy on this machine (a tunnel for the custom domain) carry the real
// client in X-Forwarded-For. A proxy that forwards the header unchanged lets the client choose
// every hop, so it is believed only when the admin turns it on, only from loopback, and only its
// last hop: proxies that append put the peer they saw there.
function displayClientAddress(req: IncomingMessage, trustForwardedFor: boolean) {
  const remote = normalizeClientAddress(clientAddress(req));
  if (!trustForwardedFor || !isLoopbackAddress(remote)) return remote;
  const header = req.headers["x-forwarded-for"];
  const hops = (Array.isArray(header) ? header.join(",") : String(header || "")).split(",").map((hop) => hop.trim()).filter(Boolean);
  const forwarded = normalizeClientAddress(stripForwardedPort(hops.at(-1) || ""));
  return isIP(forwarded) ? forwarded : remote;
}

// Some proxies append "203.0.113.5:51234" or "[2001:db8::1]:443"; a bare IPv6 address is left as is.
function stripForwardedPort(hop: string) {
  const bracketed = hop.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  const ipv4WithPort = hop.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  return ipv4WithPort ? ipv4WithPort[1] : hop;
}

function isLoopbackAddress(address: string) {
  return address === "::1" || address.startsWith("127.");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function activeLoginLockSeconds(loginFailures: Map<string, LoginFailure>, key: string) {
  const now = Date.now();
  pruneLoginFailures(loginFailures, now);
  const entry = loginFailures.get(key);
  if (!entry) {
    return loginFailures.size >= LOGIN_FAILURE_MAX_ENTRIES
      ? loginFailureCapacityRetryAfterSeconds(loginFailures, now)
      : 0;
  }
  if (entry.lockedUntil > now) return Math.ceil((entry.lockedUntil - now) / 1000);
  return 0;
}

function recordFailedLogin(loginFailures: Map<string, LoginFailure>, key: string) {
  const now = Date.now();
  pruneLoginFailures(loginFailures, now);
  const current = loginFailures.get(key);
  if (!current && loginFailures.size >= LOGIN_FAILURE_MAX_ENTRIES) {
    return loginFailureCapacityRetryAfterSeconds(loginFailures, now);
  }
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

function pruneLoginFailures(loginFailures: Map<string, LoginFailure>, now = Date.now()) {
  for (const [key, entry] of loginFailures) {
    if (entry.lockedUntil <= now && now - entry.firstFailedAt > LOGIN_FAILURE_WINDOW_MS) {
      loginFailures.delete(key);
    }
  }
}

function loginFailureCapacityRetryAfterSeconds(loginFailures: Map<string, LoginFailure>, now: number) {
  let earliestExpiry = Number.POSITIVE_INFINITY;
  for (const entry of loginFailures.values()) {
    const expiresAt = Math.max(
      entry.lockedUntil,
      entry.firstFailedAt + LOGIN_FAILURE_WINDOW_MS + 1,
    );
    earliestExpiry = Math.min(earliestExpiry, expiresAt);
  }
  const retryAt = Number.isFinite(earliestExpiry) ? earliestExpiry : now + LOGIN_FAILURE_WINDOW_MS;
  return Math.max(1, Math.ceil((retryAt - now) / 1000));
}

function sendLoginRateLimited(res: ServerResponse, retryAfterSeconds: number) {
  res.writeHead(429, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": String(Math.max(1, retryAfterSeconds)),
  });
  res.end(JSON.stringify({ error: LOGIN_RATE_LIMIT_MESSAGE }));
}

// The Eagle API connection is fixed server-side; viewer clients can only check it, never repoint it.
async function handleConnect(req: IncomingMessage, res: ServerResponse, session: EagleSession, libraryId: ApiContext["libraryId"], libraryAccess: LibraryAccessPolicy, user: LibraryUser | null, uploadMaxBytes?: number) {
  await readJson(req);
  try {
    const [app, library] = await Promise.all([
      session.client.appInfo(),
      session.libraryInfo(),
    ]);
    // The library is read again after the body arrives; it may no longer be the shared one.
    const status = library ? libraryAccess.status(library.path, user) : null;
    if (status === "not_shared") {
      sendLibraryNotShared(res);
      return;
    }
    if (status === "forbidden") {
      sendLibraryForbidden(res);
      return;
    }
    sendJson(res, 200, { app, library: publicLibraryInfo(library, libraryId), uploadMaxBytes });
  } catch (error) {
    sendJson(res, 502, { error: `Unable to connect to Eagle API: ${errorMessage(error)}` });
  }
}

function addedItemId(added: unknown) {
  const id = (added as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && id ? id : undefined;
}

// Library paths reveal the host's directory layout, so clients only get the display name.
function publicLibraryInfo(library: EagleLibraryInfo | null | undefined, libraryId: ApiContext["libraryId"]) {
  return library ? { id: libraryId(library.path), name: String(library.name || "") } : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const guard = libraryGuards.get(res);
  if (guard && !guard.stillOpen()) {
    // Eagle switched libraries while this request was in progress: report the new id and never
    // send a successful answer that may come from the new library.
    const currentLibraryId = guard.currentLibraryId();
    if (currentLibraryId) res.setHeader("X-Library-Id", currentLibraryId);
    if (status < 400) {
      status = 409;
      body = { error: LIBRARY_CHANGED_MESSAGE, code: "LIBRARY_CHANGED" };
    }
  }
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

function normalizeMetadataPatch(body: JsonObject) {
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

// What an edit request changed, for the access log: the field names, never their values.
const editedItems = new WeakMap<ServerResponse, { event?: string; ext?: string; fields?: string[]; itemId?: string; size?: number }>();

function sendLibraryNotShared(res: ServerResponse) {
  sendJson(res, 503, { error: LIBRARY_NOT_SHARED_MESSAGE, code: "LIBRARY_NOT_SHARED" });
}

// Responses refused because the signed-in user may not open the library; the access log names them.
const libraryForbiddenResponses = new WeakSet<ServerResponse>();

function sendLibraryForbidden(res: ServerResponse) {
  libraryForbiddenResponses.add(res);
  sendJson(res, 403, { error: LIBRARY_FORBIDDEN_MESSAGE, code: "LIBRARY_FORBIDDEN" });
}

function sendAuthRequired(res: ServerResponse) {
  res.writeHead(401, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error: "Authentication required" }));
}

// Reports when the response starts, because many never finish: a video or audio player drops its
// connection partway through, and a long stream would otherwise show up only once it ended.
// `res.end()` and `res.write()` go through writeHead too, so every response is seen once.
function attachRequestCounter(res: ServerResponse, onStart: (stats: { status: number }) => void) {
  const writeHead = res.writeHead;
  res.writeHead = function reportingWriteHead(this: ServerResponse, ...args: Parameters<ServerResponse["writeHead"]>) {
    const result = writeHead.apply(this, args);
    res.writeHead = writeHead;
    try {
      onStart({ status: res.statusCode });
    } catch {
      // The response is already on its way; a counting or logging failure stays out of it.
    }
    return result;
  } as ServerResponse["writeHead"];
}

async function readJson(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large");
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
module.exports = { createViewerServer, resolveDefaultPublicDir, sha256 };
