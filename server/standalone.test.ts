import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { get as httpGet } from "node:http";
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
    panel: false,
    port: "8080",
    settingsPath: "",
  });
  assert.deepEqual(parseArgs(["logs", "-f", "-n", "10"]), { accessLogPath: "", command: "logs", configPath: "", follow: true, help: false, lines: 10, settingsPath: "" });
  assert.equal(parseArgs(["--panel"]).panel, true);
  assert.equal(parseArgs(["--panel", "--panel-port", "0"]).panelPort, 0);
  assert.equal(parseArgs(["--panel-port=41080", "--panel"]).panelPort, 41080);
  assert.throws(() => parseArgs(["--panel-port", "41080"]), /--panel-port requires --panel/);
  for (const port of ["", "65536", "-1", "4.5"]) {
    assert.throws(() => parseArgs(["--panel", `--panel-port=${port}`]), /--panel-port must be an integer from 0-65535/);
  }
  assert.throws(() => parseArgs(["logs", "--panel"]), /Unknown option: --panel/);
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
  assert.equal(config.common.experimentalSort, false);
  await writeSettings(dir, { experimentalSort: true });
  assert.equal((await resolveStandaloneConfig({ settingsPath, configPath })).common.experimentalSort, true);
  await writeFile(settingsPath, before);
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
    assert.match(output, /Sorting:\s+Advanced Sort off \(experimentalSort in settings\.json\)/);
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

test("the local management panel stays available through listener failures and stop/start", async () => {
  const dir = await workspace();
  const first = await createLibrary(dir, "Photos");
  const second = join(dir, "Work.library");
  const busy = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    busy.once("error", rejectListen);
    busy.listen(0, "127.0.0.1", () => {
      busy.off("error", rejectListen);
      resolveListen();
    });
  });
  const port = (busy.address() as { port: number }).port;
  const settingsPath = await writeSettings(dir, {
    port,
    autoStart: true,
    sharedLibraries: [{ path: first, name: "Photos" }, { path: second, name: "Work" }],
  });
  const before = await readFile(settingsPath, "utf8");
  await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
  await writeFile(join(dir, "app.js"), "");
  const lines: string[] = [];

  let stop: (() => Promise<void>) | undefined;
  try {
    const running = await runStandalone(["--panel", "--panel-port", "0"], {
      log: (line: string) => lines.push(line),
      panelAssets: dir,
      panelStateDir: dir,
    });
    stop = () => running.stop();
    const url = new URL(running.panelUrl);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.hash.length, 44);
    assert.deepEqual(lines, [`Management panel: ${running.panelUrl}`]);
    const headers = { Authorization: `Bearer ${url.hash.slice(1)}` };
    const get = (path: string) => fetch(url.origin + path, { headers });
    const post = (path: string) => fetch(url.origin + path, { method: "POST", headers: { ...headers, Origin: url.origin } });

    assert.match(await (await fetch(url.origin)).text(), /Media Preview Server/);
    assert.equal((await fetch(url.origin + "/api/status")).status, 401);
    for (const host of ["other.test", `localhost:${url.port}`]) {
      const { status, body } = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const request = httpGet(url.origin, { headers: { Host: host } }, async (response) => {
          try {
            const chunks = [];
            for await (const chunk of response) chunks.push(chunk);
            resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() });
          } catch (error) {
            reject(error);
          }
        });
        request.once("error", reject);
      });
      assert.equal(status, 403);
      assert.match(JSON.parse(body).error, /127\.0\.0\.1.*printed by the CLI/);
      assert.ok(!body.includes(url.hash.slice(1)));
    }
    assert.equal((await fetch(url.origin + "/api/servers/0/start", { method: "POST", headers: { ...headers, Origin: "http://other.test" } })).status, 403);
    assert.equal((await fetch(url.origin + "/api/servers/0/start", { method: "POST", headers })).status, 403);
    assert.equal((await get("/settings.json")).status, 404);

    const initial = await (await get("/api/status")).json();
    assert.equal(initial.servers[0].state, "error");
    assert.match(initial.servers[0].error, /port in use/);
    assert.equal(initial.servers.length, 1);
    assert.match(initial.servers[0].libraries[1].status, /not found/);
    assert.equal(running.servers.length, 0);

    await new Promise<void>((resolveClose) => busy.close(() => resolveClose()));
    await createLibrary(dir, "Work");
    const started = await (await post("/api/servers/0/start")).json();
    assert.equal(started.servers[0].state, "running");
    const viewerOrigin = started.servers[0].url.replace("localhost", "127.0.0.1");
    assert.equal((await fetch(viewerOrigin + "/api/health")).status, 200);
    assert.equal((await post("/api/servers/1/start")).status, 404);
    const stopped = await (await post("/api/servers/0/stop")).json();
    assert.equal(stopped.servers[0].state, "stopped");
    const restarted = await (await post("/api/servers/0/start")).json();
    assert.equal(restarted.servers[0].state, "running");

    const activity = await (await get("/api/activity?range=1h&type=system&search=stopped&eventKey=server_stop")).json();
    assert.equal(activity.range, "1h");
    assert.deepEqual(activity.recent.map(({ event }: { event: string }) => event), ["server_stop"]);
    assert.match(await (await get("/api/activity/export")).text(), /server_start_failed/);
    assert.equal((await post("/api/activity/clear")).status, 200);
    const cleared = await (await get("/api/activity")).json();
    assert.deepEqual(cleared.recent.map(({ event }: { event: string }) => event), ["log_cleared"]);

    await running.stop();
    await assert.rejects(fetch(url.origin));
    assert.equal(await readFile(settingsPath, "utf8"), before);
    assert.deepEqual(lines, [`Management panel: ${running.panelUrl}`]);
  } finally {
    await stop?.();
    if (busy.listening) await new Promise<void>((resolveClose) => busy.close(() => resolveClose()));
  }
});

