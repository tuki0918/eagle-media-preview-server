const { chmod, mkdir, readFile, stat, writeFile } = require("fs").promises;
const { createPrivateKey, createPublicKey, pbkdf2Sync, randomBytes, X509Certificate } = require("crypto");
const { dirname, join } = require("path");
const { homedir, networkInterfaces } = require("os");
const { createViewerServer } = require("./viewerServer.cjs");
const { accessLogCsv, createAccessLog } = require("./accessLog.cjs");
const { normalizeBlockedAddress, normalizeBlockedAddresses } = require("./addressBlockList.cjs");
const { serverRestartSettingsChanged } = require("./settingsChange.cjs");
const { normalizeCustomDomain } = require("./customDomain.cjs");
const { libraryIdFor, libraryNameFromPath, libraryPathKey, normalizeSharedLibraries } = require("./libraryAccess.cjs");

type ServerStatus = "error" | "running" | "stopped";
type UserRole = "admin" | "editor" | "viewer";

interface AuthUser {
  passwordHash: string;
  role: UserRole;
  username: string;
}

interface SharedLibrary {
  /** "selected" limits the library to `users`; absent means every signed-in user. */
  access?: "selected";
  name: string;
  path: string;
  users?: string[];
}

interface BlockedAddress {
  address: string;
  addedAt: number;
}

interface PluginSettings {
  blockedAddresses: BlockedAddress[];
  customDomain: string;
  allowMetadataEditing: boolean;
  authUsers: AuthUser[];
  autoStart: boolean;
  authEnabled: boolean;
  basicAuthUser: string;
  host: string;
  httpsCertPath: string;
  httpsEnabled: boolean;
  httpsKeyPath: string;
  lastServerStatus: ServerStatus;
  libraryProtectionEnabled: boolean;
  passwordHash: string;
  port: number;
  sessionDurationDays: number;
  sessionSecret: string;
  settingsVersion: number;
  sharedLibraries: SharedLibrary[];
  trustForwardedFor: boolean;
}

type SettingsInput = Partial<Omit<PluginSettings, "port">> & {
  port?: unknown;
  userPasswords?: unknown;
};

interface SettingsStore {
  filePath?: string;
  load(): Promise<PluginSettings>;
  save(input?: SettingsInput): Promise<PluginSettings>;
}

interface LanAddress {
  address: string;
  label: string;
}

interface ViewerStatus {
  host: string;
  lastError?: string;
  port: number;
  state: string;
}

interface ManagedViewer {
  notifyLibraryChanged?(): void;
  openLibraryId?(): Promise<string>;
  setBlockedAddresses?(addresses: BlockedAddress[]): void;
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  status(): ViewerStatus;
}

interface LibraryListInput {
  /** The library open in Eagle, from the plugin API (`eagle.library`). */
  current?: { name?: unknown; path?: unknown } | null;
  /** Eagle's user data folder (`eagle.app.getPath("userData")`), which holds its `Settings` file. */
  userDataPath?: unknown;
}

interface LibraryCandidate extends SharedLibrary {
  current: boolean;
  shared: boolean;
}

type AccessLog = ReturnType<typeof createAccessLog>;

interface ServerManagerOptions {
  accessLog?: AccessLog;
  lanAddressProvider?: () => LanAddress[];
  defaultEagleUserDataPath?: () => string;
  settingsStore?: SettingsStore;
  viewerServerFactory?: (settings: {
    customDomain: string;
    authUsers: AuthUser[];
    host: string;
    httpsCertPath: string;
    httpsEnabled: boolean;
    httpsKeyPath: string;
    port: number;
    sessionMaxAgeSeconds: number;
    sessionSecret: string;
    sharedLibraries: string[] | null;
    libraryUserRules?: Array<{ path: string; users: string[] }>;
    accessLog?: AccessLog;
    blockedAddresses?: BlockedAddress[];
    trustForwardedFor?: boolean;
  }) => ManagedViewer;
}

