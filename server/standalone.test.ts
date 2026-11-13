import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { parseArgs, renderTable, runLogs, runStandalone } = require("../dist/.generated/plugin-service/standalone.cjs");
const { resolveStandaloneConfig } = require("../dist/.generated/plugin-service/standaloneConfig.cjs");
const { formatLogEntry, printLogFile } = require("../dist/.generated/plugin-service/standaloneLog.cjs");
const { libraryIdFor } = require("../dist/.generated/plugin-service/libraryAccess.cjs");

const cleanups: string[] = [];

afterEach(async () => {
  for (const path of cleanups.splice(0)) await rm(path, { recursive: true, force: true });
});

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), "standalone-"));
  cleanups.push(dir);
  return dir;
}

async function createLibrary(dir: string, name: string, itemName = "sunset") {
  const libraryPath = join(dir, `${name}.library`);
  const itemDir = join(libraryPath, "images", "A.info");
  await mkdir(itemDir, { recursive: true });
  await writeFile(join(libraryPath, "metadata.json"), JSON.stringify({ folders: [], smartFolders: [], tagsGroups: [], applicationVersion: "4.0.0" }));
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ A: 1, all: 1 }));
  await writeFile(join(itemDir, "metadata.json"), JSON.stringify({ id: "A", name: itemName, ext: "jpg", tags: [], folders: [], modificationTime: 1 }));
  await writeFile(join(itemDir, `${itemName}.jpg`), itemName);
  return libraryPath;
}

const SECRET = "test-session-secret";

async function writeSettings(dir: string, settings: Record<string, unknown> = {}) {
  const path = join(dir, "settings.json");
  await writeFile(path, JSON.stringify({ port: 41532, host: "127.0.0.1", sessionSecret: SECRET, ...settings }));
  return path;
}

async function writeConfig(dir: string, config: unknown) {
  const path = join(dir, "standalone.json");
  await writeFile(path, JSON.stringify(config));
  return path;
}

test("parses the serve options and the logs command", () => {
  assert.deepEqual(parseArgs(["--library", "/a.library", "--port=8080", "-f"]), {
    accessLogPath: "",
    allowAnonymousLan: false,
    allowUnknownFormat: false,
    command: "serve",
    configPath: "",
    follow: true,
    help: false,
    host: "",
    libraries: ["/a.library"],
    port: "8080",
    settingsPath: "",
  });
  assert.deepEqual(parseArgs(["logs", "-f", "-n", "10"]), { accessLogPath: "", command: "logs", configPath: "", follow: true, help: false, lines: 10, settingsPath: "" });
  assert.throws(() => parseArgs(["--library"]), /--library needs a value/);
  assert.throws(() => parseArgs(["logs", "--library", "/a"]), /Unknown option: --library/);
});

test("lays out the status table in columns", () => {
  assert.deepEqual(renderTable(["PORT", "STATUS", "LIBRARY"], [["41532", "running", "Photos"], ["", "", "Work"]]), [
    "PORT    STATUS    LIBRARY",
    "41532   running   Photos",
    "                  Work",
  ]);
});

