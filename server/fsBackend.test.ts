import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { createFsBackend, parseSearchQuery } = require("../dist/.generated/plugin-service/fsBackend.cjs");

interface TestItem {
  id: string;
  name: string;
  ext?: string;
  star?: number;
  tags?: string[];
  folders?: string[];
  isDeleted?: boolean;
  modificationTime: number;
  annotation?: string;
  url?: string;
}

const libraries: string[] = [];

afterEach(async () => {
  for (const path of libraries.splice(0)) await rm(path, { recursive: true, force: true });
});

async function writeItem(libraryPath: string, item: TestItem) {
  const dir = join(libraryPath, "images", `${item.id}.info`);
  await mkdir(dir, { recursive: true });
  const ext = item.ext ?? "png";
  await writeFile(join(dir, "metadata.json"), JSON.stringify({ ext, tags: [], folders: [], isDeleted: false, ...item }));
  await writeFile(join(dir, `${item.name}.${ext}`), "file");
  await writeFile(join(dir, `${item.name}_thumbnail.png`), "thumb");
}

async function writeMtime(libraryPath: string, items: TestItem[], extra: Record<string, number> = {}) {
  const values: Record<string, number> = {};
  for (const item of items) values[item.id] = item.modificationTime;
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ ...values, ...extra, all: items.length }));
}

const FOLDERS = [
  { id: "F1", name: "Animals", description: "zoo", children: [{ id: "F1A", name: "Cats", children: [] }], password: "", passwordTips: "" },
  { id: "LOCK", name: "Private", children: [{ id: "LOCKCHILD", name: "Inner", children: [] }], password: "secret", passwordTips: "hint" },
];

const ITEMS: TestItem[] = [
  { id: "A", name: "apple", star: 5, tags: ["fruit", "red"], folders: ["F1"], modificationTime: 100, annotation: "crisp" },
  { id: "B", name: "banana", ext: "jpg", star: 0, tags: ["fruit"], modificationTime: 300 },
  { id: "C", name: "cat photo", star: 4, tags: ["animal"], folders: ["F1A"], modificationTime: 200, url: "https://example.com/cat" },
  { id: "D", name: "deleted", tags: ["fruit"], isDeleted: true, modificationTime: 400 },
  { id: "L", name: "locked", tags: ["fruit", "hidden-tag"], folders: ["LOCKCHILD"], modificationTime: 500 },
  { id: "M", name: "mixed", tags: ["red"], folders: ["F1", "LOCK"], modificationTime: 600 },
];

async function createLibrary({ applicationVersion = "4.0.0", items = ITEMS } = {}) {
  const libraryPath = join(await mkdtemp(join(tmpdir(), "fs-backend-")), "Test.library");
  libraries.push(libraryPath);
  await mkdir(join(libraryPath, "images"), { recursive: true });
  await writeFile(join(libraryPath, "metadata.json"), JSON.stringify({
    folders: FOLDERS,
    smartFolders: [],
    quickAccess: [],
    tagsGroups: [{ id: "G1", name: "Food", color: "red", tags: ["fruit"] }],
    modificationTime: 1,
    applicationVersion,
  }));
  await writeFile(join(libraryPath, "tags.json"), JSON.stringify({ historyTags: [], starredTags: ["red", "hidden-tag"] }));
  for (const item of items) await writeItem(libraryPath, item);
  await writeMtime(libraryPath, items);
  return libraryPath;
}

const names = (page: { items: Array<{ name?: string }> }) => page.items.map((item) => item.name);

test("lists items newest first, leaving out the trash and anything in a locked folder", async () => {
  const backend = createFsBackend({ libraryPath: await createLibrary() });
  const page = await backend.listItems({ limit: 100 });
  assert.deepEqual(names(page), ["banana", "cat photo", "apple"]);
  assert.equal(page.total, 3);
  assert.deepEqual(page.items[0], { id: "B", name: "banana", ext: "jpg", star: 0, tags: ["fruit"], folders: [], modificationTime: 300 });
  assert.deepEqual(await backend.itemById("L"), []);
  assert.deepEqual(await backend.itemById("D"), []);
  assert.equal(await backend.isItemServable("A"), true);
  assert.equal(await backend.isItemServable("L"), false);
  assert.equal(await backend.isItemServable("M"), false);
  assert.equal(await backend.isItemServable("D"), false);
  assert.deepEqual((await backend.itemsByIds(["C", "L", "A", "nope"])).map((item: { id: string }) => item.id), ["C", "A"]);
});

