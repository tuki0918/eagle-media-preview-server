import { test } from "vitest";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
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
    assert.deepEqual(page, { ids: ["C3"], total: 3 });
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

test("library index build can be cancelled, dropping what it read, and starts over on the next request", async () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: `I${String(i).padStart(4, "0")}`, name: `item ${i}` }));
  const libraryPath = await createLibrary(items);
  try {
    const index = createLibraryIndex(libraryPath, { concurrency: 1 });
    assert.equal(await index.whenReady(0), false);
    assert.equal(index.status, "building");
    assert.equal(index.cancel(), true);
    assert.equal(index.status, "idle");
    assert.deepEqual(index.progress(), { loaded: 0, total: 0 });
    assert.equal(index.cancel(), false);
    // Reads still in flight from the cancelled build must not leak into the next one.
    assert.equal(await index.whenReady(5000), true);
    assert.equal((await index.query({}, parseIndexSort("name", ""), 0, 1000)).total, 200);
    assert.equal(index.cancel(), false);
  } finally {
    await rm(libraryPath, { recursive: true, force: true });
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
    assert.deepEqual(await index.query({}, sort, 0, 10), { ids: [], total: 0 });
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
