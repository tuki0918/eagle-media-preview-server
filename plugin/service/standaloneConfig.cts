// What the standalone server serves, and where (docs/design/standalone-server.md, "Configuration").
//
// The plugin's settings.json is the base and is only ever read: users, roles, the session secret,
// the block list, library protection, and the default port, host, hostname, and HTTPS all come
// from it, so the standalone server answers at the same address, with the same sign-ins, as the
// plugin. standalone.json, next to it, lists servers: each one names its libraries and may change
// only where it listens (port, host, hostname, HTTPS). Users stay those of settings.json, so a
// library opened through Eagle or the standalone server lets in the same people.
const { readFile } = require("fs").promises;
const { homedir } = require("os");
const { isAbsolute, join, resolve } = require("path");
const { isIP } = require("net");
const { randomBytes } = require("crypto");
const { libraryNameFromPath, libraryPathKey } = require("./libraryAccess.cjs");
const { defaultSettingsPath, libraryUserRules, normalizeSettings, sharedLibraryPaths, withLoadableCustomDomain } = require("./runtime.cjs");

interface ServedLibrary {
  name: string;
  path: string;
}

interface ServerPlan {
  customDomain: string;
  host: string;
  httpsCertPath: string;
  httpsEnabled: boolean;
  httpsKeyPath: string;
  libraries: ServedLibrary[];
  port: number;
}

interface CliOverrides {
  allowAnonymousLan?: boolean;
  configPath?: string;
  host?: string;
  libraries?: string[];
  port?: string;
  settingsPath?: string;
}

// Only where a server listens may differ from settings.json.
const SERVER_FIELDS = ["port", "host", "customDomain", "httpsEnabled", "httpsCertPath", "httpsKeyPath"] as const;

function stateDir() {
  return join(homedir(), ".eagle-media-preview-server");
}

function defaultConfigPath() {
  return join(stateDir(), "standalone.json");
}

function defaultAccessLogPath() {
  return join(stateDir(), "standalone-access-log.jsonl");
}

// JSON has no shell to expand "~", so a leading "~/" is taken as the home folder.
function expandPath(path: string, base = process.cwd()) {
  const trimmed = String(path || "").trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) return join(homedir(), trimmed.slice(2));
  return isAbsolute(trimmed) ? trimmed : resolve(base, trimmed);
}

function isLoopback(host: string) {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || (isIP(normalized) === 4 && normalized.startsWith("127."));
}

async function readJsonFile(path: string, { optional }: { optional: boolean }) {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new Error(`Can't read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeLibraries(value: unknown, base: string, where: string): ServedLibrary[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${where} needs "libraries": a list of .library folders`);
  return value.map((entry, index) => {
    const record = typeof entry === "string" ? { path: entry } : entry && typeof entry === "object" ? entry as { name?: unknown; path?: unknown } : null;
    if (!record || typeof record.path !== "string" || !record.path.trim()) throw new Error(`${where}, library ${index + 1} needs a "path"`);
    const path = expandPath(record.path, base).replace(/[\\/]+$/, "");
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : libraryNameFromPath(path);
    return { path, name };
  });
}

function serverFrom(base: Record<string, unknown>, override: Record<string, unknown>, libraries: ServedLibrary[], where: string): ServerPlan {
  const merged: Record<string, unknown> = { ...base };
  for (const field of SERVER_FIELDS) if (override[field] !== undefined) merged[field] = override[field];
  const unknown = Object.keys(override).filter((key) => key !== "libraries" && key !== "name" && !(SERVER_FIELDS as readonly string[]).includes(key));
  if (unknown.length) {
    throw new Error(`${where}: ${unknown.map((key) => `"${key}"`).join(", ")} can't be set here. A server may set only ${SERVER_FIELDS.join(", ")}; everything else comes from settings.json.`);
  }
  // Port 0 asks the system for any free port, which the settings format doesn't allow.
  const anyPort = String(merged.port) === "0";
  if (anyPort) merged.port = base.port;
  // normalizeSettings checks the port and hostname the same way the plugin does.
  const checked = normalizeSettings(withLoadableCustomDomain(merged));
  return {
    customDomain: checked.customDomain,
    host: checked.host,
    httpsCertPath: checked.httpsCertPath,
    httpsEnabled: checked.httpsEnabled,
    httpsKeyPath: checked.httpsKeyPath,
    libraries,
    port: anyPort ? 0 : checked.port,
  };
}