test("servers take settings.json's network settings and override only where they listen", async () => {
  const dir = await workspace();
  const photos = await createLibrary(dir, "Photos");
  const work = await createLibrary(dir, "Work");
  const settingsPath = await writeSettings(dir, {
    customDomain: "studio.local",
    authEnabled: true,
    authUsers: [{ username: "alice", password: "correct horse", role: "viewer" }],
  });
  const before = await readFile(settingsPath, "utf8");
  const configPath = await writeConfig(dir, {
    servers: [
      { libraries: [photos] },
      { libraries: [{ path: "Work.library", name: "Office" }], port: 41533, customDomain: "work.local" },
    ],
  });
  const config = await resolveStandaloneConfig({ settingsPath, configPath });
  assert.deepEqual(config.servers.map((server: { port: number; customDomain: string; host: string }) => [server.port, server.customDomain, server.host]), [
    [41532, "studio.local", "127.0.0.1"],
    [41533, "work.local", "127.0.0.1"],
  ]);
  // A relative path in standalone.json is relative to that file.
  assert.deepEqual(config.servers[1].libraries, [{ path: work, name: "Office" }]);
  assert.equal(config.common.sessionSecret, SECRET);
  assert.deepEqual(config.common.authUsers.map((user: { username: string }) => user.username), ["alice"]);
  // settings.json is never written.
  assert.equal(await readFile(settingsPath, "utf8"), before);

  await writeConfig(dir, { servers: [{ libraries: [photos], authUsers: [] }] });
  await assert.rejects(resolveStandaloneConfig({ settingsPath, configPath }), /"authUsers" can't be set here/);
  await writeConfig(dir, { servers: [{ libraries: [photos] }, { libraries: [work] }] });
  await assert.rejects(resolveStandaloneConfig({ settingsPath, configPath }), /Servers 1 and 2 both use port 41532/);
  await writeConfig(dir, { servers: [{ port: 41540 }] });
  await assert.rejects(resolveStandaloneConfig({ settingsPath, configPath }), /needs "libraries"/);
});

test("without standalone.json, serves the libraries the plugin shares; --library replaces the servers", async () => {
  const dir = await workspace();
  const photos = await createLibrary(dir, "Photos");
  // The default standalone.json lives in the home folder; this one has none.
  const home = process.env.HOME;
  process.env.HOME = dir;
  try {
    const bareSettings = await writeSettings(dir);
    await assert.rejects(resolveStandaloneConfig({ settingsPath: bareSettings }), /Nothing to serve/);
    // A config named on the command line must exist; the default one may be missing.
    await assert.rejects(resolveStandaloneConfig({ settingsPath: bareSettings, configPath: join(dir, "nope.json") }), /Can't read/);

    const sharedSettings = await writeSettings(dir, { libraryProtectionEnabled: true, sharedLibraries: [{ path: photos, name: "Family" }] });
    const shared = await resolveStandaloneConfig({ settingsPath: sharedSettings });
    assert.deepEqual(shared.servers.map((server: { port: number; libraries: unknown }) => [server.port, server.libraries]), [[41532, [{ path: photos, name: "Family" }]]]);
    assert.match(shared.source, /shared libraries/);

    const flags = await resolveStandaloneConfig({ settingsPath: sharedSettings, libraries: [photos], port: "0" });
    assert.equal(flags.servers[0].port, 0);
    assert.equal(flags.source, "command line");
    await assert.rejects(resolveStandaloneConfig({ settingsPath: sharedSettings, port: "9000" }), /--port and --host go with --library/);
    await assert.rejects(resolveStandaloneConfig({ settingsPath: sharedSettings, libraries: [photos], host: "0.0.0.0" }), /without signing in/);
    assert.equal((await resolveStandaloneConfig({ settingsPath: sharedSettings, libraries: [photos], host: "0.0.0.0", allowAnonymousLan: true })).servers[0].host, "0.0.0.0");
  } finally {
    process.env.HOME = home;
  }
});

test("runs each server on its own, skips one whose port is taken, and prints their status first", async () => {
  const dir = await workspace();
  const photos = await createLibrary(dir, "Photos", "sunset");
  const work = await createLibrary(dir, "Work", "invoice");
  const busy = createServer();
  await new Promise<void>((resolveListen) => busy.listen(0, "127.0.0.1", () => resolveListen()));
  const busyPort = (busy.address() as { port: number }).port;
  const settingsPath = await writeSettings(dir, { port: busyPort });
  const configPath = await writeConfig(dir, {
    servers: [
      { libraries: [photos] },
      { libraries: [work, join(dir, "Missing.library")], port: 0 },
    ],
  });
  const accessLogPath = join(dir, "access.jsonl");
  const lines: string[] = [];
  const running = await runStandalone(["--settings", settingsPath, "--config", configPath, "--access-log", accessLogPath, "-f"], {
    log: (line: string) => lines.push(line),
    lanAddresses: [],
  });
  try {
    assert.equal(running.servers.length, 1);
    const origin = running.servers[0].url.replace("localhost", "127.0.0.1");
    const output = lines.join("\n");
    assert.match(output, /Eagle Media Server \(standalone, read only\)/);
    assert.match(output, new RegExp(`Access log: ${accessLogPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(streaming below\\)`));
    assert.match(output, /PORT\s+STATUS\s+URL\s+LIBRARY\s+LIBRARY STATUS/);
    assert.match(output, new RegExp(`${busyPort}\\s+port in use\\s+http://localhost:${busyPort}\\s+Photos`));
    assert.match(output, /\d+\s+running\s+http:\/\/localhost:\d+\s+Work\s+/);
    assert.match(output, /Missing\s+not found \(no metadata\.json\)/);
    assert.match(output, /Server 1: port in use \(the Eagle plugin may be running\)/);

    await running.ready;
    assert.match(lines.join("\n"), /Read "Work": 1 items in/);
    assert.match(lines.join("\n"), /running\s+http:\/\/localhost:\d+\s+Work\s+ready, 1 items/);

    // Library ids are those the plugin makes from the same session secret, so a viewer's stays valid.
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.library.id, libraryIdFor(work, SECRET));
    const file = await fetch(`${origin}/api/items/A/file`, { headers: { "X-Library-Id": health.library.id } });
    assert.equal(await file.text(), "invoice");
    // Each request is streamed as it is logged.
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    assert.ok(lines.some((line) => /view\s+200\s+127\.0\.0\.1\s+Work\s+view {2}GET \/api\/items\/A\/file {2}item A {2}\.jpg {2}7 B/.test(line)), lines.join("\n"));
  } finally {
    await running.stop();
    await new Promise<void>((resolveClose) => busy.close(() => resolveClose()));
  }
  // The access log is written by default.
  const written = (await readFile(accessLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const events = written.map((entry: { event: string }) => entry.event);
  assert.ok(events.includes("server_start_failed"), events.join(","));
  assert.ok(events.includes("server_start"), events.join(","));
  assert.ok(events.includes("server_stop"), events.join(","));
  assert.ok(written.some((entry: { type: string; libraryId?: string }) => entry.type === "view" && entry.libraryId === libraryIdFor(work, SECRET)), JSON.stringify(written));
});

test("stops when no server can start", async () => {
  const dir = await workspace();
  const settingsPath = await writeSettings(dir);
  const configPath = await writeConfig(dir, { servers: [{ libraries: [join(dir, "Missing.library")], port: 0 }] });
  await assert.rejects(
    runStandalone(["--settings", settingsPath, "--config", configPath, "--access-log", join(dir, "log.jsonl")], { log: () => {}, lanAddresses: [] }),
    /No server could start/,
  );
});

test("prints the last entries of the log file, then new ones as they are written", async () => {
  const dir = await workspace();
  const filePath = join(dir, "access.jsonl");
  const entry = (at: number, event: string) => JSON.stringify({ at, type: "view", event, ip: "10.0.0.2", user: "alice", status: 200, libraryId: "LIB", path: "/api/items/A/file" });
  await writeFile(filePath, [entry(1, "one"), entry(2, "two"), entry(3, "three")].join("\n") + "\n");
  const printed: string[] = [];
  const controller = new AbortController();
  const following = printLogFile(filePath, { follow: true, lines: 2, libraryNames: new Map([["LIB", "Photos"]]), print: (line: string) => printed.push(line), pollMs: 20, signal: controller.signal });
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(printed.length, 2);
  assert.match(printed[0], /view\s+200\s+alice@10\.0\.0\.2\s+Photos\s+two/);
  await appendFile(filePath, `${entry(4, "four")}\n`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 80));
  controller.abort();
  await following;
  assert.equal(printed.length, 3);
  assert.match(printed[2], /four/);

  const once: string[] = [];
  await runLogs({ accessLogPath: filePath, command: "logs", configPath: join(dir, "none.json"), follow: false, help: false, lines: 1, settingsPath: join(dir, "none-settings.json") }, (line: string) => once.push(line));
  assert.equal(once.length, 1);
  assert.match(once[0], /four/);
  assert.match(formatLogEntry({ at: 0, type: "system", event: "server_start", ip: "this computer", path: "http://localhost:1" }), /system\s+this computer\s+-\s+server_start {2}http:\/\/localhost:1/);
  await stat(filePath);
});

test("a server whose HTTPS certificate can't be read is skipped; the others run", async () => {
  const dir = await workspace();
  const photos = await createLibrary(dir, "Photos");
  const work = await createLibrary(dir, "Work", "invoice");
  const settingsPath = await writeSettings(dir);
  const configPath = await writeConfig(dir, {
    servers: [
      { libraries: [photos], port: 0, httpsEnabled: true, httpsCertPath: join(dir, "missing-cert.pem"), httpsKeyPath: join(dir, "missing-key.pem") },
      { libraries: [work], port: 0 },
    ],
  });
  const lines: string[] = [];
  const running = await runStandalone(["--settings", settingsPath, "--config", configPath, "--access-log", join(dir, "log.jsonl")], { log: (line: string) => lines.push(line), lanAddresses: [] });
  try {
    assert.equal(running.servers.length, 1);
    assert.match(lines.join("\n"), /Server 1: not started: .*missing-cert\.pem/);
    assert.match(lines.join("\n"), /running\s+http:\/\/localhost:\d+\s+Work/);
  } finally {
    await running.stop();
  }
});
