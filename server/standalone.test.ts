import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { isLoopback, parseArgs, resolveServerSettings, runStandalone } = require("../dist/.generated/plugin-service/standalone.cjs");

const cleanups: string[] = [];

afterEach(async () => {
  for (const path of cleanups.splice(0)) await rm(path, { recursive: true, force: true });
});

async function createLibrary() {
  const dir = await mkdtemp(join(tmpdir(), "standalone-"));
  cleanups.push(dir);
  const libraryPath = join(dir, "Photos.library");
  const itemDir = join(libraryPath, "images", "A.info");
  await mkdir(itemDir, { recursive: true });
  await writeFile(join(libraryPath, "metadata.json"), JSON.stringify({ folders: [], smartFolders: [], tagsGroups: [], applicationVersion: "4.0.0" }));
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ A: 1, all: 1 }));
  await writeFile(join(itemDir, "metadata.json"), JSON.stringify({ id: "A", name: "sunset", ext: "jpg", tags: [], folders: [], modificationTime: 1 }));
  await writeFile(join(itemDir, "sunset.jpg"), "jpeg");
  return { dir, libraryPath };
}

test("parses flags in both --flag value and --flag=value forms", () => {
  assert.deepEqual(parseArgs(["--library", "/a.library", "--port=8080", "--host", "0.0.0.0", "--allow-anonymous-lan"]), {
    allowAnonymousLan: true,
    allowUnknownFormat: false,
    configPath: "",
    help: false,
    host: "0.0.0.0",
    libraries: ["/a.library"],
    port: "8080",
  });
  assert.throws(() => parseArgs(["--library"]), /--library needs a value/);
  assert.throws(() => parseArgs(["--nope"]), /Unknown option: --nope/);
});

test("tells loopback addresses from network ones", () => {
  for (const host of ["127.0.0.1", "127.1.2.3", "localhost", "::1", "[::1]"]) assert.equal(isLoopback(host), true, host);
  for (const host of ["0.0.0.0", "192.168.1.2", "::", "studio.local"]) assert.equal(isLoopback(host), false, host);
});

test("listens on loopback by default, and refuses a network address with nobody to sign in", async () => {
  const settings = await resolveServerSettings(parseArgs(["--library", "/a.library", "--port", "9000"]));
  assert.equal(settings.server.host, "127.0.0.1");
  assert.equal(settings.server.port, 9000);
  assert.deepEqual(settings.server.authUsers, []);
  await assert.rejects(resolveServerSettings(parseArgs(["--library", "/a.library", "--host", "0.0.0.0"])), /without signing in/);
  assert.equal((await resolveServerSettings(parseArgs(["--library", "/a.library", "--host", "0.0.0.0", "--allow-anonymous-lan"]))).server.host, "0.0.0.0");
  await assert.rejects(resolveServerSettings(parseArgs([])), /--library is required/);
  await assert.rejects(resolveServerSettings(parseArgs(["--library", "/a", "--library", "/b"])), /Only one --library/);
});

test("takes users from a config file in the plugin's settings format", async () => {
  const { dir } = await createLibrary();
  const configPath = join(dir, "settings.json");
  await writeFile(configPath, JSON.stringify({
    host: "0.0.0.0",
    port: 41000,
    authEnabled: true,
    authUsers: [{ username: "alice", password: "correct horse", role: "viewer" }],
  }));
  const settings = await resolveServerSettings(parseArgs(["--library", "/a.library", "--config", configPath]));
  assert.equal(settings.server.host, "0.0.0.0");
  assert.equal(settings.server.port, 41000);
  assert.deepEqual(settings.server.authUsers.map((user: { username: string }) => user.username), ["alice"]);
  assert.notEqual(settings.server.authUsers[0].passwordHash, "correct horse");
});

test("serves the library read only, without Eagle", async () => {
  const { libraryPath } = await createLibrary();
  const lines: string[] = [];
  const running = await runStandalone(["--library", libraryPath, "--port", "0"], { log: (line: string) => lines.push(line) });
  try {
    const port = running.viewer.status().port;
    assert.match(lines.at(-1)!, new RegExp(`Serving "Photos" \\(read only\\) at http://127\\.0\\.0\\.1:${port}`));
    const origin = `http://127.0.0.1:${port}`;
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.library.name, "Photos");
    assert.deepEqual(health.app, { standalone: true, platform: process.platform });
    const headers = { "X-Library-Id": health.library.id };
    const items = await (await fetch(`${origin}/api/items`, { headers })).json();
    assert.deepEqual(items.items.map((item: { name: string }) => item.name), ["sunset"]);
    assert.equal(await (await fetch(`${origin}/api/items/A/file`, { headers })).text(), "jpeg");
    const star = await fetch(`${origin}/api/items/A/star`, {
      method: "POST",
      headers: { ...headers, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ star: 5 }),
    });
    assert.equal(star.status, 403);
  } finally {
    await running.stop();
  }
});

test("stops before listening when the library can't be read", async () => {
  const { dir } = await createLibrary();
  await assert.rejects(runStandalone(["--library", join(dir, "Missing.library"), "--port", "0"], { log: () => {} }), /ENOENT/);
});
