import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createViewerServer, resolveDefaultPublicDir, sha256 } from "./viewerServer.js";

type ItemListOptions = { keywords?: string; tags?: string[] };
type TagListOptions = { query?: string; limit?: string };

test("createViewerServer starts and stops without the CLI entrypoint", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    viewerPassword: "",
  });

  assert.equal(viewer.status().state, "stopped");

  await viewer.start();
  const status = viewer.status();

  assert.equal(status.state, "running");
  assert.equal(status.host, "127.0.0.1");
  assert.ok(status.port > 0);

  const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    required: false,
    authenticated: true,
    user: null,
    permissions: {
      manageLibrary: false,
      read: true,
      writeMetadata: false,
      writeRating: false,
    },
  });

  await viewer.stop();
  assert.equal(viewer.status().state, "stopped");
});

test("createViewerServer blocks metadata writes unless editing is enabled for an authenticated viewer", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async updateItemStar(id: string, star: unknown) {
        calls.push({ id, star });
        return { id, star };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("eagle:secret").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ star: 4 }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer allows metadata writes when editing is enabled for an authenticated viewer", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    allowMetadataEditing: true,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async updateItemMetadata(id: string, input: unknown) {
        calls.push({ id, input });
        return { id, tags: ["cat"], folders: ["folder-1"] };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const authHeader = `Basic ${Buffer.from("eagle:secret").toString("base64")}`;
    const authStatus = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Authorization: authHeader },
    });
    assert.deepEqual(await authStatus.json(), {
      required: true,
      authenticated: true,
      user: {
        role: "editor",
        username: "eagle",
      },
      permissions: {
        manageLibrary: false,
        read: true,
        writeMetadata: true,
        writeRating: true,
      },
    });

    const response = await fetch(`http://127.0.0.1:${status.port}/api/items/ITEM123/metadata`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags: ["cat"], folders: ["folder-1"] }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: "ITEM123",
      tags: ["cat"],
      folders: ["folder-1"],
    });
    assert.deepEqual(calls, [{ id: "ITEM123", input: { tags: ["cat"], folders: ["folder-1"] } }]);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer authorizes metadata writes by user role", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "reader", passwordHash: sha256("read"), role: "viewer" },
      { username: "ed", passwordHash: sha256("edit"), role: "editor" },
    ],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async updateItemStar(id: string, star: unknown) {
        calls.push({ id, star });
        return { id, star };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const reader = `Basic ${Buffer.from("reader:read").toString("base64")}`;
    const editor = `Basic ${Buffer.from("ed:edit").toString("base64")}`;

    const readerStatus = await fetch(`${origin}/api/auth/status`, {
      headers: { Authorization: reader },
    });
    assert.deepEqual(await readerStatus.json(), {
      required: true,
      authenticated: true,
      user: { username: "reader", role: "viewer" },
      permissions: {
        manageLibrary: false,
        read: true,
        writeMetadata: false,
        writeRating: false,
      },
    });

    const denied = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Authorization: reader,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 4 }),
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Authorization: editor,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 4 }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(calls, [{ id: "ITEM123", star: 4 }]);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer rejects cross-origin metadata writes before reaching Eagle", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    allowMetadataEditing: true,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async updateItemStar(id: string, star: unknown) {
        calls.push({ id, star });
        return { id, star };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("eagle:secret").toString("base64")}`,
        "Content-Type": "application/json",
        Origin: "http://evil.example",
      },
      body: JSON.stringify({ star: 4 }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Cross-origin writes are not allowed" });
    assert.deepEqual(calls, []);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer accepts same-origin metadata writes", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    allowMetadataEditing: true,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async updateItemStar(id: string, star: unknown) {
        calls.push({ id, star });
        return { id, star };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const response = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("eagle:secret").toString("base64")}`,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 4 }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ id: "ITEM123", star: 4 }]);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer logs out cookie sessions", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username: "eagle", password: "secret" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie") || "";
    assert.match(cookie, /viewer_session=/);

    const authenticated = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await authenticated.json(), {
      required: true,
      authenticated: true,
      user: {
        role: "viewer",
        username: "eagle",
      },
      permissions: {
        manageLibrary: false,
        read: true,
        writeMetadata: false,
        writeRating: false,
      },
    });

    const logout = await fetch(`${origin}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
      },
    });
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { authenticated: false });
    assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);

    const afterLogout = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await afterLogout.json(), {
      required: true,
      authenticated: false,
      user: null,
      permissions: {
        manageLibrary: false,
        read: false,
        writeMetadata: false,
        writeRating: false,
      },
    });
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer returns 400 for invalid JSON request bodies", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid JSON body" });
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer returns 413 for oversized JSON request bodies", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: "Request body is too large" });
  } finally {
    await viewer.stop();
  }
});

test("resolveDefaultPublicDir prefers Vite output when running from source", () => {
  const existingDist = (path: string) => path === "/repo/dist/public";
  assert.equal(resolveDefaultPublicDir("/repo/plugin/service", existingDist), "/repo/dist/public");
  assert.equal(resolveDefaultPublicDir("/repo/dist/plugin/service", existingDist), "/repo/dist/public");
  assert.equal(resolveDefaultPublicDir("/repo/plugin/service", () => false), "/repo/public");
});

test("createViewerServer reports a port conflict as an error state", async () => {
  const first = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    viewerPassword: "",
  });
  await first.start();

  const conflict = createViewerServer({
    host: "127.0.0.1",
    port: first.status().port,
    viewerPassword: "",
  });

  await assert.rejects(() => conflict.start(), /EADDRINUSE|already in use/);
  assert.equal(conflict.status().state, "error");

  await first.stop();
});

test("createViewerServer protects static viewer with BasicAuth when password hash is set", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
  });

  await viewer.start();
  const status = viewer.status();
  const rootUrl = `http://127.0.0.1:${status.port}/`;

  const denied = await fetch(rootUrl);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate") || "", /Basic/);

  const allowed = await fetch(rootUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from("eagle:secret").toString("base64")}`,
    },
  });
  assert.equal(allowed.status, 200);

  await viewer.stop();
});

test("createViewerServer restricts library switching to admins", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "reader", passwordHash: sha256("read"), role: "viewer" },
      { username: "owner", passwordHash: sha256("own"), role: "admin" },
    ],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: calls.length ? "/tmp/B.library" : "/tmp/A.library", name: "Test Library" };
      },
      async switchLibrary(libraryPath: string) {
        calls.push(libraryPath);
        return {};
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const reader = `Basic ${Buffer.from("reader:read").toString("base64")}`;
    const admin = `Basic ${Buffer.from("owner:own").toString("base64")}`;

    const denied = await fetch(`${origin}/api/library/switch`, {
      method: "POST",
      headers: {
        Authorization: reader,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ libraryPath: "/tmp/B.library" }),
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "Admin permission is required" });

    const allowed = await fetch(`${origin}/api/library/switch`, {
      method: "POST",
      headers: {
        Authorization: admin,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ libraryPath: "/tmp/B.library" }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(calls, ["/tmp/B.library"]);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer serves direct file routes from /file/:id", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "asset.jpg");
  await writeFile(filePath, "demo-file");

  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: root, name: "Test Library" };
      },
      async itemById(id: string) {
        return {
          data: [{ id, filePath }],
        };
      },
    },
  });

  await viewer.start();
  const status = viewer.status();
  const response = await fetch(`http://127.0.0.1:${status.port}/file/ITEM123`);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "demo-file");

  await viewer.stop();
});

