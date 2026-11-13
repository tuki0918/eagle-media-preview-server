// The standalone server: serves Eagle libraries to the viewer without Eagle, read only
// (docs/design/standalone-server.md). `node bin/eagle-media-server.cjs` runs the servers listed in
// standalone.json (or given with --library), on top of the plugin's settings.json.
const { stat } = require("fs").promises;
const { join } = require("path");
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
  common: { authUsers: unknown[]; sessionSecret: string } & Record<string, unknown>;
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
settings.json, which is only read. standalone.json lists servers, each with its libraries, and
may change where each one listens:

  { "servers": [
      { "libraries": ["~/Pictures/Photos.library"] },
      { "libraries": ["/Volumes/nas/Work.library"], "port": 41533, "customDomain": "work.local" }
  ] }

A server whose port is taken (by the plugin, say) is skipped; the others run.

Options:
  --library <path>          Serve this library; repeat for more. Replaces standalone.json's servers
  --port <number>           With --library: the port (default: settings.json's; 0 for any free one)
  --host <address>          With --library: the address to listen on (default: settings.json's)
  --settings <file>         The plugin's settings (default: ~/.eagle-media-preview-server/settings.json)
  --config <file>           The servers (default: ~/.eagle-media-preview-server/standalone.json)
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
  const serve: ServeOptions = { ...common, command: "serve", allowAnonymousLan: false, allowUnknownFormat: false, host: "", libraries: [], port: "" };
  const logs: LogsOptions = { ...common, command: "logs", lines: 50 };
  const target = command === "logs" ? logs : serve;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
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
    else if (command === "serve" && flag === "--port") serve.port = value();
    else if (command === "serve" && flag === "--host") serve.host = value();
    else if (command === "serve" && flag === "--allow-anonymous-lan") serve.allowAnonymousLan = true;
    else if (command === "serve" && flag === "--allow-unknown-format") serve.allowUnknownFormat = true;
    else throw new Error(`Unknown option: ${arg}`);
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

async function runStandalone(argv: string[], { log = console.log, lanAddresses = getLanAddresses() }: { lanAddresses?: Array<{ address: string; label: string }>; log?: (message: string) => void } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log(USAGE);
    return null;
  }
  if (options.command === "logs") {
    await runLogs(options, log);
    return null;
  }

  const config: StandaloneConfig = await resolveStandaloneConfig({
    allowAnonymousLan: options.allowAnonymousLan,
    configPath: options.configPath,
    host: options.host,
    libraries: options.libraries,
    port: options.port,
    settingsPath: options.settingsPath,
  });
  const libraryName = new Map<string, string>();
  const idOf = (path: string) => libraryIdFor(path, config.common.sessionSecret);

  // One backend per library folder, shared by every server that lists it.
  const backends = new Map<string, ReturnType<typeof createFsBackend>>();
  const libraryState = new Map<string, LibraryStatus>();
  for (const server of config.servers) {
    for (const library of server.libraries) {
      const key = libraryPathKey(library.path);
      libraryName.set(idOf(library.path), library.name);
      if (libraryState.has(key)) continue;
      if (!(await isLibraryFolder(library.path))) libraryState.set(key, "not found");
      else if (config.libraryProtection && !config.libraryProtection.has(key)) libraryState.set(key, "not shared");
      else {
        libraryState.set(key, "idle");
        backends.set(key, createFsBackend({ libraryPath: library.path, name: library.name, allowUnknownFormat: options.allowUnknownFormat }));
      }
    }
  }

  const accessLogPath = options.accessLogPath ? expandPath(options.accessLogPath) : defaultAccessLogPath();
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

  // Each server listens on its own; one that can't (its port taken by the plugin, say) is skipped.
  const running: Array<{ index: number; url: string; viewer: ReturnType<typeof createViewerServer> }> = [];
  const serverStatus: string[] = [];
  for (const [index, server] of config.servers.entries()) {
    const served = server.libraries
      .map((library) => backends.get(libraryPathKey(library.path)))
      .filter((backend): backend is ReturnType<typeof createFsBackend> => backend !== undefined)
      .filter((backend, position, list) => list.indexOf(backend) === position);
    if (!served.length) {
      serverStatus[index] = "not started: no library to serve";
      continue;
    }
    const viewer = createViewerServer({
      ...config.common,
      accessLog: recorder,
      backends: served,
      customDomain: server.customDomain,
      host: server.host,
      httpsCertPath: server.httpsCertPath,
      httpsEnabled: server.httpsEnabled,
      httpsKeyPath: server.httpsKeyPath,
      port: server.port,
    });
    try {
      await viewer.start();
      const port = viewer.status().boundPort || server.port;
      const url = buildAccessUrl({ customDomain: server.customDomain, host: server.host, httpsEnabled: server.httpsEnabled, port, lanAddresses });
      running.push({ index, url, viewer });
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

  // A library only on servers that didn't start isn't read.
  const servedKeys = new Set(running.flatMap(({ index }) => config.servers[index].libraries.map((library) => libraryPathKey(library.path))));
  for (const [key, backend] of [...backends]) {
    if (servedKeys.has(key)) continue;
    await backend.dispose();
    backends.delete(key);
  }
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
  const statusTable = () => {
    const rows: string[][] = [];
    for (const [index, server] of config.servers.entries()) {
      const url = running.find((entry) => entry.index === index)?.url
        ?? buildAccessUrl({ customDomain: server.customDomain, host: server.host, httpsEnabled: server.httpsEnabled, port: server.port, lanAddresses });
      const status = serverStatus[index] === "running" ? "running" : serverStatus[index].startsWith("port in use") ? "port in use" : "not started";
      server.libraries.forEach((library, position) => {
        rows.push(position === 0
          ? [String(running.find((entry) => entry.index === index)?.viewer.status().boundPort || server.port || "-"), status, url, library.name, describeLibrary(library.path)]
          : ["", "", "", library.name, describeLibrary(library.path)]);
      });
    }
    return renderTable(["PORT", "STATUS", "URL", "LIBRARY", "LIBRARY STATUS"], rows);
  };

  const users = config.common.authUsers.length;
  const anonymousOnNetwork = !users && running.some(({ index }) => !isLoopback(config.servers[index].host));
  log("Eagle Media Server (standalone, read only)");
  log(`  Settings:   ${config.settingsPath} (read only)`);
  log(`  Servers:    ${config.source}`);
  log(`  Sign-in:    ${users ? `required (${users} user${users === 1 ? "" : "s"})` : anonymousOnNetwork ? "not required — anyone on the network can browse" : "not required"}`);
  log(`  Access log: ${accessLogPath}${options.follow ? " (streaming below)" : " (-f to stream it here)"}`);
  log("");
  for (const line of statusTable()) log(line);
  for (const [index, status] of serverStatus.entries()) {
    if (status !== "running") log(`  Server ${index + 1}: ${status}`);
  }
  log("");
  streaming = true;
  if (!running.length) {
    await Promise.all([...backends.values()].map((backend) => backend.dispose()));
    await accessLog.flush();
    throw new Error("No server could start");
  }

  // Libraries are read one at a time, in the order listed; each is reported when done.
  let stopped = false;
  const ready = (async () => {
    const order = [...new Set(config.servers.flatMap((server) => server.libraries.map((library) => libraryPathKey(library.path))))];
    for (const key of order) {
      const backend = backends.get(key);
      if (!backend || stopped) continue;
      const started = Date.now();
      try {
        await backend.open();
        if (!stopped) log(`Read "${backend.name}": ${backend.state().total} items in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      } catch (error) {
        if (!stopped) log(`Can't read "${backend.name}" (${backend.libraryPath}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!stopped && backends.size) {
      log("");
      for (const line of statusTable()) log(line);
      log("");
    }
  })();

  return {
    accessLogPath,
    servers: running.map(({ url, viewer }) => ({ url, viewer })),
    statusTable,
    /** Resolves once every library has been read, or found unreadable. */
    ready,
    async stop() {
      stopped = true;
      for (const { url, viewer } of running) {
        await viewer.stop();
        recorder.record({ type: "system", event: "server_stop", ip: "this computer", path: url });
      }
      await Promise.all([...backends.values()].map((backend) => backend.dispose()));
      await accessLog.flush();
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
