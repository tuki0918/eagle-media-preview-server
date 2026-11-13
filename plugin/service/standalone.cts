// The standalone server: serves an Eagle library to the viewer without Eagle, read only
// (docs/design/standalone-server.md). Run with `node bin/eagle-media-server.cjs --library <path>`.
const { readFile, stat } = require("fs").promises;
const { resolve } = require("path");
const { isIP } = require("net");
const { createFsBackend } = require("./fsBackend.cjs");
const { libraryPathKey, normalizeSharedLibraries } = require("./libraryAccess.cjs");
const { normalizeSettings } = require("./runtime.cjs");
const { createViewerServer } = require("./viewerServer.cjs");

interface ServedLibrary {
  access?: "selected";
  name: string;
  path: string;
  users?: string[];
}

interface StandaloneOptions {
  allowAnonymousLan: boolean;
  allowUnknownFormat: boolean;
  configPath: string;
  help: boolean;
  host: string;
  libraries: string[];
  port: string;
}

const USAGE = `Usage: eagle-media-server --library <path> [--library <path> ...] [options]

Serves Eagle libraries to the Media Library viewer without Eagle running, several at once if
you like. Read only: nothing in a library is ever changed.

Options:
  --library <path>          A .library folder to serve; repeat it for more. A config file can
                            list them too, as "libraries"
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
  const input = options.configPath ? JSON.parse(await readFile(resolve(options.configPath), "utf8")) : {};
  const libraries = servedLibraries(options.libraries, input.libraries);
  if (!libraries.length) throw new Error("--library is required");
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
    libraries,
    server: {
      authUsers,
      // Every library served is shared; one limited to some users is open only to them once users sign in.
      sharedLibraries: libraries.map((library) => library.path),
      libraryUserRules: libraries
        .filter((library) => library.access === "selected")
        .map((library) => ({ path: library.path, users: library.users || [] })),
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

// Libraries from the flags, then the config's "libraries" (paths, or entries in the plugin's
// shared-library format: { path, name, access: "selected", users }). The same folder twice is served once.
function servedLibraries(flagPaths: string[], configLibraries: unknown): ServedLibrary[] {
  const fromConfig: ServedLibrary[] = normalizeSharedLibraries(Array.isArray(configLibraries) ? configLibraries : []);
  const entries: ServedLibrary[] = [...normalizeSharedLibraries(flagPaths.map((path) => resolve(path))), ...fromConfig.map((library) => ({ ...library, path: resolve(library.path) }))];
  const seen = new Map<string, ServedLibrary>();
  for (const entry of entries) {
    const key = libraryPathKey(entry.path);
    // A flag and a config entry for the same folder: the config's name and users, which come later, win.
    seen.set(key, { ...seen.get(key), ...entry });
  }
  return [...seen.values()];
}

// Only a folder with the library's metadata.json is served; anything else stops the server before
// it listens. Items are read after it starts (see runStandalone).
async function checkLibraryFolder(path: string) {
  try {
    if ((await stat(resolve(path, "metadata.json"))).isFile()) return;
  } catch {
    // Reported below.
  }
  throw new Error(`${path} is not an Eagle library (no metadata.json)`);
}

async function runStandalone(argv: string[], { log = console.log }: { log?: (message: string) => void } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log(USAGE);
    return null;
  }
  const { libraries, server } = await resolveServerSettings(options);
  for (const library of libraries) await checkLibraryFolder(library.path);
  const backends = libraries.map((library) => createFsBackend({ libraryPath: library.path, name: library.name, allowUnknownFormat: options.allowUnknownFormat }));
  const viewer = createViewerServer({ ...server, backends });
  const disposeAll = () => Promise.all(backends.map((backend) => backend.dispose()));
  try {
    await viewer.start();
  } catch (error) {
    await disposeAll();
    throw error;
  }
  const status = viewer.status();
  const protocol = server.httpsEnabled ? "https" : "http";
  const address = String(status.boundAddress || server.host);
  const host = isIP(address) === 6 ? `[${address}]` : address;
  log(`Serving ${libraries.length === 1 ? `"${libraries[0].name}"` : `${libraries.length} libraries`} (read only) at ${protocol}://${host}:${status.port}`);
  // Read one at a time, in order, as the server does; reported as each is done.
  let stopped = false;
  const ready = (async () => {
    for (const backend of backends) {
      if (stopped) return;
      const started = Date.now();
      try {
        await backend.open();
        log(`Read "${backend.name}": ${backend.state().total} items in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      } catch (error) {
        log(`Can't read "${backend.name}" (${backend.libraryPath}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  })();
  return {
    viewer,
    backends,
    /** Resolves once every library has been read, or found unreadable. */
    ready,
    async stop() {
      stopped = true;
      await viewer.stop();
      await disposeAll();
    },
  };
}

module.exports = { USAGE, isLoopback, parseArgs, resolveServerSettings, runStandalone, servedLibraries };