test("filters like Eagle's item/get, and lists several ratings highest first", async () => {
  const backend = createFsBackend({ libraryPath: await createLibrary() });
  assert.deepEqual(names(await backend.listItems({ folderId: "F1" })), ["apple"]);
  assert.deepEqual(names(await backend.listItems({ isUnfiled: true })), ["banana"]);
  assert.deepEqual(names(await backend.listItems({ ext: "JPG" })), ["banana"]);
  assert.deepEqual(names(await backend.listItems({ tags: ["fruit", "red"] })), ["apple"]);
  assert.deepEqual(names(await backend.listItems({ keywords: "AN" })), ["banana"]);
  assert.deepEqual(names(await backend.listItems({ rating: "0,5,4" })), ["apple", "cat photo", "banana"]);
});

test("hides locked folders and their password fields, and counts items in each folder", async () => {
  const backend = createFsBackend({ libraryPath: await createLibrary() });
  const folders = await backend.folders();
  assert.deepEqual(folders.items, [
    { id: "F1", name: "Animals", description: "zoo", imageCount: 1, children: [{ id: "F1A", name: "Cats", imageCount: 1, children: [] }] },
  ]);
});

test("tags count only visible items, with groups and starred tags from the library", async () => {
  const backend = createFsBackend({ libraryPath: await createLibrary() });
  const overview = await backend.tagOverview();
  assert.deepEqual(overview.tags, [
    { name: "animal", count: 1, imageCount: 1, groups: [] },
    { name: "fruit", count: 2, imageCount: 2, groups: ["G1"] },
    { name: "red", count: 1, imageCount: 1, groups: [] },
  ]);
  assert.deepEqual(overview.groups, [{ id: "G1", name: "Food", color: "red", tags: ["fruit"] }]);
  assert.deepEqual(overview.starred.map((tag: { name: string }) => tag.name), ["red"]);
  assert.deepEqual((await backend.listTags({ query: "RU" })).items.map((tag: { name: string }) => tag.name), ["fruit"]);
  assert.deepEqual(await backend.tagCoverItem("fruit"), { id: "B", name: "banana", ext: "jpg" });
  assert.equal(await backend.tagCoverItem("hidden-tag"), null);
});

test("searches name, notes, URL, tags, and folder names with Eagle's operators", async () => {
  const backend = createFsBackend({ libraryPath: await createLibrary() });
  const search = async (query: string) => names(await backend.searchItems({ query }));
  assert.deepEqual(await search("fruit"), ["banana", "apple"]);
  assert.deepEqual(await search("fruit -red"), ["banana"]);
  assert.deepEqual(await search("crisp"), ["apple"]);
  assert.deepEqual(await search("example.com"), ["cat photo"]);
  assert.deepEqual(await search("zoo"), ["apple"]);
  assert.deepEqual(await search("banana OR cat"), ["banana", "cat photo"]);
  assert.deepEqual(await search('"cat photo"'), ["cat photo"]);
  assert.deepEqual(await search(".jpg"), ["banana"]);
  assert.deepEqual(await search("private"), []);
  assert.deepEqual(parseSearchQuery('a -b "c d" e OR f'), { all: ["a", "c d"], any: [["e", "f"]], none: ["b"] });
});

test("sorts and counts types through its own sort index, without Eagle", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath });
  const index = backend.sortIndexes.forLibrary(libraryPath);
  assert.equal(await index.whenReady(5000), true);
  assert.deepEqual(await index.query({}, { key: "name", order: "asc" }, 0, 10), { complete: true, ids: ["A", "B", "C"], total: 3 });
  assert.deepEqual((await index.query({ tags: ["fruit"] }, { key: "rating", order: "desc" }, 0, 10)).ids, ["A", "B"]);
  assert.deepEqual(await index.extensionCounts({}), { status: "complete", items: [{ ext: "jpg", count: 1 }, { ext: "png", count: 2 }] });
  assert.equal(backend.sortIndexes.loaded(`${libraryPath}/`), index);
  assert.equal(backend.sortIndexes.loaded("/elsewhere"), null);
});

