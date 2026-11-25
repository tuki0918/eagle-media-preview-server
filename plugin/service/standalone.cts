import { DEFAULT_PANEL_PORT, PanelRequestError, startStandalonePanel, type PanelActivityQuery, type PanelLibrarySortIndex, type PanelSnapshot } from "./standalonePanel.cjs";
import { panelSettings, panelSettingsRevision, settingsPatch, settingsSwitchPatch } from "./standaloneSettings.cjs";
import { changedSettingFields, createSettingsStore, SettingsValidationError } from "./runtime.cjs";

// The standalone server: serves Eagle libraries to the viewer without Eagle, read only
// (docs/design/standalone-server.md). `node bin/eagle-media-server.cjs` runs the servers listed in
// standalone.json (or given with --library), on top of the plugin's settings.json.
const { stat } = require("fs").promises;
const { join } = require("path");
const { normalizeBlockedAddress } = require("./addressBlockList.cjs");
const { createAccessLog } = require("./accessLog.cjs");
const { createFsBackend } = require("./fsBackend.cjs");
const { libraryIdFor, libraryPathKey } = require("./libraryAccess.cjs");
const { buildAccessUrl, getLanAddresses } = require("./runtime.cjs");
const { defaultAccessLogPath, defaultConfigPath, expandPath, isLoopback, resolveStandaloneConfig } = require("./standaloneConfig.cjs");
const { formatLogEntry, printLogFile } = require("./standaloneLog.cjs");
const { createViewerServer } = require("./viewerServer.cjs");

interface ServeOptions {
  accessLogPath: string;
  allowAnonymousLan: boolean;
  allowUnknownFormat: boolean;
  command: "serve";
  configPath: string;
  follow: boolean;
  help: boolean;
  host: string;
  libraries: string[];
  panel: boolean;
  panelPort?: number;
  port: string;
  settingsPath: string;
}

interface LogsOptions {
  accessLogPath: string;
  command: "logs";
  configPath: string;
  follow: boolean;
  help: boolean;
  lines: number;
  settingsPath: string;
}

type LibraryStatus = "idle" | "not found" | "not shared";

interface ServerPlan {
  customDomain: string;
  host: string;
  httpsCertPath: string;
  httpsEnabled: boolean;
  httpsKeyPath: string;
  libraries: Array<{ name: string; path: string }>;
  port: number;
}

interface StandaloneConfig {
  common: { authUsers: unknown[]; autoStart: boolean; blockedAddresses: Array<{ address: string; addedAt: number }>; experimentalSort: boolean; sessionSecret: string } & Record<string, unknown>;
  libraryProtection: Set<string> | null;
  servers: ServerPlan[];
  settingsPath: string;
  source: string;
}

const USAGE = `Usage:
  eagle-media-server [options]            Run the servers in standalone.json
  eagle-media-server --library <path> ... Serve these libraries on one server instead
  eagle-media-server logs [-f] [-n <N>]   Print the access log; -f keeps printing new entries

Serves Eagle libraries to the Media Library viewer without Eagle running. Read only: nothing in a
library is ever changed. Users, sign-in, HTTPS, the port, and the hostname come from the plugin's
settings.json. Use --panel to edit settings. standalone.json lists servers, each with its libraries, and
may change where each one listens:

  { "servers": [
      { "libraries": ["~/Pictures/Photos.library"] },
      { "libraries": ["/Volumes/nas/Work.library"], "port": 41533, "customDomain": "work.local" }
  ] }

A server whose port is taken (by the plugin, say) is skipped; the others run.

Options:
  --panel                   Start the local management panel and print its URL
  --panel-port <number>     With --panel: the management port (default: ${DEFAULT_PANEL_PORT}; 0 for any free one)
  --library <path>          Serve this library; repeat for more. Replaces standalone.json's servers
  --port <number>           With --library: the port (default: settings.json's; 0 for any free one)
  --host <address>          With --library: the address to listen on (default: settings.json's)
  --settings <file>         The plugin's settings (default: ~/.eagle-media-preview-server/settings.json)
  --config <file>           The servers (default: ~/.eagle-media-preview-server/standalone.json; CLI only)
  --access-log <file>       Where to write the access log (default: ~/.eagle-media-preview-server/standalone-access-log.jsonl)
  -f, --follow              Also print each access log entry here as it happens
  --allow-anonymous-lan     Allow --host on a network address with no sign-in
  --allow-unknown-format    Serve libraries saved by an Eagle version this server doesn't know
  -h, --help                Show this help
`;