interface NetworkEntry {
  address: string;
  family: string;
  internal: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  blockedAddresses: [],
  customDomain: "",
  allowMetadataEditing: false,
  authUsers: [],
  autoStart: false,
  host: "127.0.0.1",
  port: 41532,
  authEnabled: false,
  basicAuthUser: "eagle",
  httpsCertPath: "",
  httpsEnabled: false,
  httpsKeyPath: "",
  passwordHash: "",
  lastServerStatus: "stopped",
  libraryProtectionEnabled: false,
  sessionDurationDays: 7,
  sessionSecret: "",
  settingsVersion: 2,
  sharedLibraries: [],
  trustForwardedFor: false,
};
const CURRENT_SETTINGS_VERSION = 2;
const MIN_SESSION_DURATION_DAYS = 1;
const MAX_SESSION_DURATION_DAYS = 365;
const PASSWORD_HASH_ALGORITHM = "sha256";
const PASSWORD_HASH_ITERATIONS = 210000;
const PASSWORD_HASH_KEY_LENGTH = 32;

function defaultSettingsPath() {
  return join(homedir(), ".eagle-media-preview-server", "settings.json");
}

function createSettingsStore({ filePath = defaultSettingsPath() }: { filePath?: string } = {}) {
  // save() reads the file, merges and writes it back, and load() writes it when migrating or
  // creating it. Either running alongside a save could write back stale settings over the save, so
  // all file access runs one at a time.
  let fileChain: Promise<unknown> = Promise.resolve();
  function queued<T>(task: () => Promise<T>) {
    const run = fileChain.then(task);
    fileChain = run.catch(() => {});
    return run;
  }

  // Reads (and migrates or creates) the file; only called from inside the queue.
  async function loadNow() {
    try {
      const raw = await readFile(filePath, "utf8");
      const input = withLoadableCustomDomain(JSON.parse(raw));
      const settings = normalizeSettings(input);
      if (needsSettingsMigration(input, settings)) {
        const migrated = withSessionSecret(settings);
        await writeSettingsFile(filePath, migrated);
        return migrated;
      }
      return settings;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        const created = createDefaultSettings();
        await writeSettingsFile(filePath, created);
        return created;
      }
      throw error;
    }
  }

  const store = {
    filePath,
    load: () => queued(loadNow),
    save: (input: SettingsInput = {}) => queued(() => saveNow(input)),
  };

  async function saveNow(input: SettingsInput) {
    const current = await loadNow();
    validateAuthUsersInput(input.authUsers);
    const next = withSessionSecret(normalizeSettings({ ...current, ...input }));
    const userPasswords = normalizeUserPasswords(input.userPasswords);

    if (userPasswords.size) {
      next.authUsers = next.authUsers.map((user) => {
        const password = userPasswords.get(user.username);
        return password ? { ...user, passwordHash: hashPassword(password) } : user;
      });
    }

    if (next.authEnabled && authUsersMissingPassword(next.authUsers)) {
      throw new Error("Password is required for every enabled user");
    }
    if (next.httpsEnabled && (!next.httpsCertPath || !next.httpsKeyPath)) {
      throw new Error("HTTPS requires certificate and key paths");
    }
    if (next.httpsEnabled) {
      await validateHttpsCredentials(next.httpsCertPath, next.httpsKeyPath);
    }
    if (!next.authEnabled) {
      if (input.allowMetadataEditing === true) {
        throw new Error("Password protection is required when metadata editing is enabled");
      }
      next.passwordHash = "";
      next.allowMetadataEditing = false;
    }
    if (next.authUsers.length) {
      next.basicAuthUser = next.authUsers[0].username;
      next.passwordHash = next.authEnabled ? next.authUsers[0].passwordHash : "";
      next.allowMetadataEditing = next.authEnabled && authUsersCanEditMetadata(next.authUsers);
    }

    await writeSettingsFile(filePath, next);
    return next;
  }

  return store;
}