test("picks up changed, added, and removed items from mtime.json", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);

  const renamed = { ...ITEMS[0], name: "green apple", modificationTime: 100 };
  const added: TestItem = { id: "N", name: "new", modificationTime: 700 };
  await writeItem(libraryPath, renamed);
  await writeItem(libraryPath, added);
  await rm(join(libraryPath, "images", "B.info"), { recursive: true });
  const items = [renamed, added, ...ITEMS.slice(2)];
  // The renamed item's time changes; B's id stays in mtime.json, as Eagle leaves it.
  await writeMtime(libraryPath, items, { A: 101, B: 300 });
  assert.deepEqual(names(await backend.listItems()), ["new", "cat photo", "green apple"]);
});

test("follows a folder being locked in the library's metadata", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  const locked = FOLDERS.map((folder) => (folder.id === "F1" ? { ...folder, password: "pw" } : folder));
  await writeFile(join(libraryPath, "metadata.json"), JSON.stringify({ folders: locked, tagsGroups: [], applicationVersion: "4.0.0", modificationTime: 2 }));
  assert.deepEqual(names(await backend.listItems()), ["banana"]);
  assert.deepEqual((await backend.folders()).items, []);
});

test("refuses a library saved by an Eagle version it doesn't know, unless told to try", async () => {
  const libraryPath = await createLibrary({ applicationVersion: "5.0.0" });
  await assert.rejects(createFsBackend({ libraryPath }).open(), /Eagle 5\.0\.0.*--allow-unknown-format/);
  const backend = createFsBackend({ libraryPath, allowUnknownFormat: true });
  await backend.open();
  assert.equal((await backend.listItems()).total, 3);
});

test("has no writes, and reports the library by its folder name", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath });
  // Which library this is is known before it is read.
  assert.deepEqual(await backend.libraryInfo(), { path: libraryPath, name: "Test", applicationVersion: undefined, modificationTime: undefined });
  assert.equal(backend.state().status, "idle");
  await backend.open();
  assert.deepEqual(backend.state(), { status: "ready", loaded: 6, total: 6, error: "" });
  assert.equal(backend.kind, "fs");
  assert.equal(backend.write, undefined);
  assert.deepEqual(await backend.libraryInfo(), { path: libraryPath, name: "Test", applicationVersion: "4.0.0", modificationTime: 1 });
  assert.deepEqual(await backend.appInfo(), { standalone: true, platform: process.platform });
});

test("the viewer server browses, sorts, and serves files from it, and never serves a locked item", async () => {
  const { createViewerServer } = require("../dist/.generated/plugin-service/viewerServer.cjs");
  const libraryPath = await createLibrary();
  const viewer = createViewerServer({ host: "127.0.0.1", port: 0, backend: createFsBackend({ libraryPath }) });
  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.library.name, "Test");
    assert.deepEqual(health.permissions, { manageLibrary: false, read: true, upload: false, writeMetadata: false, writeRating: false });
    const headers = { "X-Library-Id": health.library.id };
    const connect = await (await fetch(`${origin}/api/connect`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Origin: origin }, body: "{}" })).json();
    assert.equal(connect.features.sort, true);

    const sorted = await (await fetch(`${origin}/api/items?sort=name&order=desc`, { headers })).json();
    assert.deepEqual(names(sorted), ["cat photo", "banana", "apple"]);
    assert.deepEqual(sorted.sort, { status: "ready" });
    const types = await (await fetch(`${origin}/api/item-types`, { headers })).json();
    assert.deepEqual(types, { complete: true, items: [{ ext: "jpg", count: 1 }, { ext: "png", count: 2 }] });

    const file = await fetch(`${origin}/api/items/A/file`, { headers });
    assert.equal(file.status, 200);
    assert.equal(await file.text(), "file");
    const thumb = await fetch(`${origin}/api/items/A/thumb`, { headers });
    assert.equal(await thumb.text(), "thumb");
    for (const id of ["L", "M", "D"]) {
      assert.equal((await fetch(`${origin}/api/items/${id}/file`, { headers })).status, 404);
      assert.equal((await fetch(`${origin}/api/items/${id}/thumb`, { headers })).status, 404);
      assert.equal((await fetch(`${origin}/file/${id}`, { headers })).status, 404);
    }
  } finally {
    await viewer.stop();
  }
});