function parseArgs(argv: string[]): LogsOptions | ServeOptions {
  const command = argv[0] === "logs" ? "logs" : "serve";
  const args = command === "logs" ? argv.slice(1) : argv;
  const common = { accessLogPath: "", configPath: "", follow: false, help: false, settingsPath: "" };
  const serve: ServeOptions = { ...common, command: "serve", allowAnonymousLan: false, allowUnknownFormat: false, host: "", libraries: [], panel: false, port: "" };
  const logs: LogsOptions = { ...common, command: "logs", lines: 50 };
  const target = command === "logs" ? logs : serve;
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    flags.add(flag);
    const value = () => {
      if (inline !== undefined) return inline;
      const next = args[index + 1];
      if (next === undefined || next.startsWith("-")) throw new Error(`${flag} needs a value`);
      index += 1;
      return next;
    };
    if (flag === "-h" || flag === "--help") target.help = true;
    else if (flag === "-f" || flag === "--follow") target.follow = true;
    else if (flag === "--settings") target.settingsPath = value();
    else if (flag === "--config") target.configPath = value();
    else if (flag === "--access-log") target.accessLogPath = value();
    else if (command === "logs" && (flag === "-n" || flag === "--lines")) {
      const lines = Number(value());
      if (!Number.isInteger(lines) || lines < 0) throw new Error(`${flag} needs a number`);
      logs.lines = lines;
    } else if (command === "serve" && flag === "--library") serve.libraries.push(value());
    else if (command === "serve" && flag === "--panel" && inline === undefined) serve.panel = true;
    else if (command === "serve" && flag === "--panel-port") {
      const port = value();
      if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error("--panel-port must be an integer from 0-65535");
      serve.panelPort = Number(port);
    } else if (command === "serve" && flag === "--port") serve.port = value();
    else if (command === "serve" && flag === "--host") serve.host = value();
    else if (command === "serve" && flag === "--allow-anonymous-lan") serve.allowAnonymousLan = true;
    else if (command === "serve" && flag === "--allow-unknown-format") serve.allowUnknownFormat = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (command === "serve" && !serve.help) {
    if (!serve.panel && serve.panelPort !== undefined) throw new Error("--panel-port requires --panel.");
    if (serve.panel && [...flags].some((flag) => flag !== "--panel" && flag !== "--panel-port")) {
      throw new Error("--panel can only be combined with --panel-port. Configure libraries and settings in the panel.");
    }
  }
  return target;
}

/** Lays out rows under a header, each column as wide as its widest cell, like `docker ps`. */
function renderTable(header: string[], rows: string[][]) {
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => (row[column] || "").length)));
  const line = (cells: string[]) => cells.map((cell, column) => (column === cells.length - 1 ? cell : (cell || "").padEnd(widths[column]))).join("   ").trimEnd();
  return [line(header), ...rows.map(line)];
}

async function isLibraryFolder(path: string) {
  try {
    return (await stat(join(path, "metadata.json"))).isFile();
  } catch {
    return false;
  }
}

