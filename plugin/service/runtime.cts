const { mkdir, readFile, writeFile } = require("fs").promises;
const { pbkdf2Sync, randomBytes } = require("crypto");
const { dirname, join } = require("path");
const { homedir, networkInterfaces } = require("os");
const { createViewerServer } = require("./viewerServer.cjs");

type ServerStatus = "error" | "running" | "stopped";
type UserRole = "admin" | "editor" | "viewer";

interface AuthUser {
  passwordHash: string;
  role: UserRole;
  username: string;
}

interface PluginSettings {
  allowMetadataEditing: boolean;
  authUsers: AuthUser[];
  autoStart: boolean;
  authEnabled: boolean;
  basicAuthUser: string;
  host: string;
  lastServerStatus: ServerStatus;
  passwordHash: string;
  port: number;
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
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  status(): ViewerStatus;
}

interface ServerManagerOptions {
  lanAddressProvider?: () => LanAddress[];
  settingsStore?: SettingsStore;
  viewerServerFactory?: (settings: {
    allowMetadataEditing: boolean;
    authUsers: AuthUser[];
    basicAuthUsername: string;
    host: string;
    passwordHash: string;
    port: number;
  }) => ManagedViewer;
}

interface NetworkEntry {
  address: string;
  family: string;
  internal: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
  allowMetadataEditing: false,
  authUsers: [],
  autoStart: false,
  host: "0.0.0.0",
  port: 41532,
  authEnabled: false,
  basicAuthUser: "eagle",
  passwordHash: "",
  lastServerStatus: "stopped",
};
const PASSWORD_HASH_ALGORITHM = "sha256";
const PASSWORD_HASH_ITERATIONS = 210000;
const PASSWORD_HASH_KEY_LENGTH = 32;

function defaultSettingsPath() {
  return join(homedir(), ".eagle-media-preview-server", "settings.json");
}

function createSettingsStore({ filePath = defaultSettingsPath() }: { filePath?: string } = {}) {
  return {
    filePath,

    async load() {
      try {
        const raw = await readFile(filePath, "utf8");
        return normalizeSettings(JSON.parse(raw));
      } catch (error) {
        if (error.code === "ENOENT") return { ...DEFAULT_SETTINGS };
        throw error;
      }
    },

    async save(input: SettingsInput = {}) {
      const current = await this.load();
      validateAuthUsersInput(input.authUsers);
      const next = normalizeSettings({ ...current, ...input });
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
      if (!next.authEnabled) {
        if (input.allowMetadataEditing === true) {
          throw new Error("BasicAuth protection is required when metadata editing is enabled");
        }
        next.passwordHash = "";
        next.allowMetadataEditing = false;
      }
      if (next.authUsers.length) {
        next.basicAuthUser = next.authUsers[0].username;
        next.passwordHash = next.authEnabled ? next.authUsers[0].passwordHash : "";
        next.allowMetadataEditing = next.authEnabled && authUsersCanEditMetadata(next.authUsers);
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      return next;
    },
  };
}

function normalizeSettings(input: SettingsInput = {}): PluginSettings {
  const port = Number.parseInt(String(input.port ?? DEFAULT_SETTINGS.port), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("port must be an integer from 1-65535");
  }
  return {
    autoStart: Boolean(input.autoStart ?? DEFAULT_SETTINGS.autoStart),
    allowMetadataEditing: Boolean(input.allowMetadataEditing ?? DEFAULT_SETTINGS.allowMetadataEditing),
    authUsers: normalizeAuthUsers(input.authUsers, input),
    host: String(input.host || DEFAULT_SETTINGS.host).trim() || DEFAULT_SETTINGS.host,
    port,
    authEnabled: Boolean(input.authEnabled ?? DEFAULT_SETTINGS.authEnabled),
    basicAuthUser: String(input.basicAuthUser || DEFAULT_SETTINGS.basicAuthUser).trim() || DEFAULT_SETTINGS.basicAuthUser,
    passwordHash: String(input.passwordHash || ""),
    lastServerStatus: isServerStatus(input.lastServerStatus)
      ? input.lastServerStatus
      : DEFAULT_SETTINGS.lastServerStatus,
  };
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

function getLanAddresses() {
  const output: LanAddress[] = [];
  for (const [label, entries] of Object.entries(networkInterfaces()) as Array<[string, NetworkEntry[]]>) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) output.push({ label, address: entry.address });
    }
  }
  return output;
}

function buildAccessUrl({ host = "0.0.0.0", port = 41532, lanAddresses = [] }: {
  host?: string;
  lanAddresses?: LanAddress[];
  port?: number;
} = {}) {
  const address = selectLanAddress({ lanAddresses, host });
  return `http://${address}:${port}`;
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
  settingsStore = createSettingsStore(),
  viewerServerFactory = createViewerServer,
  lanAddressProvider = getLanAddresses,
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
        host: loadedSettings.host,
        port: status.port || loadedSettings.port,
        lanAddresses,
      }),
      lastError: status.lastError || lastError,
    };
  }

  async function createViewer(settings: PluginSettings) {
    return viewerServerFactory({
      host: settings.host,
      port: settings.port,
      basicAuthUsername: settings.basicAuthUser,
      allowMetadataEditing: settings.allowMetadataEditing,
      authUsers: settings.authEnabled ? settings.authUsers : [],
      passwordHash: settings.authEnabled ? settings.passwordHash : "",
    });
  }

  function needsServerRestart(prev: PluginSettings, next: PluginSettings) {
    if (prev.host !== next.host) return true;
    if (prev.port !== next.port) return true;
    if (prev.authEnabled !== next.authEnabled) return true;
    if (!prev.authEnabled && !next.authEnabled) return false;
    return prev.allowMetadataEditing !== next.allowMetadataEditing
      || JSON.stringify(prev.authUsers) !== JSON.stringify(next.authUsers);
  }

  return {
    async init() {
      const settings = await settingsStore.load();
      if (settings.autoStart) return this.start();
      return snapshot(settings);
    },

    async start() {
      const settings = await settingsStore.load();
      if (!viewer) viewer = await createViewer(settings);
      try {
        await viewer.start();
        stateOverride = "running";
        lastError = "";
      } catch (error) {
        stateOverride = "error";
        lastError = error.message || String(error);
      }
      return snapshot(settings);
    },

    async stop() {
      if (viewer) {
        await viewer.stop();
        viewer = null;
      }
      stateOverride = "stopped";
      return snapshot();
    },

    async restart() {
      await this.stop();
      return this.start();
    },

    async saveSettings(input: SettingsInput) {
      const wasRunning = viewer?.status().state === "running";
      const current = await settingsStore.load();
      const settings = await settingsStore.save(input);
      if (wasRunning && needsServerRestart(current, settings)) {
        await this.stop();
        return this.start();
      }
      return snapshot(settings);
    },

    async status() {
      return snapshot();
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