test("the viewer server answers each request from the library its id names", async () => {
  const { createViewerServer, sha256 } = require("../dist/.generated/plugin-service/viewerServer.cjs");
  const first = await createLibrary();
  const secondPath = join(await mkdtemp(join(tmpdir(), "fs-backend-")), "Second.library");
  libraries.push(secondPath);
  await mkdir(join(secondPath, "images"), { recursive: true });
  await writeFile(join(secondPath, "metadata.json"), JSON.stringify({ folders: [], tagsGroups: [], applicationVersion: "4.0.0" }));
  const only: TestItem = { id: "Z", name: "zebra", modificationTime: 1 };
  await writeItem(secondPath, only);
  await writeMtime(secondPath, [only]);
  const broken = join(await mkdtemp(join(tmpdir(), "fs-backend-")), "Broken.library");
  libraries.push(broken);
  await mkdir(broken, { recursive: true });
  await writeFile(join(broken, "metadata.json"), JSON.stringify({ applicationVersion: "9.0.0" }));

  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "alice", passwordHash: sha256("a"), role: "viewer" },
      { username: "bob", passwordHash: sha256("b"), role: "viewer" },
    ],
    sharedLibraries: [first, secondPath, broken],
    libraryUserRules: [{ path: secondPath, users: ["alice"] }],
    backends: [createFsBackend({ libraryPath: first }), createFsBackend({ libraryPath: secondPath }), createFsBackend({ libraryPath: broken })],
  });
  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const login = async (username: string, password: string) => {
      const response = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ username, password }) });
      return String(response.headers.get("set-cookie")).split(";")[0];
    };
    const alice = await login("alice", "a");
    const bob = await login("bob", "b");
    const get = (path: string, cookie: string, libraryId = "") => fetch(`${origin}${path}`, { headers: { Cookie: cookie, ...(libraryId ? { "X-Library-Id": libraryId } : {}) } });

    // Each user sees only the libraries open to them; the one that can't be read says so.
    const aliceList = (await (await get("/api/libraries", alice)).json()).libraries;
    assert.deepEqual(aliceList.map((library: { name: string }) => library.name), ["Test", "Second", "Broken"]);
    const bobList = (await (await get("/api/libraries", bob)).json()).libraries;
    assert.deepEqual(bobList.map((library: { name: string }) => library.name), ["Test", "Broken"]);
    const [testId, secondId, brokenId] = aliceList.map((library: { id: string }) => library.id);

    // Without an id, health and connect answer for the first library.
    const health = await (await get("/api/health", alice)).json();
    assert.equal(health.library.id, testId);

    const items = await get("/api/items", alice, secondId);
    assert.equal(items.headers.get("x-library-id"), secondId);
    assert.deepEqual(names(await items.json()), ["zebra"]);
    assert.deepEqual(names(await (await get("/api/items", alice, testId)).json()), ["banana", "cat photo", "apple"]);
    assert.equal(await (await get(`/api/items/Z/file?library=${secondId}`, alice)).text(), "file");
    assert.equal((await get("/api/items/Z/file", alice, testId)).status, 404);

    // Bob may not open the second library, even with its id.
    assert.equal((await get("/api/items", bob, secondId)).status, 403);
    // An id this server doesn't know: refused on library routes, ignored by health.
    assert.equal((await get("/api/items", alice, "stale-id")).status, 409);
    assert.equal((await (await get("/api/health", alice, "stale-id")).json()).library.id, testId);
    // A library that can't be read fails on its own; the others keep working.
    assert.equal((await get("/api/items", alice, brokenId)).status, 500);
    const listed = (await (await get("/api/libraries", alice)).json()).libraries;
    assert.deepEqual(listed.map((library: { status: string }) => library.status), ["ready", "ready", "failed"]);
    assert.equal((await get("/api/items", alice, testId)).status, 200);
  } finally {
    await viewer.stop();
  }
});