async function writeSettingsFile(filePath: string, settings: PluginSettings) {
  const settingsDir = dirname(filePath);
  await mkdir(settingsDir, { recursive: true, mode: 0o700 });
  await chmod(settingsDir, 0o700);
  await writeFile(filePath, `${JSON.stringify(canonicalSettings(settings), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(filePath, 0o600);
}

function createDefaultSettings(): PluginSettings {
  return withSessionSecret({ ...DEFAULT_SETTINGS });
}

// A hand-edited invalid hostname must not block startup or saving; fall back to the automatic URL.
function withLoadableCustomDomain(input: SettingsInput) {
  try {
    normalizeCustomDomain(input?.customDomain);
    return input;
  } catch {
    return { ...input, customDomain: "" };
  }
}

function normalizeSettings(input: SettingsInput = {}): PluginSettings {
  const rawPort = String(input.port ?? DEFAULT_SETTINGS.port).trim();
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("port must be an integer from 1-65535");
  }
  const authUsers = normalizeAuthUsers(input.authUsers, input);
  const authEnabled = Boolean(input.authEnabled ?? DEFAULT_SETTINGS.authEnabled);
  const firstAuthUser = authUsers[0];
  const sessionDurationDays = normalizeSessionDurationDays(input.sessionDurationDays);
  return {
    blockedAddresses: normalizeBlockedAddresses(input.blockedAddresses),
    customDomain: normalizeCustomDomain(input.customDomain),
    autoStart: Boolean(input.autoStart ?? DEFAULT_SETTINGS.autoStart),
    allowMetadataEditing: authEnabled && authUsersCanEditMetadata(authUsers),
    authUsers,
    host: String(input.host || DEFAULT_SETTINGS.host).trim() || DEFAULT_SETTINGS.host,
    httpsCertPath: String(input.httpsCertPath || "").trim(),
    httpsEnabled: Boolean(input.httpsEnabled ?? DEFAULT_SETTINGS.httpsEnabled),
    httpsKeyPath: String(input.httpsKeyPath || "").trim(),
    port,
    sessionDurationDays,
    sessionSecret: String(input.sessionSecret || "").trim(),
    settingsVersion: CURRENT_SETTINGS_VERSION,
    authEnabled,
    basicAuthUser: firstAuthUser?.username || String(input.basicAuthUser || DEFAULT_SETTINGS.basicAuthUser).trim() || DEFAULT_SETTINGS.basicAuthUser,
    passwordHash: authEnabled ? firstAuthUser?.passwordHash || "" : "",
    lastServerStatus: isServerStatus(input.lastServerStatus)
      ? input.lastServerStatus
      : DEFAULT_SETTINGS.lastServerStatus,
    libraryProtectionEnabled: Boolean(input.libraryProtectionEnabled ?? DEFAULT_SETTINGS.libraryProtectionEnabled),
    sharedLibraries: withKnownLibraryUsers(normalizeSharedLibraries(input.sharedLibraries), authUsers),
    trustForwardedFor: input.trustForwardedFor === true,
  };
}

// A deleted user is dropped from every library that names them; a library left with no users
// stays limited (nobody can open it) rather than opening to everyone.
function withKnownLibraryUsers(libraries: SharedLibrary[], authUsers: AuthUser[]) {
  const known = new Set(authUsers.map((user) => user.username));
  return libraries.map((library) => library.access === "selected"
    ? { ...library, users: (library.users || []).filter((username) => known.has(username)) }
    : library);
}

function canonicalSettings(settings: PluginSettings) {
  return {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    blockedAddresses: settings.blockedAddresses,
    customDomain: settings.customDomain,
    authUsers: settings.authUsers,
    autoStart: settings.autoStart,
    authEnabled: settings.authEnabled,
    host: settings.host,
    httpsCertPath: settings.httpsCertPath,
    httpsEnabled: settings.httpsEnabled,
    httpsKeyPath: settings.httpsKeyPath,
    lastServerStatus: settings.lastServerStatus,
    libraryProtectionEnabled: settings.libraryProtectionEnabled,
    port: settings.port,
    sessionDurationDays: settings.sessionDurationDays,
    sessionSecret: settings.sessionSecret,
    sharedLibraries: settings.sharedLibraries,
    trustForwardedFor: settings.trustForwardedFor,
  };
}

// Settings whose changes go in the access log, by name only. Passwords, secrets, and bookkeeping stay
// out, and blocked addresses have their own events.
const LOGGED_SETTING_FIELDS = ["authEnabled", "authUsers", "autoStart", "customDomain", "host", "httpsCertPath", "httpsEnabled", "httpsKeyPath", "libraryProtectionEnabled", "port", "sessionDurationDays", "sharedLibraries", "trustForwardedFor"] as const;

function changedSettingFields(before: PluginSettings, after: PluginSettings) {
  return LOGGED_SETTING_FIELDS.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function needsSettingsMigration(input: unknown, settings: PluginSettings) {
  if (!settings.sessionSecret) return true;
  if (!input || typeof input !== "object") return true;
  const raw = input as Record<string, unknown>;
  return raw.settingsVersion !== CURRENT_SETTINGS_VERSION
    || Object.prototype.hasOwnProperty.call(raw, "allowMetadataEditing")
    || Object.prototype.hasOwnProperty.call(raw, "basicAuthUser")
    || Object.prototype.hasOwnProperty.call(raw, "passwordHash");
}

function withSessionSecret(settings: PluginSettings) {
  if (settings.sessionSecret) return settings;
  return {
    ...settings,
    sessionSecret: generateSessionSecret(),
  };
}

function generateSessionSecret() {
  return randomBytes(32).toString("base64url");
}

async function validateHttpsCredentials(certPath: string, keyPath: string) {
  const certPem = await readTlsFile(certPath, "certificate");
  const keyPem = await readTlsFile(keyPath, "private key");
  let certificate: InstanceType<typeof X509Certificate>;
  try {
    certificate = new X509Certificate(certPem);
  } catch {
    throw new Error("HTTPS certificate file must contain a valid TLS certificate");
  }
  let privateKey: ReturnType<typeof createPrivateKey>;
  try {
    privateKey = createPrivateKey(keyPem);
  } catch {
    throw new Error("HTTPS key file must contain a valid private key");
  }
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now) {
    throw new Error("HTTPS certificate is not valid yet");
  }
  if (Date.parse(certificate.validTo) <= now) {
    throw new Error("HTTPS certificate has expired");
  }
  const certPublicKey = certificate.publicKey.export({ type: "spki", format: "pem" });
  const keyPublicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" });
  if (certPublicKey !== keyPublicKey) {
    throw new Error("HTTPS certificate and key do not match");
  }
}

async function readTlsFile(filePath: string, label: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new Error(`HTTPS ${label} file is not readable: ${filePath}`);
  }
}

function isServerStatus(value: unknown): value is ServerStatus {
  return value === "running" || value === "stopped" || value === "error";
}

function hashPassword(value: unknown) {
  const salt = randomBytes(16).toString("base64url");
  const digest = pbkdf2Sync(
    String(value),
    salt,
    PASSWORD_HASH_ITERATIONS,
    PASSWORD_HASH_KEY_LENGTH,
    PASSWORD_HASH_ALGORITHM,
  ).toString("base64url");
  return `pbkdf2$${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_ITERATIONS}$${salt}$${digest}`;
}

function normalizeAuthUsers(value: unknown, input: SettingsInput = {}) {
  const rawUsers = Array.isArray(value) ? value : [];
  const users = rawUsers
    .map((user) => normalizeAuthUser(user))
    .filter((user): user is AuthUser => Boolean(user));
  if (users.length) return uniqueAuthUsers(users);

  const username = String(input.basicAuthUser || DEFAULT_SETTINGS.basicAuthUser).trim() || DEFAULT_SETTINGS.basicAuthUser;
  const passwordHash = String(input.passwordHash || "");
  if (!username || !passwordHash) return [];
  return [{
    username,
    passwordHash,
    role: Boolean(input.allowMetadataEditing) ? "editor" as const : "viewer" as const,
  }];
}

function normalizeAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const input = value as { passwordHash?: unknown; role?: unknown; username?: unknown };
  const username = String(input.username || "").trim();
  if (!username) return null;
  return {
    username,
    passwordHash: String(input.passwordHash || ""),
    role: normalizeRole(input.role),
  };
}

function normalizeRole(value: unknown): UserRole {
  return value === "admin" || value === "editor" ? value : "viewer";
}

function normalizeSessionDurationDays(value: unknown) {
  const raw = value ?? DEFAULT_SETTINGS.sessionDurationDays;
  const days = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(days) || days < MIN_SESSION_DURATION_DAYS || days > MAX_SESSION_DURATION_DAYS) {
    throw new Error(`sessionDurationDays must be an integer from ${MIN_SESSION_DURATION_DAYS}-${MAX_SESSION_DURATION_DAYS}`);
  }
  return days;
}

function uniqueAuthUsers(users: AuthUser[]) {
  const output: AuthUser[] = [];
  const seen = new Set<string>();
  for (const user of users) {
    const key = user.username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(user);
  }
  return output;
}

function validateAuthUsersInput(value: unknown) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error("authUsers must be an array");
  const seen = new Set<string>();
  for (const user of value) {
    const username = user && typeof user === "object" ? String((user as { username?: unknown }).username || "").trim() : "";
    if (!username) throw new Error("Username is required for every user");
    const key = username.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate username: ${username}`);
    seen.add(key);
  }
}