test("the management panel saves shared settings, preserves editable drafts and blocks viewers live", async () => {
  const dir = await workspace();
  const library = await createLibrary(dir, "Photos");
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const { hashPassword } = require("../dist/.generated/plugin-service/runtime.cjs");
  const existingHash = hashPassword("existing password");
  const settingsPath = await writeSettings(dir, {
    port,
    authUsers: [{ username: "alice", passwordHash: existingHash, role: "viewer" }],
    autoStart: true,
    customField: "retained",
    trustForwardedFor: true,
    libraryProtectionEnabled: true,
    sharedLibraries: [{ path: library, name: "Photos", access: "selected", users: ["alice"] }],
  });
  const before = await readFile(settingsPath, "utf8");
  await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
  await writeFile(join(dir, "app.js"), "");
  const running = await runStandalone(["--panel", "--panel-port", "0"], { log: () => {}, panelAssets: dir, panelStateDir: dir });
  try {
    const url = new URL(running.panelUrl);
    const authorization = { Authorization: `Bearer ${url.hash.slice(1)}` };
    const read = (path: string) => fetch(url.origin + path, { headers: authorization });
    const post = (path: string, input?: unknown, origin = url.origin) => fetch(url.origin + path, {
      method: "POST",
      headers: { ...authorization, Origin: origin, ...(input === undefined ? {} : { "Content-Type": "application/json" }) },
      body: input === undefined ? undefined : JSON.stringify(input),
    });

    assert.equal((await fetch(url.origin + "/api/settings")).status, 401);
    const formText = await (await read("/api/settings")).text();
    const { revision, settings, libraries } = JSON.parse(formText);
    assert.equal(settings.authUsers[0].hasPassword, true);
    assert.equal(libraries[0].path, library);
    assert.ok(!formText.includes(existingHash));
    assert.doesNotMatch(formText, /passwordHash|sessionSecret/);
    const change = {
      revision,
      settings: {
        authEnabled: true,
        authUsers: [
          { username: "alicia", rowKey: "alice", role: "viewer" },
          { username: "bob", password: "new password", role: "admin" },
        ],
        customDomain: "preview.local",
        port: String(port),
        sessionDurationDays: "12",
        sharedLibraries: [{ path: library, name: "Photos", access: "selected", users: ["alicia"] }],
      },
    };
    assert.equal((await post("/api/settings", change, "http://example.test")).status, 403);
    assert.equal((await post("/api/settings", change)).status, 409);
    assert.equal(await readFile(settingsPath, "utf8"), before);

    assert.equal((await post("/api/servers/0/stop")).status, 200);
    const invalid = await post("/api/settings", { revision, settings: { port: 0 } });
    assert.equal(invalid.status, 400);
    assert.equal(await readFile(settingsPath, "utf8"), before);
    assert.equal((await post("/api/settings/block", { address: "invalid" })).status, 400);
    const draftAddress = "198.51.100.8";
    assert.equal((await post("/api/settings/block", { address: draftAddress })).status, 200);
    assert.equal((await (await read("/api/settings")).json()).revision, revision);
    assert.equal((await post("/api/settings/unblock", { address: draftAddress })).status, 200);
    assert.equal((await (await read("/api/settings")).json()).revision, revision);
    assert.equal((await post("/api/settings/block", { address: draftAddress })).status, 200);
    const response = await post("/api/settings", change);
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.notEqual(saved.form.revision, revision);
    assert.equal(saved.form.settings.port, port);
    assert.equal(saved.snapshot.servers[0].port, port);
    assert.equal(saved.snapshot.servers[0].authEnabled, true);
    assert.equal(saved.form.settings.authUsers[1].hasPassword, true);
    const persistedText = await readFile(settingsPath, "utf8");
    const persisted = JSON.parse(persistedText);
    assert.equal(persisted.authUsers[0].passwordHash, existingHash);
    assert.equal(persisted.sessionSecret, SECRET);
    assert.equal(persisted.autoStart, true);
    assert.equal(persisted.customField, "retained");
    assert.equal(persisted.trustForwardedFor, true);
    assert.deepEqual(persisted.sharedLibraries[0].users, ["alicia"]);
    assert.doesNotMatch(persistedText, /new password|existing password/);
    assert.deepEqual(persisted.blockedAddresses.map(({ address }: { address: string }) => address), [draftAddress]);
    assert.equal((await post("/api/settings", change)).status, 409);

    const started = await (await post("/api/servers/0/start")).json();
    assert.equal(started.servers[0].state, "running");
    assert.match(started.servers[0].url, /preview\.local/);
    const viewer = new URL(started.servers[0].url);
    viewer.hostname = "127.0.0.1";
    const login = (username: string, password: string) => fetch(viewer.origin + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: viewer.origin },
      body: JSON.stringify({ username, password }),
    });
    assert.equal((await login("alicia", "existing password")).status, 200);
    assert.equal((await login("bob", "new password")).status, 200);

    const address = "198.51.100.7";
    const proxied = () => fetch(viewer.origin + "/api/auth/status", { headers: { "X-Forwarded-For": address } });
    assert.equal((await proxied()).status, 200);
    const blocked = await post("/api/settings/block", { address });
    assert.equal(blocked.status, 200);
    assert.ok((await blocked.json()).blockedAddresses.some((entry: { address: string }) => entry.address === address));
    assert.ok(JSON.parse(await readFile(settingsPath, "utf8")).blockedAddresses.some((entry: { address: string }) => entry.address === address));
    assert.equal((await proxied()).status, 403);
    assert.equal((await post("/api/settings/unblock", { address })).status, 200);
    assert.equal((await proxied()).status, 200);

    const revisionAfterSave = saved.form.revision;
    const invalidHttps = await post("/api/settings/switch", { revision: revisionAfterSave, field: "httpsEnabled", checked: true });
    assert.equal(invalidHttps.status, 400);
    assert.match((await invalidHttps.json()).error, /certificate and key/);
    assert.equal((await (await proxied()).json()).required, true);

    const passwordOff = await post("/api/settings/switch", {
      revision: revisionAfterSave,
      field: "authEnabled",
      checked: false,
      settings: { port: 1 },
    });
    assert.equal(passwordOff.status, 200);
    const switched = await passwordOff.json();
    assert.equal(switched.snapshot.servers[0].state, "running");
    assert.equal(switched.snapshot.servers[0].authEnabled, false);
    const diskSettings = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(diskSettings.authEnabled, false);
    assert.equal(diskSettings.port, port);
    assert.equal((await (await proxied()).json()).required, false);

    const passwordOn = await post("/api/settings/switch", { revision: switched.form.revision, field: "authEnabled", checked: true });
    assert.equal(passwordOn.status, 200);
    assert.equal((await passwordOn.json()).snapshot.servers[0].state, "running");
    assert.equal((await login("alicia", "existing password")).status, 200);
  } finally {
    await running.stop();
  }
});

