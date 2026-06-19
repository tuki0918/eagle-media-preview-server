const { createHash, createHmac, pbkdf2Sync, timingSafeEqual } = require("crypto");

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

interface AuthContext {
  authSessions: Map<string, AuthSession>;
  revokedAuthSessions: Set<string>;
  secureCookies?: boolean;
  sessionSecret: string;
  users: AuthUser[];
}

const PASSWORD_HASH_ALGORITHM = "sha256";
const PASSWORD_HASH_KEY_LENGTH = 32;
const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const AUTH_USER_CACHE = Symbol("authUser");
const MIN_PASSWORD_HASH_ITERATIONS = 100000;
const MAX_PASSWORD_HASH_ITERATIONS = 1000000;

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
  return Boolean(origin) && origin === expectedOrigin;
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
  const token = authSessionTokenFromRequest(req);
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

function authSessionTokenFromRequest(req) {
  return bearerAuthToken(req.headers.authorization) || parseCookies(req.headers.cookie || "").viewer_session;
}

function bearerAuthToken(value) {
  const header = headerValue(value);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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

module.exports = {
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
};