test("serves only files inside the item's own folder, whatever its metadata says", async () => {
  const { createViewerServer } = require("../dist/.generated/plugin-service/viewerServer.cjs");
  const { symlink } = await import("node:fs/promises");
  const libraryPath = await createLibrary();
  const outside = join(libraryPath, "..", "secret.txt");
  await writeFile(outside, "secret");
  // Metadata pointing outside the library.
  const pointed = join(libraryPath, "images", "A.info", "metadata.json");
  await writeFile(pointed, JSON.stringify({ ...ITEMS[0], ext: "png", filePath: outside, fileURL: `file://${outside}`, thumbnailPath: outside, thumbnailURL: `file://${outside}` }));
  // A link inside an item folder that leads outside.
  await rm(join(libraryPath, "images", "B.info", "banana.jpg"));
  await symlink(outside, join(libraryPath, "images", "B.info", "banana.jpg"));
  // An item folder that is itself a link to a folder elsewhere.
  const elsewhere = join(libraryPath, "..", "elsewhere.info");
  await mkdir(elsewhere);
  await writeFile(join(elsewhere, "metadata.json"), JSON.stringify({ ...ITEMS[2], ext: "png" }));
  await writeFile(join(elsewhere, "cat photo.png"), "secret");
  await rm(join(libraryPath, "images", "C.info"), { recursive: true });
  await symlink(elsewhere, join(libraryPath, "images", "C.info"));

  const backend = createFsBackend({ libraryPath });
  const [item] = await backend.itemById("A");
  for (const field of ["filePath", "fileURL", "thumbnailPath", "thumbnailURL"]) assert.equal(field in item, false, field);
  const viewer = createViewerServer({ host: "127.0.0.1", port: 0, backend });
  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const health = await (await fetch(`${origin}/api/health`)).json();
    const headers = { "X-Library-Id": health.library.id };
    assert.equal(await (await fetch(`${origin}/api/items/A/file`, { headers })).text(), "file");
    assert.equal(await (await fetch(`${origin}/api/items/A/thumb`, { headers })).text(), "thumb");
    for (const path of ["/api/items/B/file", "/api/items/C/file", "/api/items/C/thumb"]) {
      const response = await fetch(`${origin}${path}`, { headers });
      assert.equal(response.status, 404, path);
      assert.notEqual(await response.text(), "secret");
    }
  } finally {
    await viewer.stop();
  }
});

test("an item whose metadata can't be read is hidden, and tried again until it can", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  const metadata = join(libraryPath, "images", "A.info", "metadata.json");

  // Eagle starts moving apple to the trash: mtime.json says it changed, its metadata is mid-write.
  await writeFile(metadata, '{"id": "A", "name": "app');
  await writeMtime(libraryPath, ITEMS, { A: 150 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo"]);
  assert.equal(await backend.isItemServable("A"), false);
  assert.equal(await backend.resolveItemFile("A", "file"), "");

  // The write finishes without mtime.json changing again: it is read at the next check anyway.
  await writeFile(metadata, JSON.stringify({ ...ITEMS[0], isDeleted: true, modificationTime: 100 }));
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo"]);
  assert.equal(await backend.isItemServable("A"), false);

  // Restored, again without a change to mtime.json the backend relies on.
  await writeFile(metadata, '{"id": "A", "nam');
  await writeMtime(libraryPath, ITEMS, { A: 160 });
  assert.equal(await backend.isItemServable("A"), false);
  await writeFile(metadata, JSON.stringify({ ...ITEMS[0], modificationTime: 100 }));
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  assert.equal(await backend.isItemServable("A"), true);
});

test("refuses a library whose images folder or metadata.json is a link to elsewhere", async () => {
  const { symlink, rename } = await import("node:fs/promises");
  const libraryPath = await createLibrary();
  // The whole images folder moved out, and a link left in its place.
  const outsideImages = join(libraryPath, "..", "outside-images");
  await rename(join(libraryPath, "images"), outsideImages);
  await symlink(outsideImages, join(libraryPath, "images"));
  const backend = createFsBackend({ libraryPath });
  await assert.rejects(backend.open(), /images leads outside the library/);
  assert.equal(backend.state().status, "failed");

  const other = await createLibrary();
  const outsideMetadata = join(other, "..", "outside-metadata.json");
  await rename(join(other, "metadata.json"), outsideMetadata);
  await symlink(outsideMetadata, join(other, "metadata.json"));
  await assert.rejects(createFsBackend({ libraryPath: other }).open(), /metadata\.json leads outside the library/);
});

test("never reads an item's metadata from outside the library", async () => {
  const { symlink } = await import("node:fs/promises");
  const libraryPath = await createLibrary();
  // A metadata.json that is a link to a file elsewhere, claiming the same id.
  const planted = join(libraryPath, "..", "planted.json");
  await writeFile(planted, JSON.stringify({ ...ITEMS[0], annotation: "from outside" }));
  const metadata = join(libraryPath, "images", "A.info", "metadata.json");
  await rm(metadata);
  await symlink(planted, metadata);
  // An item folder that is a link to a folder elsewhere.
  const elsewhere = join(libraryPath, "..", "elsewhere.info");
  await mkdir(elsewhere);
  await writeFile(join(elsewhere, "metadata.json"), JSON.stringify({ ...ITEMS[2], annotation: "from outside" }));
  await rm(join(libraryPath, "images", "C.info"), { recursive: true });
  await symlink(elsewhere, join(libraryPath, "images", "C.info"));

  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000 });
  assert.deepEqual(await backend.itemById("A"), []);
  assert.deepEqual(await backend.itemById("C"), []);
  assert.deepEqual(names(await backend.listItems()), ["banana"]);
  assert.deepEqual((await backend.searchItems({ query: "outside" })).items, []);
  // A change to mtime.json for other items leaves them out without reading them again.
  await writeMtime(libraryPath, ITEMS, { B: 301 });
  assert.deepEqual(names(await backend.listItems()), ["banana"]);

  // The links are replaced by the real files, and Eagle records the change: both come back.
  await rm(metadata);
  await writeFile(metadata, JSON.stringify(ITEMS[0]));
  await rm(join(libraryPath, "images", "C.info"));
  await writeItem(libraryPath, ITEMS[2]);
  await writeMtime(libraryPath, ITEMS, { A: 101, B: 301, C: 201 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  assert.deepEqual((await backend.itemById("A"))[0].annotation, "crisp");
});

test("a removed item whose folder comes back is read again once its time changes", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000 });
  await rm(join(libraryPath, "images", "B.info"), { recursive: true });
  // Eagle keeps B's id in mtime.json; its time changes as it goes.
  await writeMtime(libraryPath, ITEMS, { B: 310 });
  assert.deepEqual(names(await backend.listItems()), ["cat photo", "apple"]);
  // Synced back from another computer.
  await writeItem(libraryPath, ITEMS[1]);
  await writeMtime(libraryPath, ITEMS, { B: 320 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
});