test("createViewerServer serves text and markdown direct file routes inline as raw text", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-text-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "notes.md");
  await writeFile(filePath, "# demo\n\nplain markdown");

  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: root, name: "Test Library" };
      },
      async itemById(id: string) {
        return {
          data: [{ id, filePath }],
        };
      },
    },
  });

  await viewer.start();
  const status = viewer.status();
  const response = await fetch(`http://127.0.0.1:${status.port}/file/TEXT123`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(await response.text(), "# demo\n\nplain markdown");

  await viewer.stop();
});

test("createViewerServer uses Eagle item extension as a PDF MIME fallback", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-pdf-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "original");
  await writeFile(filePath, "%PDF-1.1\n%%EOF\n");

  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: root, name: "Test Library" };
      },
      async itemById(id: string) {
        return {
          data: [{ id, filePath, name: "sample", ext: "pdf" }],
        };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/file/PDF123/sample.pdf`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition") || "", /^inline;/);
    assert.match(response.headers.get("content-disposition") || "", /filename="sample\.pdf"/);
    assert.equal(await response.text(), "%PDF-1.1\n%%EOF\n");
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer forwards repeated tag filters to item listing", async () => {
  const calls: ItemListOptions[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    viewerPassword: "",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async listItems(options: ItemListOptions) {
        calls.push(options);
        return { items: [], total: 0, offset: 0, limit: 30 };
      },
      async searchItems() {
        throw new Error("searchItems should not be used when tag filters are present");
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items?q=cat&tags=photo&tags=favorite`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], total: 0, offset: 0, limit: 30 });
    assert.deepEqual(calls[0].tags, ["photo", "favorite"]);
    assert.equal(calls[0].keywords, "cat");
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer serves tag autocomplete suggestions", async () => {
  const calls: TagListOptions[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    viewerPassword: "",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async listTags(options: TagListOptions) {
        calls.push(options);
        return { items: [{ name: "photo", count: 12 }], total: 1, offset: 0, limit: 20 };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/tags?q=pho&limit=20`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      items: [{ name: "photo", count: 12 }],
      total: 1,
      offset: 0,
      limit: 20,
    });
    assert.deepEqual(calls[0], { query: "pho", limit: "20" });
  } finally {
    await viewer.stop();
  }
});