function normalizeUserPasswords(value: unknown) {
  const output = new Map<string, string>();
  if (!value || typeof value !== "object") return output;
  for (const [username, password] of Object.entries(value as Record<string, unknown>)) {
    const cleanUsername = username.trim();
    const cleanPassword = String(password || "").trim();
    if (cleanUsername && cleanPassword) output.set(cleanUsername, cleanPassword);
  }
  return output;
}

function canRoleEditMetadata(role: UserRole) {
  return role === "admin" || role === "editor";
}

function authUsersCanEditMetadata(users: AuthUser[]) {
  return users.some((user) => canRoleEditMetadata(user.role));
}

function authUsersMissingPassword(users: AuthUser[]) {
  return !users.length || users.some((user) => !user.passwordHash);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function defaultEagleUserDataDir() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Eagle");
  if (process.platform === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Eagle");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "Eagle");
}

// Eagle's Settings file also holds unrelated data (such as account tokens); only libraryHistory is read.
async function readEagleLibraryHistory(userDataPath: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(join(userDataPath, "Settings"), "utf8")) as { libraryHistory?: unknown };
    return Array.isArray(parsed?.libraryHistory)
      ? parsed.libraryHistory.filter((path): path is string => typeof path === "string")
      : [];
  } catch {
    return [];
  }
}