test("panel mode rejects viewer CLI options and can configure its first library", async () => {
  const dir = await workspace();
  const library = await createLibrary(dir, "Photos");
  await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
  await writeFile(join(dir, "app.js"), "");
  const options = { log: () => {}, panelAssets: dir, panelStateDir: dir };
  for (const flags of [
    ["--config", "standalone.json"], ["--library", library], ["--settings", "other.json"],
    ["--access-log", "other.jsonl"], ["-f"], ["--port", "0"],
  ]) {
    await assert.rejects(runStandalone(["--panel", ...flags], options), /--panel can only be combined with --panel-port/);
  }
  const running = await runStandalone(["--panel", "--panel-port", "0"], options);
  try {
    const url = new URL(running.panelUrl);
    const headers = { Authorization: `Bearer ${url.hash.slice(1)}`, Origin: url.origin };
    const get = (path: string) => fetch(url.origin + path, { headers });
    const save = (body: unknown) => fetch(url.origin + "/api/settings", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const status = await (await get("/api/status")).json();
    assert.deepEqual(status.servers.map((server: { state: string; libraries: unknown[] }) => [server.state, server.libraries]), [["stopped", []]]);
    const form = await (await get("/api/settings")).json();
    const draft = { revision: form.revision, settings: { host: "0.0.0.0", sharedLibraries: [{ path: library, name: "Photos" }] } };
    const unconfirmed = await save(draft);
    assert.equal(unconfirmed.status, 400);
    assert.equal((await unconfirmed.json()).code, "confirm_anonymous_lan");
    await assert.rejects(stat(join(dir, "settings.json")), { code: "ENOENT" });
    const confirmed = await save({ ...draft, allowAnonymousLan: true });
    assert.equal(confirmed.status, 200);
    const { snapshot } = await confirmed.json();
    assert.equal(snapshot.servers[0].publicNetwork, true);
    assert.equal(snapshot.servers[0].libraries[0].name, "Photos");
    const onDisk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(onDisk.sharedLibraries[0].path, library);
  } finally {
    await running.stop();
  }
});

test("panel mode starts the viewer with the CLI only when Auto start is on", async () => {
  const dir = await workspace();
  const library = await createLibrary(dir, "Photos");
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  await writeSettings(dir, { port, sharedLibraries: [{ path: library, name: "Photos" }] });
  await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
  await writeFile(join(dir, "app.js"), "");
  const options = { log: () => {}, panelAssets: dir, panelStateDir: dir };

  const first = await runStandalone(["--panel", "--panel-port", "0"], options);
  try {
    const url = new URL(first.panelUrl);
    const headers = { Authorization: `Bearer ${url.hash.slice(1)}`, Origin: url.origin };
    const get = (path: string) => fetch(url.origin + path, { headers });
    const status = await (await get("/api/status")).json();
    assert.equal(status.servers[0].state, "stopped");
    assert.equal(first.servers.length, 0);

    const form = await (await get("/api/settings")).json();
    assert.equal(form.settings.autoStart, false);
    const started = await (await fetch(url.origin + "/api/servers/0/start", { method: "POST", headers })).json();
    assert.equal(started.servers[0].state, "running");
    const before = started.servers[0].url;
    const switched = await fetch(url.origin + "/api/settings/switch", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ revision: form.revision, field: "autoStart", checked: true }),
    });
    assert.equal(switched.status, 200);
    const saved = await switched.json();
    assert.equal(saved.form.settings.autoStart, true);
    // Turning Auto start on saves it for the next CLI start without restarting the running viewer.
    assert.equal(saved.snapshot.servers[0].state, "running");
    assert.equal(saved.snapshot.servers[0].url, before);
    assert.equal(JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).autoStart, true);
  } finally {
    await first.stop();
  }

  const second = await runStandalone(["--panel", "--panel-port", "0"], options);
  try {
    assert.equal(second.servers.length, 1);
  } finally {
    await second.stop();
  }
});

