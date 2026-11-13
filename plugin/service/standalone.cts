// The standalone server: serves an Eagle library to the viewer without Eagle, read only
// (docs/design/standalone-server.md). Run with `node bin/eagle-media-server.cjs --library <path>`.
const { readFile } = require("fs").promises;
const { resolve } = require("path");
const { isIP } = require("net");
const { createFsBackend } = require("./fsBackend.cjs");
const { normalizeSettings } = require("./runtime.cjs");
const { createViewerServer } = require("./viewerServer.cjs");

interface StandaloneOptions {
  allowAnonymousLan: boolean;
  allowUnknownFormat: boolean;
  configPath: string;
  help: boolean;
  host: string;
  libraries: string[];
  port: string;
}

const USAGE = `Usage: eagle-media-server --library <path> [options]

Serves an Eagle library to the Media Library viewer without Eagle running. Read only:
nothing in the library is ever changed.

Options:
  --library <path>          The .library folder to serve
  --port <number>           Port to listen on (default: the config's, or 41532; 0 for any free port)
  --host <address>          Address to listen on (default: 127.0.0.1)
  --config <file>           Settings file in the plugin's format (users, HTTPS, port, host)
  --allow-anonymous-lan     Listen on a network address with no sign-in required
  --allow-unknown-format    Serve a library saved by an Eagle version this server doesn't know
  -h, --help                Show this help
`;

function parseArgs(argv: string[]): StandaloneOptions {
  const options: StandaloneOptions = {
    allowAnonymousLan: false,
    allowUnknownFormat: false,
    configPath: "",
    help: false,
    host: "",
    libraries: [],
    port: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${flag} needs a value`);
      index += 1;
      return next;
    };
    switch (flag) {
      case "--library":
        options.libraries.push(value());
        break;
      case "--port":
        options.port = value();
        break;
      case "--host":
        options.host = value();
        break;
      case "--config":
        options.configPath = value();
        break;
      case "--allow-anonymous-lan":
        options.allowAnonymousLan = true;
        break;
      case "--allow-unknown-format":
        options.allowUnknownFormat = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function isLoopback(host: string) {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "localhost" || normalized === "::1" || (isIP(normalized) === 4 && normalized.startsWith("127."));
}

// The viewer server's settings, from the config file (the plugin's settings format) and the flags.
async function resolveServerSettings(options: StandaloneOptions) {
  if (options.libraries.length !== 1) {
    throw new Error(options.libraries.length ? "Only one --library is supported for now" : "--library is required");
  }
  const input = options.configPath ? JSON.parse(await readFile(resolve(options.configPath), "utf8")) : {};
  const settings = normalizeSettings({
    ...input,
    // 0 asks the system for any free port, which the settings format doesn't allow.
    ...(options.port && options.port !== "0" ? { port: options.port } : {}),
    host: options.host || (options.configPath && input.host) || "127.0.0.1",
  });
  const authUsers = settings.authEnabled ? settings.authUsers : [];
  if (!authUsers.length && !isLoopback(settings.host) && !options.allowAnonymousLan) {
    throw new Error(
      `Listening on ${settings.host} would let anyone on the network browse the library without signing in. ` +
      "Add users with --config, or pass --allow-anonymous-lan.",
    );
  }
  return {
    libraryPath: resolve(options.libraries[0]),
    server: {
      authUsers,
      customDomain: settings.customDomain,
      host: settings.host,
      httpsCertPath: settings.httpsCertPath,
      httpsEnabled: settings.httpsEnabled,
      httpsKeyPath: settings.httpsKeyPath,
      port: options.port === "0" ? 0 : settings.port,
      blockedAddresses: settings.blockedAddresses,
      trustForwardedFor: settings.trustForwardedFor,
      sessionMaxAgeSeconds: settings.sessionDurationDays * 24 * 60 * 60,
      // Without one in the config, sign-ins last until the server stops.
      sessionSecret: settings.sessionSecret,
    },
  };
}

async function runStandalone(argv: string[], { log = console.log }: { log?: (message: string) => void } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log(USAGE);
    return null;
  }
  const { libraryPath, server } = await resolveServerSettings(options);
  const backend = createFsBackend({ libraryPath, allowUnknownFormat: options.allowUnknownFormat });
  const started = Date.now();
  log(`Reading ${libraryPath} ...`);
  await backend.open();
  const library = await backend.libraryInfo();
  log(`Read ${backend.sortIndexes.forLibrary().progress().total} items in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const viewer = createViewerServer({ ...server, backend });
  try {
    await viewer.start();
  } catch (error) {
    await backend.dispose();
    throw error;
  }
  const status = viewer.status();
  const protocol = server.httpsEnabled ? "https" : "http";
  const address = String(status.boundAddress || server.host);
  const host = isIP(address) === 6 ? `[${address}]` : address;
  log(`Serving "${library.name}" (read only) at ${protocol}://${host}:${status.port}`);
  return {
    viewer,
    async stop() {
      await viewer.stop();
      await backend.dispose();
    },
  };
}

module.exports = { USAGE, isLoopback, parseArgs, resolveServerSettings, runStandalone };