async function runStandalone(argv: string[], {
  log = console.log,
  lanAddresses = getLanAddresses(),
  panelAssets,
  panelStateDir,
}: {
  lanAddresses?: Array<{ address: string; label: string }>;
  log?: (message: string) => void;
  panelAssets?: string;
  panelStateDir?: string;
} = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log(USAGE);
    return null;
  }
  if (options.command === "logs") {
    await runLogs(options, log);
    return null;
  }

  const { allowUnknownFormat, panel: panelMode } = options;
  const overrides = {
    allowAnonymousLan: options.allowAnonymousLan,
    configPath: options.configPath,
    host: options.host,
    libraries: options.libraries,
    port: options.port,
    settingsPath: options.settingsPath,
    panel: panelMode,
    panelStateDir,
  };
  let config: StandaloneConfig = await resolveStandaloneConfig(overrides);
  const settingsStore = createSettingsStore({ filePath: config.settingsPath });
  const libraryName = new Map<string, string>();
  const idOf = (path: string) => libraryIdFor(path, config.common.sessionSecret);
  function rememberLibraryNames() {
    for (const server of config.servers) {
      for (const library of server.libraries) libraryName.set(idOf(library.path), library.name);
    }
  }
  rememberLibraryNames();

  // One backend per library folder, shared by every server that lists it.
  type Backend = ReturnType<typeof createFsBackend>;
  const backends = new Map<string, Backend>();
  const libraryState = new Map<string, LibraryStatus>();
  const running = new Map<number, { url: string; viewer: ReturnType<typeof createViewerServer> }>();
  let serverStatus = config.servers.map(() => "stopped");
  let panel: Awaited<ReturnType<typeof startStandalonePanel>> | undefined;

  const accessLogPath = options.accessLogPath ? expandPath(options.accessLogPath)
    : panelMode && panelStateDir ? join(panelStateDir, "standalone-access-log.jsonl")
    : defaultAccessLogPath();
  const accessLog = createAccessLog({ filePath: accessLogPath });
  await accessLog.load();
  // Streaming starts below the status table; entries before it are only written to the file.
  let streaming = false;
  const recorder = {
    record(entry: Record<string, unknown>) {
      const recorded = accessLog.record(entry);
      if (options.follow && streaming) log(formatLogEntry(recorded, libraryName));
      return recorded;
    },
    touch(ip: string, user: string) {
      accessLog.touch(ip, user);
    },
  };

  async function startServer(index: number) {
    if (running.has(index)) return;
    const server = config.servers[index];
    const served = new Set<Backend>();
    for (const library of server.libraries) {
      const key = libraryPathKey(library.path);
      let backend = backends.get(key);
      if (!backend) {
        if (!(await isLibraryFolder(library.path))) {
          libraryState.set(key, "not found");
          continue;
        }
        if (config.libraryProtection && !config.libraryProtection.has(key)) {
          libraryState.set(key, "not shared");
          continue;
        }
        backend = createFsBackend({ libraryPath: library.path, name: library.name, allowUnknownFormat });
        libraryState.set(key, "idle");
        backends.set(key, backend);
      }
      served.add(backend);
    }

    try {
      if (!served.size) {
        serverStatus[index] = server.libraries.length
          ? "not started: no library to serve"
          : "Add a library in Settings to start the server.";
        return;
      }
      if (panel?.port === server.port) {
        throw new Error(`The management panel uses port ${server.port}. Choose a different viewer port in Settings → General.`);
      }
      const viewer = createViewerServer({
        ...config.common,
        accessLog: recorder,
        backends: [...served],
        customDomain: server.customDomain,
        host: server.host,
        httpsCertPath: server.httpsCertPath,
        httpsEnabled: server.httpsEnabled,
        httpsKeyPath: server.httpsKeyPath,
        port: server.port,
      });
      await viewer.start();
      const port = viewer.status().boundPort || server.port;
      const url = buildAccessUrl({ customDomain: server.customDomain, host: server.host, httpsEnabled: server.httpsEnabled, port, lanAddresses });
      running.set(index, { url, viewer });
      serverStatus[index] = "running";
      recorder.record({ type: "system", event: "server_start", ip: "this computer", path: url });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      serverStatus[index] = code === "EADDRINUSE"
        ? "port in use (the Eagle plugin may be running)"
        : `not started: ${error instanceof Error ? error.message : String(error)}`;
      recorder.record({ type: "system", event: "server_start_failed", ip: "this computer", path: `port ${server.port}: ${serverStatus[index]}` });
    }
  }

  async function stopServer(index: number) {
    const entry = running.get(index);
    if (entry) {
      await entry.viewer.stop();
      running.delete(index);
      recorder.record({ type: "system", event: "server_stop", ip: "this computer", path: entry.url });
    }
    serverStatus[index] = "stopped";
  }

  async function releaseUnusedBackends() {
    const servedKeys = new Set([...running.keys()].flatMap((index) => config.servers[index].libraries.map((library) => libraryPathKey(library.path))));
    for (const [key, backend] of backends) {
      if (servedKeys.has(key)) continue;
      backends.delete(key);
      await backend.dispose();
    }
  }

  // A failed listener doesn't prevent the rest from starting. With --panel, the viewer starts with
  // the CLI only when Auto start is on; otherwise it waits for the panel's power switch.
  async function startConfiguredServers() {
    if (!panelMode || config.common.autoStart) {
      for (const [index, server] of config.servers.entries()) {
        if (server.libraries.length) await startServer(index);
      }
    }
    await releaseUnusedBackends();
  }
  if (!panelMode) await startConfiguredServers();

  const describeLibrary = (path: string) => {
    const key = libraryPathKey(path);
    const backend = backends.get(key);
    if (!backend) {
      const state = libraryState.get(key);
      if (state === "not shared") return "not shared (library protection in settings.json)";
      if (state === "not found") return "not found (no metadata.json)";
      return "-";
    }
    const state = backend.state();
    if (state.status === "ready") return `ready, ${state.total} items`;
    if (state.status === "failed") return `can't read: ${state.error}`;
    if (state.status === "building") return state.total ? `reading ${state.loaded}/${state.total}` : "reading";
    return "waiting to read";
  };
  // Standalone Advanced Sort uses the items each library scan already holds.
  function sortIndexesOf(server: ServerPlan): PanelLibrarySortIndex[] {
    return server.libraries.map(({ name, path }) => {
      const library = { id: idOf(path), name };
      const key = libraryPathKey(path);
      const state = backends.get(key)?.state();
      if (!state) {
        const reason = libraryState.get(key) === "not shared"
          ? "Library protection excludes this folder."
          : "Library folder or metadata.json was not found.";
        return { ...library, status: "unavailable", reason };
      }
      if (state.status === "idle") return { ...library, status: "waiting" };
      if (state.status === "failed") {
        return { ...library, status: "failed", reason: state.error || "The library could not be read." };
      }
      return { ...library, status: state.status, loaded: state.loaded, total: state.total };
    });
  }
  const statusTable = () => {
    const rows: string[][] = [];
    for (const [index, server] of config.servers.entries()) {
      const url = running.get(index)?.url
        ?? buildAccessUrl({ customDomain: server.customDomain, host: server.host, httpsEnabled: server.httpsEnabled, port: server.port, lanAddresses });
      const status = serverStatus[index] === "running" ? "running" : serverStatus[index].startsWith("port in use") ? "port in use" : "not started";
      server.libraries.forEach((library, position) => {
        rows.push(position === 0
          ? [String(running.get(index)?.viewer.status().boundPort || server.port || "-"), status, url, library.name, describeLibrary(library.path)]
          : ["", "", "", library.name, describeLibrary(library.path)]);
      });
    }
    return renderTable(["PORT", "STATUS", "URL", "LIBRARY", "LIBRARY STATUS"], rows);
  };

  if (!panelMode) {
    const users = config.common.authUsers.length;
    const anonymousOnNetwork = !users && [...running.keys()].some((index) => !isLoopback(config.servers[index].host));
    log("Eagle Media Server (standalone, read only)");
    log(`  Settings:   ${config.settingsPath} (read only)`);
    log(`  Servers:    ${config.source}`);
    log(`  Sign-in:    ${users ? `required (${users} user${users === 1 ? "" : "s"})` : anonymousOnNetwork ? "not required — anyone on the network can browse" : "not required"}`);
    log(`  Sorting:    ${config.common.experimentalSort ? "Advanced Sort on" : "Advanced Sort off (experimentalSort in settings.json)"}`);
    log(`  Access log: ${accessLogPath}${options.follow ? " (streaming below)" : " (-f to stream it here)"}`);
    log("");
    for (const line of statusTable()) log(line);
    for (const [index, status] of serverStatus.entries()) {
      if (status !== "running") log(`  Server ${index + 1}: ${status}`);
    }
    log("");
  }
  streaming = true;
  if (!running.size && !panelMode) {
    await accessLog.flush();
    throw new Error("No server could start");
  }

  // Schedule scans in config order. If a server stops before its turn, skip its released backend.
  let scanQueue = Promise.resolve();
  const scanScheduled = new WeakSet<Backend>();
  function scanLibraries() {
    const order = new Set(config.servers.flatMap((server) => server.libraries.map((library) => libraryPathKey(library.path))));
    for (const key of order) {
      const backend = backends.get(key);
      if (!backend || scanScheduled.has(backend)) continue;
      scanScheduled.add(backend);
      scanQueue = scanQueue.then(async () => {
        if (backends.get(key) !== backend) return;
        const started = Date.now();
        try {
          await backend.open();
          if (!panelMode && backends.get(key) === backend) log(`Read "${backend.name}": ${backend.state().total} items in ${((Date.now() - started) / 1000).toFixed(1)} s`);
        } catch (error) {
          if (!panelMode && backends.get(key) === backend) log(`Can't read "${backend.name}" (${backend.libraryPath}): ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    return scanQueue;
  }

  let closing = false;
  let commands = Promise.resolve();
  const snapshot = (): PanelSnapshot => ({
    activeClients: accessLog.activeClients(),
    blockedAddresses: config.common.blockedAddresses,
    settingsPath: config.settingsPath,
    libraryNames: [...libraryName.entries()],
    servers: config.servers.map((server, index) => {
      const entry = running.get(index);
      const state = entry ? "running" : serverStatus[index] === "stopped" ? "stopped" : "error";
      return {
        index,
        state,
        error: state === "error" ? serverStatus[index] : "",
        url: entry?.url || "",
        port: entry?.viewer.status().boundPort || server.port,
        authEnabled: config.common.authUsers.length > 0,
        httpsEnabled: server.httpsEnabled,
        publicNetwork: !isLoopback(server.host),
        libraries: server.libraries.map(({ name, path }) => ({ name, status: describeLibrary(path) })),
        sortIndexes: entry && config.common.experimentalSort ? sortIndexesOf(server) : undefined,
      };
    }),
  });

  function queueCommand<T>(task: () => Promise<T>) {
    const command = commands.then(() => {
      if (closing) throw new PanelRequestError("The standalone server is shutting down", 503);
      return task();
    });
    commands = command.then(() => {}, () => {});
    return command;
  }

  function setPower(index: number, enabled: boolean) {
    return queueCommand(async () => {
      if (index >= config.servers.length) throw new PanelRequestError("Server not found", 404);
      if (enabled) await startServer(index);
      else await stopServer(index);
      await releaseUnusedBackends();
      void scanLibraries();
    });
  }

  async function getSettings() {
    const current = await settingsStore.read();
    return panelSettings(current.settings, config.servers.flatMap((server) => server.libraries));
  }

  function saveSettings(payload: Record<string, unknown>, switchOnly: boolean) {
    return queueCommand(async () => {
      if (!switchOnly && running.size) throw new PanelRequestError("Stop the viewer server before saving settings", 409);
      const { before, settings, result } = await settingsStore.update((current) => {
        if (payload.revision !== panelSettingsRevision(current.settings)) {
          throw new PanelRequestError("Settings changed on disk. Reload settings and try again.", 409);
        }
        return {
          ...(switchOnly ? settingsSwitchPatch(payload.field, payload.checked) : settingsPatch(payload.settings, current.settings)),
          sessionSecret: current.settings.sessionSecret || config.common.sessionSecret,
        };
      }, async (next) => {
        const proposed: StandaloneConfig = await resolveStandaloneConfig(overrides, next).catch((error: Error) => {
          throw new SettingsValidationError(error.message, { cause: error });
        });
        const newAnonymousListener = !proposed.common.authUsers.length && proposed.servers.some((server, index) => {
          if (isLoopback(server.host) || !server.libraries.length) return false;
          const previous = config.servers[index];
          return config.common.authUsers.length > 0 || !previous?.libraries.length || isLoopback(previous.host);
        });
        if (newAnonymousListener && payload.allowAnonymousLan !== true) {
          throw new PanelRequestError("Public Network without password protection lets anyone on the network browse. Save these settings?", 400, "confirm_anonymous_lan");
        }
        return proposed;
      });
      const fields = changedSettingFields(before, settings);
      // Auto start only matters when the CLI starts, so changing it never restarts the viewer.
      const switchChanged = fields.some((field) => field !== "autoStart")
        || Boolean(config.common.authUsers.length) !== Boolean(result.common.authUsers.length)
        || config.servers[0].host !== result.servers[0].host
        || config.servers[0].httpsEnabled !== result.servers[0].httpsEnabled;
      const restart = switchOnly && switchChanged && running.has(0);
      if (restart) await stopServer(0);
      if (!running.size) {
        config = result;
        serverStatus = config.servers.map(() => "stopped");
        libraryState.clear();
        rememberLibraryNames();
      }
      if (fields.length) recorder.record({ type: "system", event: "settings_changed", ip: "this computer", fields });
      if (restart) {
        await startServer(0);
        await releaseUnusedBackends();
        void scanLibraries();
      }
      return panelSettings(settings, config.servers.flatMap((server) => server.libraries));
    });
  }

  function setBlockedAddress(address: unknown, blocked: boolean) {
    return queueCommand(async () => {
      if (typeof address !== "string") throw new SettingsValidationError("Enter an IP address or CIDR range.");
      let normalized: string;
      try {
        normalized = normalizeBlockedAddress(address);
      } catch (error) {
        if (error instanceof Error) throw new SettingsValidationError(error.message, { cause: error });
        throw error;
      }
      const { before, settings } = await settingsStore.update(({ settings }) => ({
        blockedAddresses: blocked
          ? [...settings.blockedAddresses, { address: normalized, addedAt: Date.now() }]
          : settings.blockedAddresses.filter((entry) => entry.address !== normalized),
        sessionSecret: settings.sessionSecret || config.common.sessionSecret,
      }), async () => {});
      config.common.blockedAddresses = settings.blockedAddresses;
      for (const { viewer } of running.values()) viewer.setBlockedAddresses(settings.blockedAddresses);
      if (JSON.stringify(before.blockedAddresses) !== JSON.stringify(settings.blockedAddresses)) {
        recorder.record({ type: "system", event: blocked ? "address_blocked" : "address_unblocked", ip: "this computer", path: normalized });
      }
    });
  }

  try {
    if (panelMode) {
      panel = await startStandalonePanel({
        snapshot,
        getSettings,
        saveSettings,
        setBlockedAddress,
        setPower,
        activity: (query: PanelActivityQuery) => ({
          ...accessLog.summary({ range: query.range }),
          recent: accessLog.entries({ ...query, limit: 100, searchKeys: { ...query.searchKeys, libraryNames: libraryName } }),
        }),
        async clearLog() {
          await accessLog.clear();
          recorder.record({ type: "system", event: "log_cleared", ip: "this computer" });
        },
        exportLog: () => accessLog.entries({ limit: Number.MAX_SAFE_INTEGER }).reverse(),
      }, { assets: panelAssets, port: options.panelPort });
      await queueCommand(startConfiguredServers);
      log(`Management panel: ${panel.url}`);
    }
  } catch (error) {
    closing = true;
    await panel?.stop();
    await commands;
    await Promise.all([...running.keys()].map(stopServer));
    await releaseUnusedBackends();
    await accessLog.flush();
    throw error;
  }

  const ready = scanLibraries().then(() => {
    if (!closing && backends.size && !panelMode) {
      log("");
      for (const line of statusTable()) log(line);
      log("");
    }
  });

  let shutdown: Promise<void> | undefined;
  return {
    accessLogPath,
    panelUrl: panel?.url,
    get servers() {
      return [...running.values()];
    },
    statusTable,
    /** Resolves once every initially served library has been read, or found unreadable. */
    ready,
    stop() {
      if (shutdown) return shutdown;
      closing = true;
      shutdown = (async () => {
        await panel?.stop();
        await commands;
        await Promise.all([...running.keys()].map(stopServer));
        await releaseUnusedBackends();
        await accessLog.flush();
      })();
      return shutdown;
    },
  };
}

// Prints the access log file, naming libraries from the current configuration where it can.
async function runLogs(options: LogsOptions, log: (message: string) => void, signal?: AbortSignal) {
  const filePath = options.accessLogPath ? expandPath(options.accessLogPath) : defaultAccessLogPath();
  const libraryNames = new Map<string, string>();
  try {
    const config: StandaloneConfig = await resolveStandaloneConfig({ configPath: options.configPath, settingsPath: options.settingsPath });
    for (const server of config.servers) for (const library of server.libraries) libraryNames.set(libraryIdFor(library.path, config.common.sessionSecret), library.name);
  } catch {
    // Without a configuration, libraries are shown by id.
  }
  if (options.follow) log(`Following ${filePath} (Ctrl+C to stop)`);
  await printLogFile(filePath, { follow: options.follow, lines: options.lines, libraryNames, print: log, signal });
}

module.exports = { USAGE, defaultConfigPath, parseArgs, renderTable, runLogs, runStandalone };