async function existingPaths(paths: string[]) {
  const checks = await Promise.all(paths.map(async (path) => {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  }));
  return paths.filter((_, index) => checks[index]);
}

function sharedLibraryPaths(settings: PluginSettings) {
  return settings.libraryProtectionEnabled ? settings.sharedLibraries.map((library) => library.path) : null;
}

// Per-library users apply only with both protections on; otherwise they are kept but not used.
function libraryUserRules(settings: PluginSettings) {
  if (!settings.libraryProtectionEnabled || !settings.authEnabled) return [];
  return settings.sharedLibraries
    .filter((library) => library.access === "selected")
    .map((library) => ({ path: library.path, users: library.users || [] }));
}

function getLanAddresses() {
  const output: LanAddress[] = [];
  for (const [label, entries] of Object.entries(networkInterfaces()) as Array<[string, NetworkEntry[]]>) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) output.push({ label, address: entry.address });
    }
  }
  return output;
}

function buildAccessUrl({ customDomain = "", host = "0.0.0.0", httpsEnabled = false, port = 41532, lanAddresses = [] }: {
  customDomain?: string;
  host?: string;
  httpsEnabled?: boolean;
  lanAddresses?: LanAddress[];
  port?: number;
} = {}) {
  const address = normalizeCustomDomain(customDomain) || selectLanAddress({ lanAddresses, host });
  return `${httpsEnabled ? "https" : "http"}://${address}:${port}`;
}

function selectLanAddress({ lanAddresses = [], host = "0.0.0.0" }: {
  host?: string;
  lanAddresses?: LanAddress[];
} = {}) {
  if (host === "127.0.0.1" || host === "localhost") return "localhost";
  if (host && host !== "0.0.0.0") return host;
  if (lanAddresses[0]?.address) return lanAddresses[0].address;
  return "localhost";
}

