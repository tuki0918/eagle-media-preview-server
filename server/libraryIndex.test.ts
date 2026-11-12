import { test } from "vitest";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const { createLibraryIndex, createLibraryIndexManager, parseIndexSort } = require("../dist/.generated/plugin-service/libraryIndex.cjs");

interface TestItem {
  id: string;
  name: string;
  ext?: string;
  size?: number;
  width?: number;
  height?: number;
  star?: number;
  tags?: string[];
  folders?: string[];
  isDeleted?: boolean;
  btime?: number;
  modificationTime?: number;
  lastModified?: number;
}

async function writeItem(libraryPath: string, item: TestItem) {
  const dir = join(libraryPath, "images", `${item.id}.info`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "metadata.json"), JSON.stringify({ ext: "png", tags: [], folders: [], isDeleted: false, lastModified: 1, ...item }));
}

async function writeMtime(libraryPath: string, values: Record<string, number>) {
  await writeFile(join(libraryPath, "mtime.json"), JSON.stringify(values));
}

async function createLibrary(items: TestItem[]) {
  const libraryPath = await mkdtemp(join(tmpdir(), "index-test-"));
  await mkdir(join(libraryPath, "images"));
  for (const item of items) await writeItem(libraryPath, item);
  await writeMtime(libraryPath, Object.fromEntries(items.map((item) => [item.id, item.lastModified ?? 1])));
  return libraryPath;
}

const sampleItems: TestItem[] = [
  { id: "A1", name: "img10", size: 300, width: 10, height: 10, star: 5, tags: ["cat", "cute"], folders: ["F1"], modificationTime: 3 },
  { id: "B2", name: "img2", ext: "jpg", size: 100, width: 50, height: 50, star: 0, tags: ["cat"], folders: [], modificationTime: 1 },
  { id: "C3", name: "Photo", size: 200, width: 20, height: 20, star: 3, tags: [], folders: ["F1"], modificationTime: 2 },
  { id: "D4", name: "trashed", size: 999, star: 5, isDeleted: true, modificationTime: 4 },
];

async function readyIndex(libraryPath: string, options = {}) {
  const index = createLibraryIndex(libraryPath, { refreshIntervalMs: 0, rescanIntervalMs: 0, ...options });
  assert.equal(await index.whenReady(5000), true);
  return index;
}

test("parseIndexSort accepts known keys and falls back to each key's Eagle direction", () => {
  assert.deepEqual(parseIndexSort("name", ""), { key: "name", order: "asc" });
  assert.deepEqual(parseIndexSort("IMPORT", "asc"), { key: "import", order: "asc" });
  assert.deepEqual(parseIndexSort("filesize", "sideways"), { key: "filesize", order: "asc" });
  assert.equal(parseIndexSort("bogus", "asc"), null);
  assert.equal(parseIndexSort("", ""), null);
});