test.skipIf(process.platform === "win32")("items in a folder just locked leave cached lists at once", async () => {
  const { execFileSync } = await import("node:child_process");
  const { open } = await import("node:fs/promises");
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, readConcurrency: 1, refreshIntervalMs: 0, refreshWaitMs: 50 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);

  // F1 (apple) is locked, and in the same update B's metadata read waits on a named pipe.
  const locked = FOLDERS.map((folder) => (folder.id === "F1" ? { ...folder, password: "pw" } : folder));
  await writeFile(join(libraryPath, "metadata.json"), JSON.stringify({ folders: locked, tagsGroups: [], applicationVersion: "4.0.0", modificationTime: 2 }));
  const pipe = join(libraryPath, "images", "B.info", "metadata.json");
  await rm(pipe);
  execFileSync("mkfifo", [pipe]);
  await writeMtime(libraryPath, ITEMS, { B: 350 });
  try {
    await backend.listItems();
    let waited = 0;
    while ((await backend.isItemServable("A")) && waited < 2000) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      waited += 20;
    }
    assert.equal(await backend.isItemServable("A"), false);
    // The update still waits on B, and the list already leaves out apple and cat photo (in F1's sub-folder).
    assert.equal(await backend.isItemServable("C"), false);
    assert.deepEqual(names(await backend.listItems()), ["banana"]);
  } finally {
    const writer = await open(pipe, "w");
    await writer.write(JSON.stringify({ ...ITEMS[1], modificationTime: 350 }));
    await writer.close();
  }
});

// A named pipe as an item's metadata.json makes its read wait until the test writes to it, so an
// update can be held half done.
test.skipIf(process.platform === "win32")("an item hidden during a long update leaves cached lists at once", async () => {
  const { execFileSync } = await import("node:child_process");
  const { open } = await import("node:fs/promises");
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, readConcurrency: 1, refreshIntervalMs: 0, refreshWaitMs: 50 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);

  await writeFile(join(libraryPath, "images", "A.info", "metadata.json"), '{"id": "A", "na');
  const pipe = join(libraryPath, "images", "B.info", "metadata.json");
  await rm(pipe);
  execFileSync("mkfifo", [pipe]);
  // mtime.json lists A before B, so A is read (and found unreadable) while B's read waits.
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ A: 150, B: 350, C: 200, D: 400, L: 500, M: 600, all: 6 }));
  try {
    await backend.listItems();
    let waited = 0;
    while ((await backend.isItemServable("A")) && waited < 2000) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
      waited += 20;
    }
    assert.equal(await backend.isItemServable("A"), false);
    // The update is still waiting on B, and the list already leaves A out.
    assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo"]);
  } finally {
    const writer = await open(pipe, "w");
    await writer.write(JSON.stringify({ ...ITEMS[1], modificationTime: 350 }));
    await writer.close();
  }
});