function createServerManager({
  accessLog = createAccessLog(),
  settingsStore = createSettingsStore(),
  viewerServerFactory = createViewerServer,
  lanAddressProvider = getLanAddresses,
  defaultEagleUserDataPath = defaultEagleUserDataDir,
}: ServerManagerOptions = {}) {
  let viewer: ManagedViewer | null = null;
  let stateOverride: ServerStatus = "stopped";
  let lastError = "";

  async function snapshot(settings: PluginSettings | null = null) {
    const loadedSettings = settings || await settingsStore.load();
    const lanAddresses = lanAddressProvider();
    const status = viewer ? viewer.status() : {
      state: stateOverride,
      host: loadedSettings.host,
      port: loadedSettings.port,
      lastError,
    };
    return {
      ...status,
      settings: loadedSettings,
      lanAddresses,
      url: buildAccessUrl({
        customDomain: loadedSettings.customDomain,
        host: loadedSettings.host,
        httpsEnabled: loadedSettings.httpsEnabled,
        port: status.port || loadedSettings.port,
        lanAddresses,
      }),
      lastError: status.lastError || lastError,
    };
  }

  // What the admin or the server did. It happens on this computer, so there is no device or user.
  function logSystemEvent(event: string, details: { fields?: string[]; libraryId?: string; path?: string } = {}) {
    try {
      accessLog.record({ type: "system", event, ip: "this computer", ...details });
    } catch {
      // Starting the server or saving settings never depends on its log entry.
    }
  }

  // A switch while the plugin was closed sends no event, so each start also notes what is open. It
  // is its own entry so that a slow or unavailable Eagle never holds up the start; without an answer
  // nothing is logged.
  function logOpenLibrary(startedViewer: ManagedViewer) {
    return Promise.resolve(startedViewer.openLibraryId?.())
      .then((libraryId) => {
        if (libraryId) logSystemEvent("library_open", { libraryId });
      })
      .catch(() => {});
  }

  // Settings saves and block-list changes each read the settings, change them and save them; one
  // at a time, so two quick changes don't both start from the same settings and drop one.
  let settingsChain: Promise<unknown> = Promise.resolve();
  function queueSettingsChange<T>(task: () => Promise<T>) {
    const run = settingsChain.then(task);
    settingsChain = run.catch(() => {});
    return run;
  }

  function updateBlockedAddresses(event: string, address: string, change: (current: BlockedAddress[]) => BlockedAddress[] | null) {
    return queueSettingsChange(async () => {
      const current = await settingsStore.load();
      const next = change(current.blockedAddresses);
      if (!next) return snapshot(current);
      const settings = await settingsStore.save({ blockedAddresses: next });
      viewer?.setBlockedAddresses?.(settings.blockedAddresses);
      logSystemEvent(event, { path: address });
      return snapshot(settings);
    });
  }

  async function createViewer(settings: PluginSettings) {
    return viewerServerFactory({
      customDomain: settings.customDomain,
      host: settings.host,
      httpsCertPath: settings.httpsCertPath,
      httpsEnabled: settings.httpsEnabled,
      httpsKeyPath: settings.httpsKeyPath,
      port: settings.port,
      sessionMaxAgeSeconds: settings.sessionDurationDays * 24 * 60 * 60,
      sessionSecret: settings.sessionSecret,
      sharedLibraries: sharedLibraryPaths(settings),
      libraryUserRules: libraryUserRules(settings),
      authUsers: settings.authEnabled ? settings.authUsers : [],
      accessLog,
      blockedAddresses: settings.blockedAddresses,
      trustForwardedFor: settings.trustForwardedFor,
    });
  }

  return {
    async init() {
      await accessLog.load();
      const settings = await settingsStore.load();
      if (settings.autoStart) return this.start();
      return snapshot(settings);
    },

    async start() {
      const settings = await settingsStore.load();
      const wasRunning = viewer?.status().state === "running";
      try {
        if (!viewer) viewer = await createViewer(settings);
        await viewer.start();
        stateOverride = "running";
        lastError = "";
        if (!wasRunning) {
          logSystemEvent("server_start");
          logOpenLibrary(viewer);
        }
      } catch (error) {
        stateOverride = "error";
        lastError = errorMessage(error);
        logSystemEvent("server_start_failed", { path: lastError });
      }
      return snapshot(settings);
    },

    async stop() {
      if (viewer) {
        // A failed close must not leave the old viewer behind, or the next start would reuse it.
        const stopping = viewer;
        viewer = null;
        try {
          await stopping.stop();
        } finally {
          stateOverride = "stopped";
          logSystemEvent("server_stop");
          // Eagle may be closing the plugin; the batched write might not get another chance.
          await accessLog.flush();
        }
      }
      stateOverride = "stopped";
      lastError = "";
      return snapshot();
    },

    async restart() {
      await this.stop();
      return this.start();
    },

    saveSettings(input: SettingsInput) {
      return queueSettingsChange(async () => {
        const wasRunning = viewer?.status().state === "running";
        const current = await settingsStore.load();
        const settings = await settingsStore.save(input);
        const changedFields = changedSettingFields(current, settings);
        if (changedFields.length) logSystemEvent("settings_changed", { fields: changedFields });
        const restartRequired = serverRestartSettingsChanged(current, settings);
        if (viewer && restartRequired) {
          await this.stop();
          if (wasRunning) return this.start();
        }
        return snapshot(settings);
      });
    },

    // Logged with or without the server running; the settings hold the secret behind the library id.
    async libraryChanged(libraryPath = "") {
      viewer?.notifyLibraryChanged?.();
      const settings = await settingsStore.load().catch(() => null);
      logSystemEvent("library_changed", { libraryId: settings ? libraryIdFor(libraryPath, settings.sessionSecret) : "" });
    },

    // Candidates for the shared-library picker on the admin's own machine: anything already
    // shared, the library open in Eagle, and Eagle's recent libraries that still exist.
    async libraries({ current = null, userDataPath = "" }: LibraryListInput = {}) {
      const settings = await settingsStore.load();
      const currentPath = String(current?.path || "").trim();
      const historyPaths = await existingPaths(await readEagleLibraryHistory(String(userDataPath || "") || defaultEagleUserDataPath()));
      const sharedKeys = new Set(settings.sharedLibraries.map((library) => libraryPathKey(library.path)));
      const currentKey = libraryPathKey(currentPath);
      // Saved entries go first so the picker shows (and later removes) the exact saved path.
      const candidates = normalizeSharedLibraries([
        ...settings.sharedLibraries,
        ...(currentPath ? [{ path: currentPath, name: current?.name }] : []),
        ...historyPaths,
      ]) as SharedLibrary[];
      return {
        current: currentPath ? { path: currentPath, name: String(current?.name || "") || libraryNameFromPath(currentPath) } : null,
        items: candidates.map((library): LibraryCandidate => {
          const key = libraryPathKey(library.path);
          // `shared` reflects the saved settings, not unsaved edits in the panel.
          return { ...library, current: key === currentKey, shared: settings.libraryProtectionEnabled && sharedKeys.has(key) };
        }),
      };
    },

    async status() {
      return snapshot();
    },

    // The log belongs to the manager, not the viewer, so it stays readable after the server stops.
    async accessLogSummary({ limit = 200, range = "24h", type = "" }: { limit?: number; range?: "1h" | "24h" | "7d"; type?: string } = {}) {
      await accessLog.load();
      return { ...accessLog.summary({ range }), recent: accessLog.entries({ limit, type }) };
    },

    accessLogConnectedCount() {
      return accessLog.activeClients();
    },

    // Blocking applies to the running server right away and is saved for the next start.
    async blockAddress(address: string) {
      const normalized = normalizeBlockedAddress(address);
      return updateBlockedAddresses("address_blocked", normalized, (current) => current.some((entry) => entry.address === normalized)
        ? null
        : [...current, { address: normalized, addedAt: Date.now() }]);
    },

    async unblockAddress(address: string) {
      return updateBlockedAddresses("address_unblocked", address, (current) => current.filter((entry) => entry.address !== address));
    },

    async exportAccessLog(filePath: string, format: "csv" | "jsonl" = "csv") {
      await accessLog.load();
      const entries = accessLog.entries({ limit: Number.MAX_SAFE_INTEGER }).reverse();
      const body = format === "jsonl" ? entries.map((entry: object) => `${JSON.stringify(entry)}\n`).join("") : accessLogCsv(entries);
      await writeFile(filePath, body, "utf8");
      return { count: entries.length, filePath };
    },

    async clearAccessLog() {
      await accessLog.clear();
      // Stays behind as the first entry, so a cleared log shows that it was cleared.
      logSystemEvent("log_cleared");
    },

    accessLogPath() {
      return accessLog.filePath;
    },
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  buildAccessUrl,
  createServerManager,
  createSettingsStore,
  getLanAddresses,
  hashPassword,
  normalizeSettings,
};