test("the standalone panel reports Advanced Sort progress separately for each library", async () => {
  const dir = await workspace();
  const photos = await createLibrary(dir, "Photos");
  const legacy = await createLibrary(dir, "Legacy");
  await writeFile(join(legacy, "metadata.json"), JSON.stringify({ applicationVersion: "999.0.0" }));
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  await writeSettings(dir, {
    port,
    autoStart: true,
    experimentalSort: true,
    sharedLibraries: [
      { path: photos, name: "Photos" },
      { path: legacy, name: "Legacy" },
      { path: join(dir, "Missing.library"), name: "Missing" },
    ],
  });
  await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
  await writeFile(join(dir, "app.js"), "");

  const running = await runStandalone(["--panel", "--panel-port", "0"], { log: () => {}, panelAssets: dir, panelStateDir: dir });
  try {
    await running.ready;
    const url = new URL(running.panelUrl);
    const headers = { Authorization: `Bearer ${url.hash.slice(1)}`, Origin: url.origin };
    const response = await fetch(url.origin + "/api/status", { headers });
    assert.equal(response.status, 200);
    const { servers } = await response.json();
    assert.equal(servers[0].state, "running");
    const [ready, failed, unavailable] = servers[0].sortIndexes;
    assert.deepEqual(ready, { id: libraryIdFor(photos, SECRET), name: "Photos", status: "ready", loaded: 1, total: 1 });
    assert.equal(failed.name, "Legacy");
    assert.equal(failed.status, "failed");
    assert.match(failed.reason, /999/);
    assert.equal(unavailable.name, "Missing");
    assert.equal(unavailable.status, "unavailable");
    assert.match(unavailable.reason, /not found/);

    const stopped = await fetch(url.origin + "/api/servers/0/stop", { method: "POST", headers });
    assert.equal(stopped.status, 200);
    assert.equal((await stopped.json()).servers[0].sortIndexes, undefined);
  } finally {
    await running.stop();
  }
});

