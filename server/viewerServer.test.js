import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createViewerServer, sha256 } from "./viewerServer.js";

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
  });

  await viewer.stop();
  assert.equal(viewer.status().state, "stopped");
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
  assert.match(denied.headers.get("www-authenticate"), /Basic/);

  const allowed = await fetch(rootUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from("eagle:secret").toString("base64")}`,
    },
  });
  assert.equal(allowed.status, 200);

  await viewer.stop();
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
      async itemById(id) {
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
      async itemById(id) {
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