/**
 * Reads settings.json (never writes it) and standalone.json, and works out the servers to run.
 * `--library` given on the command line replaces standalone.json's servers with a single server.
 */
async function resolveStandaloneConfig(cli: CliOverrides = {}) {
  const settingsPath = cli.settingsPath ? expandPath(cli.settingsPath) : defaultSettingsPath();
  const configPath = cli.configPath ? expandPath(cli.configPath) : defaultConfigPath();
  const rawSettings = (await readJsonFile(settingsPath, { optional: !cli.settingsPath })) ?? {};
  const settings = normalizeSettings(withLoadableCustomDomain(rawSettings));
  const base: Record<string, unknown> = {};
  for (const field of SERVER_FIELDS) base[field] = settings[field];

  let servers: ServerPlan[];
  let source: string;
  if (cli.libraries?.length) {
    const override: Record<string, unknown> = {};
    if (cli.port) override.port = cli.port;
    if (cli.host) override.host = cli.host;
    servers = [serverFrom(base, override, normalizeLibraries(cli.libraries, process.cwd(), "--library"), "--library")];
    source = "command line";
  } else {
    if (cli.port || cli.host) throw new Error("--port and --host go with --library; to change where a server in standalone.json listens, edit that file");
    const config = await readJsonFile(configPath, { optional: !cli.configPath });
    const configBase = join(configPath, "..");
    if (config) {
      const entries = config && typeof config === "object" && Array.isArray((config as { servers?: unknown }).servers) ? (config as { servers: unknown[] }).servers : null;
      if (!entries?.length) throw new Error(`${configPath} needs "servers": a list of servers, each with its "libraries"`);
      servers = entries.map((entry, index) => {
        const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        const where = `${configPath}, server ${index + 1}`;
        return serverFrom(base, record, normalizeLibraries(record.libraries, configBase, where), where);
      });
      source = configPath;
    } else if (settings.libraryProtectionEnabled && settings.sharedLibraries.length) {
      // No standalone.json: the libraries the plugin shares, where the plugin listens.
      servers = [serverFrom(base, {}, settings.sharedLibraries.map((library: ServedLibrary) => ({ path: library.path, name: library.name })), settingsPath)];
      source = `${settingsPath} (shared libraries)`;
    } else {
      throw new Error(
        "Nothing to serve. Pass --library <path>, or list servers in " +
        `${configPath}, for example:\n  { "servers": [{ "libraries": ["~/Pictures/Photos.library"] }] }`,
      );
    }
  }

  const ports = new Map<number, number>();
  servers.forEach((server, index) => {
    if (server.port && ports.has(server.port)) throw new Error(`Servers ${ports.get(server.port)! + 1} and ${index + 1} both use port ${server.port}`);
    ports.set(server.port, index);
  });

  const authUsers = settings.authEnabled ? settings.authUsers : [];
  // Only a network address typed on the command line is refused without sign-in: one in a settings
  // file was chosen there (the plugin's Public Network switch writes it), and is shown as a warning.
  if (cli.host && !authUsers.length && !isLoopback(cli.host) && !cli.allowAnonymousLan) {
    throw new Error(
      `Listening on ${cli.host} would let anyone on the network browse without signing in. ` +
      "Turn on password protection in the plugin (settings.json), or pass --allow-anonymous-lan.",
    );
  }

  return {
    settingsPath,
    configPath,
    source,
    servers,
    // Shared by every server, and the plugin's own, so sign-ins and library ids are the same
    // whichever one answers. Without one in settings.json, sign-ins last until this server stops.
    common: {
      authUsers,
      blockedAddresses: settings.blockedAddresses,
      libraryUserRules: libraryUserRules(settings),
      sessionMaxAgeSeconds: settings.sessionDurationDays * 24 * 60 * 60,
      sessionSecret: settings.sessionSecret || randomBytes(32).toString("base64url"),
      sharedLibraries: sharedLibraryPaths(settings) as string[] | null,
      trustForwardedFor: settings.trustForwardedFor,
    },
    libraryProtection: settings.libraryProtectionEnabled
      ? new Set<string>(settings.sharedLibraries.map((library: ServedLibrary) => libraryPathKey(library.path)))
      : null,
  };
}

module.exports = { SERVER_FIELDS, defaultAccessLogPath, defaultConfigPath, expandPath, isLoopback, resolveStandaloneConfig, stateDir };