test("the panel keeps its chosen port, rotates its token, and reports port conflicts", async () => {
  const dir = await workspace();
  const library = await createLibrary(dir, "Photos");
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = (reservation.address() as { port: number }).port;
  const args = ["--panel", "--panel-port", String(port)];
  const options = { log: () => {}, panelAssets: dir, panelStateDir: dir };

  try {
    await writeSettings(dir, { port, autoStart: true, sharedLibraries: [{ path: library, name: "Photos" }] });
    await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
    await writeFile(join(dir, "app.js"), "");
    await assert.rejects(
      runStandalone(args, options),
      new RegExp(`Management panel port ${port} is already in use.*--panel-port`),
    );
  } finally {
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
  }

  const first = await runStandalone(args, options);
  const firstUrl = new URL(first.panelUrl);
  try {
    assert.equal(firstUrl.hostname, "127.0.0.1");
    assert.equal(firstUrl.port, String(port));
    const status = await fetch(firstUrl.origin + "/api/status", {
      headers: { Authorization: `Bearer ${firstUrl.hash.slice(1)}` },
    });
    assert.equal(status.status, 200);
    const { servers } = await status.json();
    assert.equal(servers[0].state, "error");
    assert.match(servers[0].error, /Choose a different viewer port/);
  } finally {
    await first.stop();
  }

  const second = await runStandalone(args, options);
  try {
    const secondUrl = new URL(second.panelUrl);
    assert.equal(secondUrl.origin, firstUrl.origin);
    assert.notEqual(secondUrl.hash, firstUrl.hash);
    const rejected = await fetch(secondUrl.origin + "/api/status", {
      headers: { Authorization: `Bearer ${firstUrl.hash.slice(1)}` },
    });
    assert.equal(rejected.status, 401);
    const authorized = await fetch(secondUrl.origin + "/api/status", {
      headers: { Authorization: `Bearer ${secondUrl.hash.slice(1)}` },
    });
    assert.equal(authorized.status, 200);
  } finally {
    await second.stop();
  }
});

