import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";

type RequestCall = { url: string; init: { method?: string; body: string } };

const require = createRequire(import.meta.url);
const {
  clampLimit,
  createEagleClient,
  normalizePaginatedResponse,
  pathFromFileValue,
  resolveLibraryItemFile,
} = require("../dist/.generated/plugin-service/eagleClient.cjs");

test("clampLimit keeps page sizes bounded for large libraries", () => {
  assert.equal(clampLimit(0), 60);
  assert.equal(clampLimit(10), 30);
  assert.equal(clampLimit(30), 30);
  assert.equal(clampLimit(120), 120);
  assert.equal(clampLimit(5000), 1000);
});

test("listItems uses V2 item/get with limited fields and offset", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://eagle.local:41595",
    token: "secret-token",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { data: [{ id: "abc" }], total: 200000, offset: 120, limit: 60 },
      });
    },
  });

  const result = await client.listItems({ offset: 120, limit: 60, ext: "jpg", rating: "4", keywords: "cat" });

  assert.equal(result.total, 200000);
  assert.equal(result.items[0].id, "abc");
  assert.equal(calls[0].url, "http://eagle.local:41595/api/v2/item/get?token=secret-token");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    offset: 120,
    limit: 60,
    ext: "jpg",
    rating: 4,
    keywords: ["cat"],
    fields: [
      "id",
      "name",
      "ext",
      "width",
      "height",
      "size",
      "duration",
      "star",
      "tags",
      "folders",
      "annotation",
      "url",
      "importedAt",
      "importTime",
      "importedTime",
      "createdAt",
      "createdTime",
      "creationTime",
      "birthTime",
      "btime",
      "modifiedAt",
      "modificationTime",
      "mtime",
      "lastModified",
      "noThumbnail",
      "noPreview",
      "fileURL",
      "thumbnailURL",
      "filePath",
      "thumbnailPath",
    ],
  });
});

test("listItems omits rating when the filter is not specified", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://eagle.local:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { data: [], total: 0, offset: 0, limit: 60 },
      });
    },
  });

  await client.listItems({ rating: null });

  assert.equal(Object.hasOwn(JSON.parse(calls[0].init.body), "rating"), false);
});

test("listItems sends multiple tag filters with keywords", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://eagle.local:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { data: [], total: 0, offset: 0, limit: 60 },
      });
    },
  });

  await client.listItems({ keywords: "cat", tags: ["photo", "favorite"] });

  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.keywords, ["cat"]);
  assert.deepEqual(body.tags, ["photo", "favorite"]);
});

test("listItems supports uncategorized filtering without folder ids", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://eagle.local:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { data: [], total: 0, offset: 0, limit: 60 },
      });
    },
  });

  await client.listItems({ folderId: "__uncategorized__", isUnfiled: true });

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    offset: 0,
    limit: 30,
    isUnfiled: true,
    fields: [
      "id",
      "name",
      "ext",
      "width",
      "height",
      "size",
      "duration",
      "star",
      "tags",
      "folders",
      "annotation",
      "url",
      "importedAt",
      "importTime",
      "importedTime",
      "createdAt",
      "createdTime",
      "creationTime",
      "birthTime",
      "btime",
      "modifiedAt",
      "modificationTime",
      "mtime",
      "lastModified",
      "noThumbnail",
      "noPreview",
      "fileURL",
      "thumbnailURL",
      "filePath",
      "thumbnailPath",
    ],
  });
});

test("searchItems uses V2 item/query", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { data: [], total: 0, offset: 0, limit: 50 },
      });
    },
  });

  await client.searchItems({ query: "cat OR dog", offset: 0, limit: 50 });

  assert.equal(calls[0].url, "http://localhost:41595/api/v2/item/query");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    query: "cat OR dog",
    offset: 0,
    limit: 50,
  });
});

test("listTags uses V2 tag/get with a bounded name query", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { data: [{ name: "photo", count: 12 }], total: 1, offset: 0, limit: 20 },
      });
    },
  });

  const result = await client.listTags({ query: " pho ", limit: 20 });

  assert.deepEqual(result.items, [{ name: "photo", count: 12 }]);
  assert.equal(result.total, 1);
  assert.equal(calls[0].url, "http://localhost:41595/api/v2/tag/get?name=pho&offset=0&limit=20");
  assert.equal(calls[0].init.method, "GET");
});

test("libraryHistory uses the legacy library history endpoint", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({ status: "success", data: ["/Users/me/A.library"] });
    },
  });

  const result = await client.libraryHistory();

  assert.deepEqual(result, ["/Users/me/A.library"]);
  assert.equal(calls[0].url, "http://localhost:41595/api/library/history");
});

test("switchLibrary uses the legacy library switch endpoint", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({ status: "success", data: {} });
    },
  });

  await client.switchLibrary("/Users/me/B.library");

  assert.equal(calls[0].url, "http://localhost:41595/api/library/switch");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { libraryPath: "/Users/me/B.library" });
});

test("updateItemStar uses V2 item/update with a 0-5 star value", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { id: "abc", star: 4 },
      });
    },
  });

  const result = await client.updateItemStar("abc", 4);

  assert.equal(result.star, 4);
  assert.equal(calls[0].url, "http://localhost:41595/api/v2/item/update");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: "abc", star: 4 });
});

test("updateItemStar rejects values outside 0-5", async () => {
  const client = createEagleClient();
  await assert.rejects(() => client.updateItemStar("abc", 6), /0-5/);
  await assert.rejects(() => client.updateItemStar("abc", 2.5), /0-5/);
  await assert.rejects(() => client.updateItemStar("abc", "4x"), /0-5/);
});