test("an item still a link when its change arrives comes back once the real file does", async () => {
  const { symlink } = await import("node:fs/promises");
  const libraryPath = await createLibrary();
  const planted = join(libraryPath, "..", "planted.json");
  await writeFile(planted, JSON.stringify({ ...ITEMS[0], annotation: "from outside" }));
  const metadata = join(libraryPath, "images", "A.info", "metadata.json");
  const create = (recheckIntervalMs: number) => createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000, recheckIntervalMs });
  const prompt = create(0);
  const slow = create(60 * 60 * 1000);
  assert.deepEqual(names(await prompt.listItems()), ["banana", "cat photo", "apple"]);
  assert.deepEqual(names(await slow.listItems()), ["banana", "cat photo", "apple"]);

  // mtime.json announces A's change while its metadata.json is still a link elsewhere.
  await rm(metadata);
  await symlink(planted, metadata);
  await writeMtime(libraryPath, ITEMS, { A: 101 });
  assert.deepEqual(names(await prompt.listItems()), ["banana", "cat photo"]);
  assert.deepEqual(names(await slow.listItems()), ["banana", "cat photo"]);

  // The real file arrives without another change to A's time; only another item changes.
  await rm(metadata);
  await writeFile(metadata, JSON.stringify(ITEMS[0]));
  await writeMtime(libraryPath, ITEMS, { A: 101, B: 301 });
  assert.deepEqual(names(await prompt.listItems()), ["banana", "cat photo", "apple"]);
  assert.equal((await prompt.itemById("A"))[0].annotation, "crisp");
  // Checked again only every recheckIntervalMs, so the other backend hasn't looked yet.
  assert.deepEqual(names(await slow.listItems()), ["banana", "cat photo"]);
});

test("a folder that arrives after mtime.json, with no further change, is still found", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000, rescanIntervalMs: 0 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  // mtime.json counts one more item than there are folders: N is still syncing.
  const late: TestItem = { id: "N", name: "late", modificationTime: 700 };
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ ...Object.fromEntries(ITEMS.map((item) => [item.id, item.modificationTime])), all: ITEMS.length + 1 }));
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  // Its folder arrives; mtime.json doesn't change again.
  await writeItem(libraryPath, late);
  assert.deepEqual(names(await backend.listItems()), ["late", "banana", "cat photo", "apple"]);
});

test("lists the images folder again at most every rescanIntervalMs", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000, rescanIntervalMs: 60 * 60 * 1000 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  const times = Object.fromEntries(ITEMS.map((item) => [item.id, item.modificationTime]));
  // A folder mtime.json doesn't name, and a count that disagrees: the first listing runs at once.
  await writeItem(libraryPath, { id: "P", name: "first", modificationTime: 700 });
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ ...times, all: ITEMS.length + 1 }));
  assert.deepEqual(names(await backend.listItems()), ["first", "banana", "cat photo", "apple"]);
  // Another one soon after waits for the interval, even though mtime.json changes again.
  await writeItem(libraryPath, { id: "Q", name: "second", modificationTime: 800 });
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ ...times, B: 301, all: ITEMS.length + 2 }));
  assert.deepEqual(names(await backend.listItems()), ["first", "banana", "cat photo", "apple"]);
});

test("an item added while another is deleted, announced before its folder arrives, still shows up", async () => {
  const libraryPath = await createLibrary();
  const backend = createFsBackend({ libraryPath, refreshIntervalMs: 0, refreshWaitMs: 5000, rescanIntervalMs: 0, recheckIntervalMs: 0 });
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);
  const times = Object.fromEntries(ITEMS.map((item) => [item.id, item.modificationTime]));

  // A sync deletes apple and adds N. mtime.json arrives first; Eagle's count stays the same.
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify({ ...times, A: 101, N: 700, all: ITEMS.length }));
  assert.deepEqual(names(await backend.listItems()), ["banana", "cat photo", "apple"]);

  // Then apple's folder goes and N's arrives; mtime.json doesn't change again.
  await rm(join(libraryPath, "images", "A.info"), { recursive: true });
  await writeItem(libraryPath, { id: "N", name: "late", modificationTime: 700 });
  assert.deepEqual(names(await backend.listItems()), ["late", "banana", "cat photo"]);
});