test("both management panels read and export shared history while clearing only their own log", async () => {
  const dir = await workspace();
  const { createAccessLog, defaultAccessLogPath } = require("../dist/.generated/plugin-service/accessLog.cjs");
  const { createServerManager } = require("../dist/.generated/plugin-service/runtime.cjs");
  const pluginLogPath = defaultAccessLogPath("plugin", dir);
  assert.equal(pluginLogPath, join(dir, "access-log.jsonl"));
  const pluginLog = createAccessLog({ filePath: pluginLogPath });
  const standaloneLog = createAccessLog({ filePath: defaultAccessLogPath("standalone", dir) });
  const at = Date.now();
  pluginLog.record({ at: at - 100, type: "view", event: "view", ip: "192.0.2.1", user: "plugin-user" });
  standaloneLog.record({ at, type: "view", event: "view", ip: "192.0.2.2", user: "standalone-user" });
  await Promise.all([pluginLog.flush(), standaloneLog.flush()]);
  const manager = createServerManager({ accessLog: pluginLog });
  await writeFile(join(dir, "index.html"), "<title>Media Preview Server</title>");
  await writeFile(join(dir, "app.js"), "");

  const running = await runStandalone(["--panel", "--panel-port", "0"], { log: () => {}, panelAssets: dir, panelStateDir: dir });
  try {
    const url = new URL(running.panelUrl);
    const headers = { Authorization: `Bearer ${url.hash.slice(1)}`, Origin: url.origin };
    const request = (path: string, method = "GET") => fetch(url.origin + path, { method, headers });
    const recentSources = (summary: { recent: { source: string }[] }) => summary.recent.map((entry) => entry.source);
    const plugin = await manager.accessLogSummary({ range: "24h" });
    const standalone = await (await request("/api/activity")).json();
    assert.deepEqual(recentSources(plugin), ["standalone", "plugin"]);
    assert.deepEqual(recentSources(standalone), ["standalone", "plugin"]);
    assert.equal(plugin.totals.view, 2);
    assert.equal(standalone.totals.view, 2);
    assert.equal(plugin.activeClients, 1);
    assert.equal(standalone.activeClients, 0);

    pluginLog.record({ at: at + 100, type: "auth", event: "login_success", ip: "192.0.2.3" });
    await pluginLog.flush();
    const updated = await (await request("/api/activity?search=Eagle%20plugin")).json();
    assert.deepEqual(recentSources(updated), ["plugin", "plugin"]);
    assert.equal(updated.recent[0].event, "login_success");

    const exported = await (await request("/api/activity/export")).text();
    assert.match(exported, /status,source\n/);
    assert.match(exported, /plugin-user.*plugin\n/);
    assert.match(exported, /standalone-user.*standalone\n/);
    const pluginExportPath = join(dir, "export.jsonl");
    await manager.exportAccessLog(pluginExportPath, "jsonl");
    const exportedEvents = (await readFile(pluginExportPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(exportedEvents.map((entry) => entry.source), ["plugin", "standalone", "plugin"]);

    await manager.clearAccessLog();
    await pluginLog.flush();
    const afterPluginClear = await (await request("/api/activity")).json();
    assert.equal(afterPluginClear.totals.view, 1);
    assert.ok(afterPluginClear.recent.some((entry: { user?: string }) => entry.user === "standalone-user"));
    assert.ok(!afterPluginClear.recent.some((entry: { user?: string }) => entry.user === "plugin-user"));

    assert.equal((await request("/api/activity/clear", "POST")).status, 200);
    const afterStandaloneClear = await (await request("/api/activity")).json();
    assert.equal(afterStandaloneClear.totals.view, 0);
    assert.deepEqual(recentSources(afterStandaloneClear).sort(), ["plugin", "standalone"]);
  } finally {
    await running.stop();
  }
});