test("updateItemMetadata uses V2 item/update with tags and folders", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { id: "abc", tags: ["cat"], folders: ["folder-1"] },
      });
    },
  });

  const result = await client.updateItemMetadata("abc", {
    tags: ["cat", " cat ", ""],
    folders: ["folder-1"],
  });

  assert.deepEqual(result.tags, ["cat"]);
  assert.equal(calls[0].url, "http://localhost:41595/api/v2/item/update");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    id: "abc",
    tags: ["cat"],
    folders: ["folder-1"],
  });
});

test("updateItemTrash uses V2 item/update with isDeleted", async () => {
  const calls: RequestCall[] = [];
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async (url: string, init: { method?: string; body: string }) => {
      calls.push({ url, init });
      return jsonResponse({
        status: "success",
        data: { id: "abc", isDeleted: true },
      });
    },
  });

  const result = await client.updateItemTrash("abc", true);

  assert.equal(result.isDeleted, true);
  assert.equal(calls[0].url, "http://localhost:41595/api/v2/item/update");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: "abc", isDeleted: true });
});

test("updateItemTrash rejects non-boolean values", async () => {
  const client = createEagleClient();
  await assert.rejects(() => client.updateItemTrash("abc", "true"), /isDeleted/);
});

test("client surfaces Eagle HTTP error messages", async () => {
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    token: "bad-token",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async text() {
        return JSON.stringify({
          status: "error",
          message: "Unauthorized: Access is denied due to invalid token.",
        });
      },
    }),
  });

  await assert.rejects(
    () => client.appInfo(),
    /Unauthorized: Access is denied due to invalid token/,
  );
});

test("client includes non-json Eagle HTTP error bodies", async () => {
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async () => ({
      ok: false,
      status: 502,
      async text() {
        return "<html><body>Bad Gateway</body></html>";
      },
    }),
  });

  await assert.rejects(
    () => client.appInfo(),
    /Eagle HTTP 502: <html><body>Bad Gateway<\/body><\/html>/,
  );
});

test("client reports empty Eagle HTTP error bodies with status", async () => {
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      async text() {
        return "";
      },
    }),
  });

  await assert.rejects(() => client.appInfo(), /Eagle HTTP 500/);
});

test("client reports invalid JSON from successful Eagle responses", async () => {
  const client = createEagleClient({
    baseUrl: "http://localhost:41595",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return "<html><body>Eagle is starting</body></html>";
      },
    }),
  });

  await assert.rejects(
    () => client.appInfo(),
    /Invalid JSON from Eagle HTTP 200: <html><body>Eagle is starting<\/body><\/html>/,
  );
});

test("normalizePaginatedResponse rejects Eagle errors", () => {
  assert.throws(
    () => normalizePaginatedResponse({ status: "error", message: "Eagle is closed" }),
    /Eagle is closed/,
  );
});

test("pathFromFileValue decodes Eagle URL-encoded filesystem paths", () => {
  assert.equal(
    pathFromFileValue("/Users/me/SPACE.library/images/abc.info/Group%2013.svg"),
    "/Users/me/SPACE.library/images/abc.info/Group 13.svg",
  );
});

test("resolveLibraryItemFile finds the original file inside an Eagle item folder", async () => {
  const libraryPath = await mkdtemp(join(tmpdir(), "eagle-library-"));
  const itemDir = join(libraryPath, "images", "ITEM123.info");
  await mkdir(itemDir, { recursive: true });
  await writeFile(join(itemDir, "metadata.json"), "{}");
  await writeFile(join(itemDir, "sample_thumbnail.png"), "thumb");
  await writeFile(join(itemDir, "sample.avi"), "video");

  assert.equal(
    await resolveLibraryItemFile({
      libraryPath,
      item: { id: "ITEM123", name: "sample", ext: "avi" },
      kind: "file",
    }),
    join(itemDir, "sample.avi"),
  );
  assert.equal(
    await resolveLibraryItemFile({
      libraryPath,
      item: { id: "ITEM123", name: "sample", ext: "avi" },
      kind: "thumb",
    }),
    join(itemDir, "sample_thumbnail.png"),
  );
});

test("resolveLibraryItemFile accepts item extensions with a leading dot", async () => {
  const libraryPath = await mkdtemp(join(tmpdir(), "eagle-library-dot-ext-"));
  const itemDir = join(libraryPath, "images", "ITEM123.info");
  await mkdir(itemDir, { recursive: true });
  await writeFile(join(itemDir, "sample.jpg"), "image");

  assert.equal(
    await resolveLibraryItemFile({
      libraryPath,
      item: { id: "ITEM123", name: "sample", ext: ".jpg" },
      kind: "file",
    }),
    join(itemDir, "sample.jpg"),
  );
});

test("resolveLibraryItemFile rejects item ids that escape the library image folder", async () => {
  const libraryPath = await mkdtemp(join(tmpdir(), "eagle-library-escape-"));
  const escapedDir = join(libraryPath, "ESCAPED.info");
  await mkdir(escapedDir, { recursive: true });
  await writeFile(join(escapedDir, "secret.jpg"), "secret");

  assert.equal(
    await resolveLibraryItemFile({
      libraryPath,
      item: { id: "../ESCAPED", ext: "jpg" },
      kind: "file",
    }),
    "",
  );
  assert.equal(
    await resolveLibraryItemFile({
      libraryPath,
      item: { id: "nested/ITEM123", ext: "jpg" },
      kind: "file",
    }),
    "",
  );
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    },
  };
}
