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