test("library index sorts like Eagle and leaves trashed items out", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath);
    const ids = async (sort: string, order = "") => (await index.query({}, parseIndexSort(sort, order), 0, 10)).ids;
    assert.deepEqual(await ids("import"), ["A1", "C3", "B2"]);
    assert.deepEqual(await ids("import", "asc"), ["B2", "C3", "A1"]);
    // Numeric, case-insensitive names: img2 before img10.
    assert.deepEqual(await ids("name"), ["img2", "img10", "Photo"].map((name) => sampleItems.find((item) => item.name === name)!.id));
    assert.deepEqual(await ids("filesize", "desc"), ["A1", "C3", "B2"]);
    assert.deepEqual(await ids("resolution"), ["A1", "C3", "B2"]);
    const page = await index.query({}, parseIndexSort("filesize", "asc"), 1, 1);
    assert.deepEqual(page, { complete: true, ids: ["C3"], total: 3 });
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index filters with Eagle's item/get semantics", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("import", "");
    const ids = async (filter: object) => (await index.query(filter, sort, 0, 10)).ids;
    assert.deepEqual(await ids({ folderId: "F1" }), ["A1", "C3"]);
    assert.deepEqual(await ids({ isUnfiled: true }), ["B2"]);
    assert.deepEqual(await ids({ isUntagged: true }), ["C3"]);
    assert.deepEqual(await ids({ ext: "JPG" }), ["B2"]);
    // 0 means "no rating"; several ratings match any of them.
    assert.deepEqual(await ids({ ratings: [5, 0] }), ["A1", "B2"]);
    // Every tag must be present.
    assert.deepEqual(await ids({ tags: ["cat", "cute"] }), ["A1"]);
    assert.deepEqual(await ids({ keywords: "IMG" }), ["A1", "B2"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index counts the extensions in a folder, leaving trashed items out", async () => {
  const libraryPath = await createLibrary([...sampleItems, { id: "E5", name: "clip", ext: "MP4", folders: ["F1"] }]);
  try {
    const index = await readyIndex(libraryPath);
    assert.deepEqual(await index.extensionCounts({}), [{ ext: "jpg", count: 1 }, { ext: "mp4", count: 1 }, { ext: "png", count: 2 }]);
    assert.deepEqual(await index.extensionCounts({ folderId: "F1" }), [{ ext: "mp4", count: 1 }, { ext: "png", count: 2 }]);
    assert.deepEqual(await index.extensionCounts({ isUnfiled: true }), [{ ext: "jpg", count: 1 }]);
    assert.deepEqual(await index.extensionCounts({ isUntagged: true }), [{ ext: "mp4", count: 1 }, { ext: "png", count: 1 }]);
    // A confirmed edit shows in the next count.
    index.noteItem({ id: "B2", isDeleted: true });
    assert.deepEqual(await index.extensionCounts({}), [{ ext: "mp4", count: 1 }, { ext: "png", count: 2 }]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index reports whether it covers every item", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const metadataPath = join(libraryPath, "images", "B2.info", "metadata.json");
    const metadata = await readFile(metadataPath, "utf8");
    await rm(metadataPath);
    const index = await readyIndex(libraryPath);
    assert.equal(index.coversAllItems(), false);
    // Once the metadata is back, the next check reads it.
    await writeFile(metadataPath, metadata);
    await index.extensionCounts({});
    assert.equal(index.coversAllItems(), true);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index does not cover every item while Eagle counts more items than are on disk", async () => {
  const items: TestItem[] = [{ id: "K1", name: "one", ext: "jpg" }];
  const libraryPath = await createLibrary(items);
  try {
    // Eagle counts K2 too, but its folder hasn't synced yet.
    await writeMtime(libraryPath, { K1: 1, K2: 1, all: 2 });
    const index = await readyIndex(libraryPath);
    await index.extensionCounts({});
    assert.equal(index.coversAllItems(), false);
    // It still doesn't after the folder is listed again with K2 still missing.
    await index.extensionCounts({});
    assert.equal(index.coversAllItems(), false);

    // The folder arrives without mtime.json changing; the next rescan still picks it up.
    await writeItem(libraryPath, { id: "K2", name: "two", ext: "png" });
    assert.deepEqual(await index.extensionCounts({}), [{ ext: "jpg", count: 1 }, { ext: "png", count: 1 }]);
    assert.equal(index.coversAllItems(), true);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index trims extensions like Eagle's scan, for counts and the type filter alike", async () => {
  const libraryPath = await createLibrary([{ id: "T1", name: "spaced", ext: " JPG " }, { id: "T2", name: "plain", ext: "jpg" }]);
  try {
    const index = await readyIndex(libraryPath);
    assert.deepEqual(await index.extensionCounts({}), [{ ext: "jpg", count: 2 }]);
    assert.equal((await index.query({ ext: "jpg" }, { key: "name", order: "asc" }, 0, 10)).total, 2);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index picks up changes, additions, and permanent deletes through mtime.json", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("filesize", "desc");
    await writeItem(libraryPath, { ...sampleItems[1], size: 1000, lastModified: 2 });
    await writeItem(libraryPath, { id: "E5", name: "new", size: 50, lastModified: 2 });
    await rm(join(libraryPath, "images", "C3.info"), { recursive: true });
    // Eagle keeps a removed id in mtime.json, but its "all" count no longer matches.
    await writeMtime(libraryPath, { A1: 1, B2: 2, C3: 1, D4: 1, E5: 2, all: 4 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["B2", "A1", "E5"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index applies edits Eagle confirmed without waiting for mtime.json", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath, { refreshIntervalMs: 60_000 });
    const sort = parseIndexSort("rating", "desc");
    index.noteItem({ id: "B2", star: 4 });
    index.noteItem({ id: "C3", isDeleted: true });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "B2"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index reports progress until ready and fails on a missing library", async () => {
  const index = createLibraryIndex(join(tmpdir(), "no-such-library-for-index-test"));
  assert.equal(await index.whenReady(1000), false);
  assert.equal(index.status, "failed");
});

test("library index manager replaces the index when the library changes and releases it when idle", async () => {
  const first = await createLibrary(sampleItems);
  const second = await createLibrary(sampleItems.slice(0, 1));
  try {
    const manager = createLibraryIndexManager({ idleMs: 50 });
    const firstIndex = manager.forLibrary(first);
    assert.equal(manager.forLibrary(`${first}/`), firstIndex);
    const secondIndex = manager.forLibrary(second);
    assert.notEqual(secondIndex, firstIndex);
    assert.equal(await secondIndex.whenReady(5000), true);
    assert.equal((await secondIndex.query({}, parseIndexSort("name", ""), 0, 10)).total, 1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(manager.loaded(), null);
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test("library index checks mtime.json at most once per refresh interval, unless marked stale", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath, { refreshIntervalMs: 60_000 });
    const sort = parseIndexSort("filesize", "desc");
    await writeItem(libraryPath, { ...sampleItems[1], size: 5000, lastModified: 2 });
    await writeMtime(libraryPath, { A1: 1, B2: 2, C3: 1, D4: 1 });
    // Within the interval the old order stays.
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    index.markStale();
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["B2", "A1", "C3"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index keeps the last good data when Eagle is still writing a file", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("filesize", "desc");
    // A half-written mtime.json changes nothing and is read again next time.
    await writeFile(join(libraryPath, "mtime.json"), "{\"A1\":");
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    // A half-written metadata.json keeps the item as it was.
    await writeFile(join(libraryPath, "images", "B2.info", "metadata.json"), "{\"id\":\"B2\",");
    await writeMtime(libraryPath, { A1: 1, B2: 2, C3: 1, D4: 1 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    // Once Eagle finishes, the next change is picked up.
    await writeItem(libraryPath, { ...sampleItems[1], size: 5000, lastModified: 3 });
    await writeMtime(libraryPath, { A1: 1, B2: 3, C3: 1, D4: 1 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["B2", "A1", "C3"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index skips ids Eagle left in mtime.json until their time changes", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("import", "");
    await writeMtime(libraryPath, { A1: 1, B2: 1, C3: 1, D4: 1, GONE1: 5 });
    assert.equal((await index.query({}, sort, 0, 10)).total, 3);
    // The folder appears later without a new time: it is not looked for again on every check.
    await writeItem(libraryPath, { id: "GONE1", name: "late", lastModified: 5, modificationTime: 9 });
    await writeMtime(libraryPath, { A1: 1, B2: 1, C3: 1, D4: 1, GONE1: 5, OTHER: 0 });
    assert.equal((await index.query({}, sort, 0, 10)).total, 3);
    await writeMtime(libraryPath, { A1: 1, B2: 1, C3: 1, D4: 1, GONE1: 6 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["GONE1", "A1", "C3", "B2"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index ignores folders that are not items and metadata for a different id", async () => {
  const libraryPath = await createLibrary(sampleItems.slice(0, 2));
  try {
    await mkdir(join(libraryPath, "images", "notes"), { recursive: true });
    await mkdir(join(libraryPath, "images", "bad id!.info"), { recursive: true });
    await writeFile(join(libraryPath, "images", "bad id!.info", "metadata.json"), JSON.stringify({ id: "bad id!", name: "x" }));
    await mkdir(join(libraryPath, "images", "X9.info"), { recursive: true });
    await writeFile(join(libraryPath, "images", "X9.info", "metadata.json"), JSON.stringify({ id: "OTHER", name: "copied" }));
    const index = await readyIndex(libraryPath);
    assert.deepEqual((await index.query({}, parseIndexSort("name", ""), 0, 10)).ids.sort(), ["A1", "B2"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index reverses the whole list for the other direction, ties included, as Eagle does", async () => {
  const libraryPath = await createLibrary([
    { id: "T1", name: "a", size: 10 },
    { id: "T2", name: "b", size: 10 },
    { id: "T3", name: "c", size: 20 },
    { id: "T4", name: "d", size: 10 },
  ]);
  try {
    const index = await readyIndex(libraryPath);
    const ascending = (await index.query({}, parseIndexSort("filesize", "asc"), 0, 10)).ids;
    const descending = (await index.query({}, parseIndexSort("filesize", "desc"), 0, 10)).ids;
    assert.equal(ascending.at(-1), "T3");
    assert.deepEqual(descending, [...ascending].reverse());
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index applies confirmed tag and folder edits to filters, and ignores unknown items", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    const index = await readyIndex(libraryPath, { refreshIntervalMs: 60_000 });
    const sort = parseIndexSort("import", "");
    index.noteItem({ id: "C3", tags: ["cat"], folders: [] });
    index.noteItem({ id: "B2", star: 9 });
    index.noteItem({ id: "NOPE", star: 5 });
    index.noteItem(null);
    assert.deepEqual((await index.query({ tags: ["cat"] }, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    assert.deepEqual((await index.query({ isUnfiled: true }, sort, 0, 10)).ids, ["C3", "B2"]);
    // Ratings are clamped to 0-5.
    assert.deepEqual((await index.query({ ratings: [5] }, sort, 0, 10)).ids, ["A1", "B2"]);
    assert.equal((await index.query({}, sort, 0, 10)).total, 3);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index retries a failed build only after a pause", async () => {
  const libraryPath = join(tmpdir(), `index-test-late-${process.pid}-${Date.now()}`);
  const realNow = Date.now;
  try {
    const index = createLibraryIndex(libraryPath);
    assert.equal(await index.whenReady(1000), false);
    assert.equal(index.status, "failed");
    // The library appears, but a request right away does not start another build.
    await mkdir(join(libraryPath, "images"), { recursive: true });
    await writeItem(libraryPath, { id: "L1", name: "late" });
    assert.equal(await index.whenReady(200), false);
    assert.equal(index.status, "failed");
    const later = realNow() + 31_000;
    Date.now = () => later;
    assert.equal(await index.whenReady(5000), true);
    assert.equal((await index.query({}, parseIndexSort("name", ""), 0, 10)).total, 1);
  } finally {
    Date.now = realNow;
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index stops a build when disposed", async () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: `D${String(i).padStart(4, "0")}`, name: `item ${i}` }));
  const libraryPath = await createLibrary(items);
  try {
    const index = createLibraryIndex(libraryPath, { concurrency: 1 });
    assert.equal(await index.whenReady(0), false);
    index.dispose();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.notEqual(index.status, "ready");
    assert.ok(index.progress().loaded < 200);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index reads at most readsPerSecond after the first second's worth", async () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `R${String(i).padStart(4, "0")}`, name: `item ${i}` }));
  const libraryPath = await createLibrary(items);
  try {
    // 20 reads right away, then the other 10 at 20 per second: about half a second.
    const started = Date.now();
    const index = createLibraryIndex(libraryPath, { readsPerSecond: 20 });
    assert.equal(await index.whenReady(0), false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(index.status, "building");
    assert.ok(index.progress().loaded >= 20 && index.progress().loaded < 30);
    assert.equal(await index.whenReady(5000), true);
    assert.ok(Date.now() - started >= 400);
    assert.equal((await index.query({}, parseIndexSort("name", ""), 0, 100)).total, 30);
    index.dispose();
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index stops a paced build when disposed", async () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: `P${String(i).padStart(4, "0")}`, name: `item ${i}` }));
  const libraryPath = await createLibrary(items);
  try {
    const index = createLibraryIndex(libraryPath, { readsPerSecond: 10 });
    assert.equal(await index.whenReady(0), false);
    await new Promise((resolve) => setTimeout(resolve, 100));
    index.dispose();
    const loaded = index.progress().loaded;
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.notEqual(index.status, "ready");
    assert.equal(index.progress().loaded, loaded);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

// 30 items read at 20 a second: the build uses up the first second's worth, so an update of all
// 30 then takes about 1.5 s.
async function pacedLibraryWithBulkEdit(prefix: string) {
  const ids = Array.from({ length: 30 }, (_, i) => `${prefix}${String(i).padStart(4, "0")}`);
  const libraryPath = await createLibrary(ids.map((id, i) => ({ id, name: `a${String(i).padStart(2, "0")}` })));
  const index = createLibraryIndex(libraryPath, { readsPerSecond: 20, refreshIntervalMs: 0, refreshWaitMs: 50, rescanIntervalMs: 60_000 });
  assert.equal(await index.whenReady(5000), true);
  // A bulk edit reverses the name order of every item.
  for (const [i, id] of ids.entries()) await writeItem(libraryPath, { id, name: `b${String(29 - i).padStart(2, "0")}`, lastModified: 2 });
  await writeMtime(libraryPath, Object.fromEntries(ids.map((id) => [id, 2])));
  return { ids, index, libraryPath };
}

test("library index answers from what it holds while a large update is still reading", async () => {
  const { ids, index, libraryPath } = await pacedLibraryWithBulkEdit("U");
  try {
    const sort = parseIndexSort("name", "asc");
    const started = Date.now();
    const first = await index.query({}, sort, 0, 1);
    assert.ok(Date.now() - started < 500);
    // Items not read yet keep their old names ("a…"), which sort before the new ones ("b…").
    assert.equal(first.total, 30);
    assert.notDeepEqual(first.ids, [ids[29]]);
    // Not complete while the update is still being read, even though the count still matches; the
    // page says so itself, so an update ending later doesn't make it look complete.
    assert.equal(first.complete, false);
    assert.equal(index.coversAllItems(), false);
    // The update carries on in the background and shows up once done.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.deepEqual(await index.query({}, sort, 0, 1), { complete: true, ids: [ids[29]], total: 30 });
    assert.equal(first.complete, false);
    index.dispose();
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index keeps a query's pages consistent while an update is read, and refreshes them after", async () => {
  const { ids, index, libraryPath } = await pacedLibraryWithBulkEdit("C");
  try {
    const sort = parseIndexSort("name", "asc");
    // The first page is answered while the update is being read; its order is cached.
    const before = await index.query({}, sort, 0, 10);
    assert.equal(index.coversAllItems(), false);
    // Its next page comes from the same order, however much of the update has been read.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const page2 = await index.query({}, sort, 10, 10);
    assert.equal(new Set([...before.ids, ...page2.ids]).size, 20);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.deepEqual((await index.query({}, sort, 0, 1)).ids, [ids[29]]);
    index.dispose();
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

// Records a known limitation of the paced update: with no further change in Eagle, the update
// ending in the background is enough to switch a query's order between two pages.
test("library index switches a query's order between pages when an update ends in the background", async () => {
  const { ids, index, libraryPath } = await pacedLibraryWithBulkEdit("X");
  try {
    const sort = parseIndexSort("name", "asc");
    const page1 = await index.query({}, sort, 0, 10);
    assert.equal(page1.complete, false);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    // Page 2 comes from the new order (b00 = ids[29] first), not from the order page 1 was cut from.
    const page2 = await index.query({}, sort, 10, 10);
    assert.equal(page2.complete, true);
    assert.deepEqual(page2.ids, ids.slice(10, 20).reverse());
    index.dispose();
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index stops an update in progress when disposed and holds nothing afterwards", async () => {
  const { index, libraryPath } = await pacedLibraryWithBulkEdit("S");
  try {
    const sort = parseIndexSort("name", "asc");
    assert.equal((await index.query({}, sort, 0, 1)).total, 30);
    index.dispose();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.equal((await index.query({}, sort, 0, 100)).total, 0);
    assert.deepEqual(await index.extensionCounts({}), []);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index manager release stops a build in progress and a later request starts a new index", async () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: `M${String(i).padStart(4, "0")}`, name: `item ${i}` }));
  const libraryPath = await createLibrary(items);
  try {
    const manager = createLibraryIndexManager({ concurrency: 1 });
    const first = manager.forLibrary(libraryPath);
    assert.equal(await first.whenReady(0), false);
    manager.release();
    assert.equal(manager.loaded(), null);
    const second = manager.forLibrary(libraryPath);
    assert.notEqual(second, first);
    assert.equal(await second.whenReady(5000), true);
    assert.equal((await second.query({}, parseIndexSort("name", ""), 0, 1000)).total, 200);
    manager.release();
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index runs a rescan held back by the interval later, without another mtime.json change", async () => {
  const libraryPath = await createLibrary(sampleItems);
  const realNow = Date.now;
  try {
    const index = await readyIndex(libraryPath, { rescanIntervalMs: 60_000 });
    const sort = parseIndexSort("import", "");
    // C3's folder vanishes (removed outside Eagle); Eagle's count says so, but the build just rescanned.
    await rm(join(libraryPath, "images", "C3.info"), { recursive: true });
    await writeMtime(libraryPath, { A1: 1, B2: 1, C3: 1, D4: 1, all: 3 });
    assert.equal((await index.query({}, sort, 0, 10)).total, 3);
    const later = realNow() + 61_000;
    Date.now = () => later;
    // mtime.json has not changed since, yet the held-back rescan now runs.
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "B2"]);
  } finally {
    Date.now = realNow;
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index retries metadata it couldn't read, even when mtime.json doesn't change", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    // Unreadable during the build: the item is left out at first, not forever.
    await writeFile(join(libraryPath, "images", "C3.info", "metadata.json"), "{\"id\":\"C3\",");
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("filesize", "desc");
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "B2"]);
    await writeItem(libraryPath, sampleItems[2]);
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);

    // Unreadable after a change: the old data stays until the file can be read.
    await writeFile(join(libraryPath, "images", "B2.info", "metadata.json"), "{\"id\":\"B2\",");
    await writeMtime(libraryPath, { A1: 1, B2: 2, C3: 1, D4: 1 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    await writeItem(libraryPath, { ...sampleItems[1], size: 5000, lastModified: 2 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["B2", "A1", "C3"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index keeps an item whose metadata.json is missing for a while but whose folder is still there", async () => {
  const libraryPath = await createLibrary(sampleItems);
  try {
    // During the build, C3's folder exists but its metadata.json hasn't synced yet.
    await rm(join(libraryPath, "images", "C3.info", "metadata.json"));
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("filesize", "desc");
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "B2"]);
    await writeItem(libraryPath, sampleItems[2]);
    // mtime.json is unchanged, yet C3 comes back.
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);

    // Later, a missing metadata.json in a folder that is still there keeps the item as it was.
    await rm(join(libraryPath, "images", "B2.info", "metadata.json"));
    await writeMtime(libraryPath, { A1: 1, B2: 2, C3: 1, D4: 1 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    // Only a removed folder removes the item.
    await rm(join(libraryPath, "images", "B2.info"), { recursive: true });
    await writeMtime(libraryPath, { A1: 1, B2: 3, C3: 1, D4: 1 });
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3"]);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index tries a held-back rescan again when listing the folder fails", async () => {
  const libraryPath = await createLibrary(sampleItems);
  const realNow = Date.now;
  try {
    const index = await readyIndex(libraryPath, { rescanIntervalMs: 60_000 });
    const sort = parseIndexSort("import", "");
    await rm(join(libraryPath, "images", "C3.info"), { recursive: true });
    await writeMtime(libraryPath, { A1: 1, B2: 1, C3: 1, D4: 1, all: 3 });
    assert.equal((await index.query({}, sort, 0, 10)).total, 3);
    // The images folder can't be listed when the held-back rescan comes due.
    const imagesDir = join(libraryPath, "images");
    const parked = join(libraryPath, "images-away");
    await rename(imagesDir, parked);
    let now = realNow() + 61_000;
    Date.now = () => now;
    await index.query({}, sort, 0, 10);
    // Once the folder is back, the rescan still happens.
    await rename(parked, imagesDir);
    now += 61_000;
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "B2"]);
  } finally {
    Date.now = realNow;
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index treats an item count of 0 as a real count", async () => {
  const libraryPath = await createLibrary([{ id: "ONLY", name: "last item" }]);
  try {
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("name", "");
    assert.equal((await index.query({}, sort, 0, 10)).total, 1);
    await rm(join(libraryPath, "images", "ONLY.info"), { recursive: true });
    await writeMtime(libraryPath, { ONLY: 1, all: 0 });
    assert.deepEqual(await index.query({}, sort, 0, 10), { complete: true, ids: [], total: 0 });
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
  }
});

test("library index shows changes it applied even when a later step of the same check fails", async () => {
  const libraryPath = await createLibrary(sampleItems);
  const imagesDir = join(libraryPath, "images");
  try {
    const index = await readyIndex(libraryPath);
    const sort = parseIndexSort("filesize", "desc");
    // Warm the cached results.
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["A1", "C3", "B2"]);
    // B2 changes, and Eagle's count asks for a rescan, but the folder can't be listed this time
    // (files inside can still be read).
    await writeItem(libraryPath, { ...sampleItems[1], size: 5000, lastModified: 2 });
    await writeMtime(libraryPath, { A1: 1, B2: 2, C3: 1, D4: 1, all: 99 });
    await chmod(imagesDir, 0o311);
    assert.deepEqual((await index.query({}, sort, 0, 10)).ids, ["B2", "A1", "C3"]);
  } finally {
    await chmod(imagesDir, 0o755);
    await rm(libraryPath, { recursive: true, force: true });
  }
});
