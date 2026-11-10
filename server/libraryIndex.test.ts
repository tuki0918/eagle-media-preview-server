import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
