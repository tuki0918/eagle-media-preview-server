import { test } from "vitest";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createViewerServer, resolveDefaultPublicDir, sha256 } from "./viewerServer.js";

const require = createRequire(import.meta.url);
const { EagleRequestError } = require("../dist/.generated/plugin-service/eagleClient.cjs");

type ItemListOptions = { folderId?: string; isUntagged?: boolean; keywords?: string; limit?: number | string; offset?: number | string; query?: string; tags?: string[] };
type TagListOptions = { query?: string; limit?: string };

const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUUHUI19IWC5rws+d99s190uGba4owDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDYxNjIyMjcwMVoXDTI2MDYx
NzIyMjcwMVowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAziaVUBHqOe5NcmSG4mnsffKo64ODe9ZoB8l96Al/yld0
tcJoKHTRgwLL67fK+f9LOS3A1Ed7Ur30Jn2j6qdbunvEn33iOD5/ym5Z4m27qTZa
o7BvwE15zIWG0TrRmyX9VkKCxFI+hNPBDzoxWgXL9W9Wct1J6zj8w66w3kVGCwbb
BDJCvQhlCHtr37y0tXrmq/BS+zDKjnrYu74EiIdzLS3vSuIsNRIof7lrAQx/ge3E
QLhNO/uN8rVzQi8kwOqo1IFVr1VaoLEwHBKouWOpSW18p4G6hN5FiReLxefjIQ7E
WbUhMP8+X1jrhJGOiXJxXlEHwRVojOU67sdGg5ts6wIDAQABo1MwUTAdBgNVHQ4E
FgQU1B2TXxhFVbcMuptpEIRezDgKTYEwHwYDVR0jBBgwFoAU1B2TXxhFVbcMuptp
EIRezDgKTYEwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAkcAv
bGai4a9TUY22UBP2OlGiaxHB2OfwU9JYBpbCDLu4kIfzJo3y/ZQUJG94wOhfmCXm
v4kL3f+nhUhZSqQQ2pX5hIBQEnX2slldF2SWEZHzV0zAYzXvJQI6ZVDeoshaenKw
LBo//8P4Ib6P3ZyilhUNGz/z8uP8WtqquSqbybr9qg0zlvhWD08r3LGy6fHXQx16
KOq1XqeW4djw1ChED9pPvHC6gl62XZdZnGdpDFukl1GatYeVuavj/pfTWbD+gxZt
BVFj1qe8tN05Zn00p5TLDj6hT10yHkgqpEwE5yX/oAGWgNQYO6S4ztyb+DRygBNX
YDTPEW/jxGS1PV3FtQ==
-----END CERTIFICATE-----
`;

const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDOJpVQEeo57k1y
ZIbiaex98qjrg4N71mgHyX3oCX/KV3S1wmgodNGDAsvrt8r5/0s5LcDUR3tSvfQm
faPqp1u6e8SffeI4Pn/KblnibbupNlqjsG/ATXnMhYbROtGbJf1WQoLEUj6E08EP
OjFaBcv1b1Zy3UnrOPzDrrDeRUYLBtsEMkK9CGUIe2vfvLS1euar8FL7MMqOeti7
vgSIh3MtLe9K4iw1Eih/uWsBDH+B7cRAuE07+43ytXNCLyTA6qjUgVWvVVqgsTAc
Eqi5Y6lJbXyngbqE3kWJF4vF5+MhDsRZtSEw/z5fWOuEkY6JcnFeUQfBFWiM5Tru
x0aDm2zrAgMBAAECggEAHnozzu+nGkNx7byQ+H5CeWhbst3xnWhYXvZaB+kHnImL
dqe0MG783oqWTVYRyx4EKALspDWhNN1icCJZDoMJm6taqV26CSisSehAn6oreVvQ
0KxwCRUrMaJ4CQzSGkbmik8w+AdUuNx5iV/IFhAPVEzOkhLHL+Bv9hooiePh9BUe
YA8u+IFV1wP/l2Amhq+WKerjkiBJR5b/f/kY1FVuozT5XuQZkvOkNAgeGETeihMo
z5ptBBOvV99BIuQNdar7drx//PB5VBvBf+Mblo/2uUQAFp9MqSgf3nH6prFKCgho
6GSu2TNBSzmJgqfhZ5Xt9aHsf/kAhmNObeYTATwH4QKBgQDxPl6WXh5WcbSc96Rq
lfnjLNbvP1T6pKgnAtkh7gkzo4jA4Poms0KMulE1zJ/wM4mPoZwaK23M30RrMhCw
D+8WSd/PiS6rY7WsMNTE5lLeVJgoCtrPhKR2Ydnf+WazJvJ6g+sFCSym7OzbRkYi
lVbvZ24V6T+Z8t4+1mfgByvk2wKBgQDawrG/Pnyb75WRi6bxZzxmgwIZYfnKQyyG
k4tfpWX+au1S4RUO6W5mHgRbWPdbrf4/RpdVsLQiREeMlyfF/5NcmIeckcft3mP4
gD6C8dvWDCUCUXjUveL12JZkhZBcTdsAfl7v5vsiyEwS4WKyl8f5ZvGvPJgm604Q
YbS+ufiNMQKBgEJ7qruL0paGHX1IrhIFpOkbeVxTusqcSA8ANPCp1fVaMxzco3O4
4TVBP5IxAz7CJT3lDs0TfN4CBav5DypGKeCdmUVri+YFw5JhnrFovBuzen9Ghoi8
CErrqoyUAd6LdDWZV1J69chG8Pt5AWkUePHfMjJtpm55xQ/SLKxLragTAoGANar6
DF76Fw9p9DD8ndCj4spVI4ED1Pkx3TopQSfEo+v7mQ+bKPNfoDHRA9AJrzY6X6+j
xOP67UUvAHC80zhmIJtS+bhSAitC/14G9/z538NO+QifyiFjosil7LdPuTVoevCF
vfk+t0PIVgFxQzs1VhxJQqJs+W9U0XQG8ZuSPKECgYEAn1Tp2jfGYNP3PMIga+x4
Fs7kGfPpF5Hzr7BSX0JyO+yPBx0fa5Wrsucxp2FkDLJ6LwTRdvkY5bM+VT51nlFo
bu1QSNvgUss8oktuc64gskM0g+S1jmDwxsuSHLzdNKNilVy3qqUxpDzR7L8xgndH
j9au/Rn/iKVsbCyRku14oFc=
-----END PRIVATE KEY-----
`;

// Library routes require the id a viewer gets from /api/health or /api/connect. Tests about other
// behavior use this `fetch`, which attaches the id the way the viewer does; tests about the id
// requirement itself call globalThis.fetch directly.
const UNPINNED_PATHS = new Set(["/api/auth/status", "/api/auth/login", "/api/auth/logout", "/api/health", "/api/connect", "/api/library-status"]);

async function fetch(input: string | URL, init: RequestInit = {}) {
  const url = new URL(String(input));
  const headers = new Headers(init.headers);
  const libraryRoute = (url.pathname.startsWith("/api/") && !UNPINNED_PATHS.has(url.pathname)) || url.pathname.startsWith("/file/");
  if (libraryRoute && !headers.has("X-Library-Id") && !url.searchParams.has("library")) {
    const cookie = headers.get("Cookie");
    const health = await globalThis.fetch(`${url.origin}/api/health`, cookie ? { headers: { Cookie: cookie } } : {});
    const libraryId = health.ok ? (await health.json())?.library?.id : "";
    if (libraryId) headers.set("X-Library-Id", libraryId);
  }
  return globalThis.fetch(url, { ...init, headers });
}

// The id the server derives for a library path, for tests that set a fixed session secret.
function libraryIdFor(secret: string, libraryPath: string) {
  const { createHmac } = require("node:crypto");
  const { libraryPathKey } = require("../dist/.generated/plugin-service/libraryAccess.cjs");
  return createHmac("sha256", secret).update(libraryPathKey(libraryPath)).digest("base64url").slice(0, 16);
}

// Media routes require the library id a viewer gets from /api/health or /api/connect.
async function libraryQuery(origin: string) {
  const health = await (await fetch(`${origin}/api/health`)).json();
  return `?library=${encodeURIComponent(health.library.id)}`;
}

async function loginCookie(origin: string, username: string, password: string) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie") || "";
  assert.match(cookie, /viewer_session=/);
  return cookie;
}

async function writeTlsFixture(name: string) {
  const root = join(tmpdir(), `eagle-media-preview-server-tls-${name}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const certPath = join(root, "cert.pem");
  const keyPath = join(root, "key.pem");
  await writeFile(certPath, TEST_TLS_CERT, "utf8");
  await writeFile(keyPath, TEST_TLS_KEY, "utf8");
  return { certPath, keyPath };
}

async function httpsJson(url: string, options: { body?: unknown; headers?: Record<string, string>; method?: string } = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise<{ body: unknown; headers: Record<string, string | string[] | undefined>; status: number }>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: options.method || "GET",
      rejectUnauthorized: false,
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...options.headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          body: text ? JSON.parse(text) : null,
          headers: response.headers,
          status: response.statusCode || 0,
        });
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function assertSecurityHeaders(headers: Headers | Record<string, string | string[] | undefined>) {
  const headerValue = headers instanceof Headers
    ? (name: string) => headers.get(name) || ""
    : (name: string) => {
        const value = headers[name.toLowerCase()];
        return Array.isArray(value) ? value.join(", ") : value || "";
      };
  assert.match(headerValue("content-security-policy"), /default-src 'self'/);
  assert.equal(headerValue("x-content-type-options"), "nosniff");
  assert.equal(headerValue("x-frame-options"), "SAMEORIGIN");
  assert.equal(headerValue("referrer-policy"), "no-referrer");
}

async function httpJson(url: string, options: { body?: unknown; headers?: Record<string, string>; method?: string } = {}) {
  const body = options.body === undefined ? "" : JSON.stringify(options.body);
  return new Promise<{ body: unknown; headers: Record<string, string | string[] | undefined>; status: number }>((resolve, reject) => {
    const request = httpRequest(url, {
      method: options.method || "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        ...options.headers,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          body: text ? JSON.parse(text) : null,
          headers: response.headers,
          status: response.statusCode || 0,
        });
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

test("createViewerServer starts and stops without the CLI entrypoint", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    viewerPassword: "",
    // Library routes check the open library first, so the test must not depend on a running Eagle.
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/A.library", name: "A" };
      },
    },
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
    sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
    user: null,
    permissions: {
      manageLibrary: false,
      read: true,
      writeMetadata: false,
      writeRating: false,
    },
  });

  const origin = `http://127.0.0.1:${status.port}`;
  const invalidStatusMethod = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(invalidStatusMethod.status, 405);
  assert.equal(invalidStatusMethod.headers.get("allow"), "GET");
  assert.deepEqual(await invalidStatusMethod.json(), { error: "Method not allowed" });

  const invalidItemsMethod = await fetch(`http://127.0.0.1:${status.port}/api/items`, {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(invalidItemsMethod.status, 405);
  assert.equal(invalidItemsMethod.headers.get("allow"), "GET");
  assert.deepEqual(await invalidItemsMethod.json(), { error: "Method not allowed" });

  const login = await fetch(`http://127.0.0.1:${status.port}/api/auth/login`, {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), {
    required: false,
    authenticated: true,
    sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
    user: null,
    permissions: {
      manageLibrary: false,
      read: true,
      writeMetadata: false,
      writeRating: false,
    },
  });

  const logout = await fetch(`http://127.0.0.1:${status.port}/api/auth/logout`, {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), {
    required: false,
    authenticated: true,
    sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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

test("createViewerServer exposes smart folders and smart folder items", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    viewerPassword: "",
    eagleClient: {
      async appInfo() {
        return { version: "4.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async smartFolders() {
        calls.push({ method: "smartFolders" });
        return { items: [{ id: "smart-1", name: "Large Images", imageCount: 42 }] };
      },
      async smartFolderItems(options: unknown) {
        calls.push({ method: "smartFolderItems", options });
        return { items: [{ id: "item-1", name: "Hero" }], total: 1 };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const folders = await fetch(`${origin}/api/smart-folders`);
    assert.equal(folders.status, 200);
    assert.deepEqual(await folders.json(), {
      items: [{ id: "smart-1", name: "Large Images", imageCount: 42 }],
    });

    const items = await fetch(`${origin}/api/items?smartFolderId=smart-1&offset=30&limit=60`);
    assert.equal(items.status, 200);
    assert.deepEqual(await items.json(), {
      items: [{ id: "item-1", name: "Hero" }],
      total: 1,
    });
    assert.deepEqual(calls, [
      { method: "smartFolders" },
      { method: "smartFolderItems", options: { smartFolderId: "smart-1", offset: 30, limit: 60 } },
    ]);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer preserves Eagle upstream error status codes", async () => {
  let upstreamStatus = 504;
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/A.library", name: "A" };
      },
      async folders() {
        throw new EagleRequestError(upstreamStatus, upstreamStatus === 504
          ? "Eagle request timed out"
          : "Eagle response was too large");
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const timeoutResponse = await fetch(`${origin}/api/folders`);
    assert.equal(timeoutResponse.status, 504);
    assert.deepEqual(await timeoutResponse.json(), { error: "Eagle request timed out" });

    upstreamStatus = 502;
    const badGatewayResponse = await fetch(`${origin}/api/folders`);
    assert.equal(badGatewayResponse.status, 502);
    assert.deepEqual(await badGatewayResponse.json(), { error: "Eagle response was too large" });
  } finally {
    await viewer.stop();
  }
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
    const origin = `http://127.0.0.1:${status.port}`;
    const cookie = await loginCookie(origin, "eagle", "secret");
    const response = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 4 }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Rating editing is not allowed for this viewer" });
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
        return { id };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const cookie = await loginCookie(origin, "eagle", "secret");
    const authStatus = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await authStatus.json(), {
      required: true,
      authenticated: true,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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

    const response = await fetch(`${origin}/api/items/ITEM123/metadata`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ tags: [" cat ", "cat", ""], folders: ["folder-1", " folder-1 "] }),
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

test("createViewerServer rejects invalid star values before reaching Eagle", async () => {
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
    const cookie = await loginCookie(origin, "eagle", "secret");
    const response = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 6 }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "star must be an integer from 0-5" });
    assert.deepEqual(calls, []);
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
      async updateItemMetadata(id: string, input: unknown) {
        calls.push({ id, input });
        return { id, ...(input as object) };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const readerCookie = await loginCookie(origin, "reader", "read");
    const editorCookie = await loginCookie(origin, "ed", "edit");

    const readerStatus = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: readerCookie },
    });
    assert.deepEqual(await readerStatus.json(), {
      required: true,
      authenticated: true,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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
        Cookie: readerCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 4 }),
    });
    assert.equal(denied.status, 403);

    const deniedMetadata = await fetch(`${origin}/api/items/ITEM123/metadata`, {
      method: "POST",
      headers: {
        Cookie: readerCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ tags: ["cat"], folders: ["folder-1"] }),
    });
    assert.equal(deniedMetadata.status, 403);

    const allowedStar = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: editorCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ star: 4 }),
    });
    assert.equal(allowedStar.status, 200);

    const allowedMetadata = await fetch(`${origin}/api/items/ITEM123/metadata`, {
      method: "POST",
      headers: {
        Cookie: editorCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ tags: ["cat"], folders: ["folder-1"] }),
    });
    assert.equal(allowedMetadata.status, 200);
    assert.deepEqual(calls, [
      { id: "ITEM123", star: 4 },
      { id: "ITEM123", input: { tags: ["cat"], folders: ["folder-1"] } },
    ]);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer allows trash updates only for admins", async () => {
  const calls: unknown[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "ed", passwordHash: sha256("edit"), role: "editor" },
      { username: "admin", passwordHash: sha256("admin"), role: "admin" },
    ],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/tmp/Test.library", name: "Test Library" };
      },
      async updateItemTrash(id: string, isDeleted: boolean) {
        calls.push({ id, isDeleted });
        return { id, isDeleted };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const editorCookie = await loginCookie(origin, "ed", "edit");
    const adminCookie = await loginCookie(origin, "admin", "admin");

    const denied = await fetch(`${origin}/api/items/ITEM123/trash`, {
      method: "POST",
      headers: {
        Cookie: editorCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ isDeleted: true }),
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${origin}/api/items/ITEM123/trash`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ isDeleted: true }),
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { id: "ITEM123", isDeleted: true });
    assert.deepEqual(calls, [{ id: "ITEM123", isDeleted: true }]);
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
    const origin = `http://127.0.0.1:${status.port}`;
    const cookie = await loginCookie(origin, "eagle", "secret");
    const response = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: "http://evil.example",
      },
      body: JSON.stringify({ star: 4 }),
    });

    assert.equal(response.status, 403);
    assertSecurityHeaders(response.headers);
    assert.deepEqual(await response.json(), { error: "Cross-origin writes are not allowed" });
    assert.deepEqual(calls, []);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer rejects unsafe requests from non-localhost hostnames even when Origin matches Host", async () => {
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
    const cookie = await loginCookie(origin, "eagle", "secret");
    const response = await httpJson(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Host: `evil.example:${status.port}`,
        Origin: `http://evil.example:${status.port}`,
      },
      body: { star: 4 },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Cross-origin writes are not allowed" });
    assert.deepEqual(calls, []);
  } finally {
    await viewer.stop();
  }
});

for (const httpsEnabled of [false, true]) {
  test(`custom domains allow same-origin login and writes over ${httpsEnabled ? "HTTPS" : "HTTP"} only for the configured hostname`, async () => {
    const calls: unknown[] = [];
    const tls = httpsEnabled ? await writeTlsFixture("custom-domain") : null;
    const viewer = createViewerServer({
      customDomain: " DUMMY.LOCAL ",
      host: "127.0.0.1",
      port: 0,
      httpsEnabled,
      httpsCertPath: tls?.certPath,
      httpsKeyPath: tls?.keyPath,
      authUsers: [{ username: "editor", role: "editor", passwordHash: sha256("secret") }],
      eagleClient: {
        async appInfo() {
          return { version: "1.0.0" };
        },
        async libraryInfo() {
          return { path: "/tmp/A.library", name: "A" };
        },
        async updateItemStar(id: string, star: number) {
          calls.push({ id, star });
          return { id, star };
        },
      },
    });
    await viewer.start();
    try {
      const { port } = viewer.status();
      const protocol = httpsEnabled ? "https" : "http";
      const endpoint = `${protocol}://127.0.0.1:${port}`;
      const request = httpsEnabled ? httpsJson : httpJson;
      const headers = { Host: `dummy.local:${port}`, Origin: `${protocol}://dummy.local:${port}` };
      const login = await request(`${endpoint}/api/auth/login`, {
        method: "POST", headers, body: { username: "editor", password: "secret" },
      });
      assert.equal(login.status, 200);
      const cookies = login.headers["set-cookie"];
      assert.ok(Array.isArray(cookies));
      const Cookie = cookies.map((cookie) => cookie.split(";")[0]).join("; ");
      const health = await request(`${endpoint}/api/health`, { headers: { ...headers, Cookie } });
      const libraryHeader = { "X-Library-Id": (health.body as { library: { id: string } }).library.id };
      const allowed = await request(`${endpoint}/api/items/ITEM123/star`, {
        method: "POST", headers: { ...headers, Cookie, ...libraryHeader }, body: { star: 4 },
      });
      assert.equal(allowed.status, 200);
      assert.deepEqual(calls, [{ id: "ITEM123", star: 4 }]);

      for (const deniedHeaders of [
        { Host: `other.local:${port}`, Origin: `${protocol}://other.local:${port}` },
        { Host: `sub.dummy.local:${port}`, Origin: `${protocol}://sub.dummy.local:${port}` },
        { Host: `dummy.local.evil.example:${port}`, Origin: `${protocol}://dummy.local.evil.example:${port}` },
        { Host: headers.Host, Origin: `${protocol}://other.local:${port}` },
        { Host: headers.Host, Origin: `${protocol}://dummy.local:${port + 1}` },
        { Host: headers.Host, Origin: `${httpsEnabled ? "http" : "https"}://dummy.local:${port}` },
        { Host: headers.Host, Origin: "" },
        { Host: headers.Host, Origin: "null" },
      ]) {
        for (const route of ["/api/auth/login", "/api/items/ITEM123/star"]) {
          const denied = await request(`${endpoint}${route}`, {
            method: "POST", headers: { ...deniedHeaders, Cookie },
            body: { username: "editor", password: "secret", star: 1 },
          });
          assert.equal(denied.status, 403);
          assert.deepEqual(denied.body, { error: "Cross-origin writes are not allowed" });
        }
      }
      assert.equal(calls.length, 1);
      for (const hostname of ["localhost", "127.0.0.1"]) {
        const localLogin = await request(`${endpoint}/api/auth/login`, {
          method: "POST", body: { username: "editor", password: "secret" },
          headers: { Host: `${hostname}:${port}`, Origin: `${protocol}://${hostname}:${port}` },
        });
        assert.equal(localLogin.status, 200);
      }
    } finally {
      await viewer.stop();
    }
  });
}

test("custom domains require explicit configuration for login", async () => {
  const viewer = createViewerServer({ host: "127.0.0.1", port: 0, viewerPassword: "secret" });
  await viewer.start();
  try {
    const { port } = viewer.status();
    const denied = await httpJson(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST", body: { username: "eagle", password: "secret" },
      headers: { Host: `dummy.local:${port}`, Origin: `http://dummy.local:${port}` },
    });
    assert.equal(denied.status, 403);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer requires Origin for unsafe requests", async () => {
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
    const cookie = await loginCookie(origin, "eagle", "secret");
    const missingOrigin = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ star: 4 }),
    });
    const refererOnly = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Referer: `${origin}/`,
      },
      body: JSON.stringify({ star: 4 }),
    });

    assert.equal(missingOrigin.status, 403);
    assert.deepEqual(await missingOrigin.json(), { error: "Cross-origin writes are not allowed" });
    assert.equal(refererOnly.status, 403);
    assert.deepEqual(await refererOnly.json(), { error: "Cross-origin writes are not allowed" });
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
    const cookie = await loginCookie(origin, "eagle", "secret");
    const response = await fetch(`${origin}/api/items/ITEM123/star`, {
      method: "POST",
      headers: {
        Cookie: cookie,
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
    const missingUsername = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ password: "secret" }),
    });
    assert.equal(missingUsername.status, 401);
    assert.deepEqual(await missingUsername.json(), { error: "Invalid username or password" });

    const wrongPassword = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username: "eagle", password: "wrong" }),
    });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(await wrongPassword.json(), { error: "Invalid username or password" });

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
    assert.match(cookie, /viewer_session_http=/);
    assert.match(cookie, /viewer_session=/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /Secure/);
    const loginBody = await login.json();
    assert.deepEqual(loginBody, {
      required: true,
      authenticated: true,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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

    const authenticated = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await authenticated.json(), {
      required: true,
      authenticated: true,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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

    const sessionToken = cookie.match(/viewer_session_http=([^;]+)/)?.[1] || "";
    assert.ok(sessionToken);
    const bearerIgnored = await fetch(`${origin}/api/auth/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.deepEqual(await bearerIgnored.json(), {
      required: true,
      authenticated: false,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
      user: null,
      permissions: {
        manageLibrary: false,
        read: false,
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
    assert.deepEqual(await logout.json(), {
      required: true,
      authenticated: false,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
      user: null,
      permissions: {
        manageLibrary: false,
        read: false,
        writeMetadata: false,
        writeRating: false,
      },
    });
    assert.match(logout.headers.get("set-cookie") || "", /viewer_session_http=/);
    assert.match(logout.headers.get("set-cookie") || "", /viewer_session=/);
    assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);

    const afterLogout = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await afterLogout.json(), {
      required: true,
      authenticated: false,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
      user: null,
      permissions: {
        manageLibrary: false,
        read: false,
        writeMetadata: false,
        writeRating: false,
      },
    });

    const malformedCookie = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: "viewer_session=%E0%A4%A" },
    });
    assert.equal(malformedCookie.status, 200);
    assert.deepEqual(await malformedCookie.json(), {
      required: true,
      authenticated: false,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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

test("createViewerServer rate-limits repeated failed logins by client and username", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "eagle", passwordHash: sha256("secret"), role: "viewer" },
      { username: "owner", passwordHash: sha256("own"), role: "admin" },
    ],
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${origin}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({ username: "eagle", password: "wrong" }),
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Invalid username or password" });
    }

    const locked = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username: "eagle", password: "wrong" }),
    });
    assert.equal(locked.status, 429);
    assert.match(locked.headers.get("retry-after") || "", /^\d+$/);
    assert.deepEqual(await locked.json(), { error: "Too many failed login attempts. Try again later." });

    const spoofedClient = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Forwarded-For": "203.0.113.10",
      },
      body: JSON.stringify({ username: "eagle", password: "secret" }),
    });
    assert.equal(spoofedClient.status, 429);
    assert.deepEqual(await spoofedClient.json(), { error: "Too many failed login attempts. Try again later." });

    const stillLocked = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username: "eagle", password: "secret" }),
    });
    assert.equal(stillLocked.status, 429);
    assert.deepEqual(await stillLocked.json(), { error: "Too many failed login attempts. Try again later." });

    const otherUser = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username: "owner", password: "own" }),
    });
    assert.equal(otherUser.status, 200);
    assert.match(otherUser.headers.get("set-cookie") || "", /viewer_session_http=/);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer preserves active login locks when the failure table reaches capacity", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "target", passwordHash: sha256("secret"), role: "viewer" },
    ],
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const attemptLogin = (username: string) => fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username, password: "wrong" }),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await attemptLogin("target");
      assert.equal(response.status, attempt === 4 ? 429 : 401);
      await response.json();
    }

    for (let index = 0; index < 499; index += 1) {
      const response = await attemptLogin(`noise-${index}`);
      assert.equal(response.status, 401);
      await response.json();
    }

    const capacityLimited = await attemptLogin("noise-499");
    assert.equal(capacityLimited.status, 429);
    assert.match(capacityLimited.headers.get("retry-after") || "", /^\d+$/);
    assert.deepEqual(await capacityLimited.json(), { error: "Too many failed login attempts. Try again later." });

    const targetStillLocked = await attemptLogin("target");
    assert.equal(targetStillLocked.status, 429);
    assert.deepEqual(await targetStillLocked.json(), { error: "Too many failed login attempts. Try again later." });
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer accepts signed session cookies after restart and invalidates only changed users", async () => {
  const sessionSecret = "test-session-secret";
  const authUsers = [
    { username: "eagle", passwordHash: sha256("secret"), role: "viewer" as const },
    { username: "admin", passwordHash: sha256("admin"), role: "admin" as const },
  ];
  const firstViewer = createViewerServer({
    authUsers,
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });

  await firstViewer.start();
  let cookie = "";
  try {
    const status = firstViewer.status();
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
    cookie = login.headers.get("set-cookie") || "";
    assert.match(cookie, /viewer_session_http=[^.]+\.[^;]+/);
    assert.equal(firstViewer.status().activeSessions, 1);
  } finally {
    await firstViewer.stop();
  }

  const restartedViewer = createViewerServer({
    authUsers,
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await restartedViewer.start();
  try {
    const status = restartedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.deepEqual(await response.json(), {
      required: true,
      authenticated: true,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
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
    assert.equal(restartedViewer.status().activeSessions, 0);
  } finally {
    await restartedViewer.stop();
  }

  const otherUserAddedViewer = createViewerServer({
    authUsers: [
      ...authUsers,
      { username: "new-user", passwordHash: sha256("new"), role: "viewer" },
    ],
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await otherUserAddedViewer.start();
  try {
    const status = otherUserAddedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, true);
  } finally {
    await otherUserAddedViewer.stop();
  }

  const otherUserEditedViewer = createViewerServer({
    authUsers: [
      { username: "eagle", passwordHash: sha256("secret"), role: "viewer" },
      { username: "admin", passwordHash: sha256("changed-admin"), role: "editor" },
    ],
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await otherUserEditedViewer.start();
  try {
    const status = otherUserEditedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, true);
  } finally {
    await otherUserEditedViewer.stop();
  }

  const otherUserDeletedViewer = createViewerServer({
    authUsers: [{ username: "eagle", passwordHash: sha256("secret"), role: "viewer" }],
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await otherUserDeletedViewer.start();
  try {
    const status = otherUserDeletedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, true);
  } finally {
    await otherUserDeletedViewer.stop();
  }

  const roleChangedViewer = createViewerServer({
    authUsers: [
      { username: "eagle", passwordHash: sha256("secret"), role: "editor" },
      { username: "admin", passwordHash: sha256("admin"), role: "admin" },
    ],
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await roleChangedViewer.start();
  try {
    const status = roleChangedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, false);
  } finally {
    await roleChangedViewer.stop();
  }

  const userChangedViewer = createViewerServer({
    authUsers: [
      { username: "eagle-renamed", passwordHash: sha256("secret"), role: "viewer" },
      { username: "admin", passwordHash: sha256("admin"), role: "admin" },
    ],
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await userChangedViewer.start();
  try {
    const status = userChangedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, false);
  } finally {
    await userChangedViewer.stop();
  }

  const passwordChangedViewer = createViewerServer({
    authUsers: [
      { username: "eagle", passwordHash: sha256("changed"), role: "viewer" },
      { username: "admin", passwordHash: sha256("admin"), role: "admin" },
    ],
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
  });
  await passwordChangedViewer.start();
  try {
    const status = passwordChangedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, false);
  } finally {
    await passwordChangedViewer.stop();
  }
});

test("createViewerServer rejects signed session cookies when the session secret changes", async () => {
  const authUsers = [
    { username: "eagle", passwordHash: sha256("secret"), role: "viewer" as const },
  ];
  const firstViewer = createViewerServer({
    authUsers,
    host: "127.0.0.1",
    port: 0,
    sessionSecret: "first-secret",
  });

  await firstViewer.start();
  let cookie = "";
  try {
    const status = firstViewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    cookie = await loginCookie(origin, "eagle", "secret");
  } finally {
    await firstViewer.stop();
  }

  const restartedViewer = createViewerServer({
    authUsers,
    host: "127.0.0.1",
    port: 0,
    sessionSecret: "second-secret",
  });
  await restartedViewer.start();
  try {
    const status = restartedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, false);
  } finally {
    await restartedViewer.stop();
  }
});

test("createViewerServer rejects signed session cookies longer than the configured max age", async () => {
  const sessionSecret = "test-session-secret";
  const authUsers = [
    { username: "eagle", passwordHash: sha256("secret"), role: "viewer" as const },
  ];
  const firstViewer = createViewerServer({
    authUsers,
    host: "127.0.0.1",
    port: 0,
    sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
    sessionSecret,
  });

  await firstViewer.start();
  let cookie = "";
  try {
    const status = firstViewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    cookie = await loginCookie(origin, "eagle", "secret");
  } finally {
    await firstViewer.stop();
  }

  const shortenedViewer = createViewerServer({
    authUsers,
    host: "127.0.0.1",
    port: 0,
    sessionMaxAgeSeconds: 24 * 60 * 60,
    sessionSecret,
  });
  await shortenedViewer.start();
  try {
    const status = shortenedViewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
      headers: { Cookie: cookie },
    });
    assert.equal((await response.json()).authenticated, false);
  } finally {
    await shortenedViewer.stop();
  }
});

test("createViewerServer expires cookie sessions server side", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
  });
  const originalNow = Date.now;

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
    assert.match(cookie, /Max-Age=604800/);
    assert.equal(viewer.status().activeSessions, 1);

    Date.now = () => originalNow() + 8 * 24 * 60 * 60 * 1000;
    const expired = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: cookie },
    });

    assert.deepEqual(await expired.json(), {
      required: true,
      authenticated: false,
      sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
      user: null,
      permissions: {
        manageLibrary: false,
        read: false,
        writeMetadata: false,
        writeRating: false,
      },
    });
    assert.equal(viewer.status().activeSessions, 0);

    Date.now = originalNow;
    const nextLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ username: "eagle", password: "secret" }),
    });
    assert.equal(nextLogin.status, 200);
    assert.equal(viewer.status().activeSessions, 1);
  } finally {
    Date.now = originalNow;
    await viewer.stop();
  }
});

test("createViewerServer uses configured session max age for login cookies", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
    sessionMaxAgeSeconds: 2 * 24 * 60 * 60,
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
    assert.match(login.headers.get("set-cookie") || "", /Max-Age=172800/);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer serves HTTPS and marks session cookies Secure", async () => {
  const { certPath, keyPath } = await writeTlsFixture("viewer");
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
    httpsEnabled: true,
    httpsCertPath: certPath,
    httpsKeyPath: keyPath,
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `https://127.0.0.1:${status.port}`;
    const login = await httpsJson(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { Origin: origin },
      body: { username: "eagle", password: "secret" },
    });

    assert.equal(login.status, 200);
    const rawSetCookie = login.headers["set-cookie"];
    const setCookies = Array.isArray(rawSetCookie) ? rawSetCookie.map(String) : [String(rawSetCookie || "")];
    const setCookie = setCookies.find((cookie) => cookie.startsWith("viewer_session=")) || "";
    assert.match(setCookie, /viewer_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Secure/);
    assert.ok(setCookies.some((cookie) => cookie.startsWith("viewer_session_http=") && cookie.includes("Max-Age=0")));

    const authenticated = await httpsJson(`${origin}/api/auth/status`, {
      headers: { Cookie: setCookie },
    });
    assert.equal(authenticated.status, 200);
    assert.equal((authenticated.body as { authenticated?: boolean }).authenticated, true);
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
      headers: {
        "Content-Type": "application/json",
        Origin: `http://127.0.0.1:${status.port}`,
      },
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
      headers: {
        "Content-Type": "application/json",
        Origin: `http://127.0.0.1:${status.port}`,
      },
      body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
    });

    assert.equal(response.status, 413);
    assertSecurityHeaders(response.headers);
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

test("serveStatic rejects sibling paths that only share the public directory prefix", async () => {
  const { serveStatic } = require("../dist/.generated/plugin-service/static.cjs");
  const root = join(tmpdir(), `eagle-media-preview-server-static-${Date.now()}`);
  const publicDir = join(root, "public");
  const siblingDir = join(root, "public-evil");
  await mkdir(publicDir, { recursive: true });
  await mkdir(siblingDir, { recursive: true });
  await writeFile(join(publicDir, "index.html"), "ok");
  await writeFile(join(siblingDir, "secret.txt"), "secret");

  let status = 0;
  let body = "";
  const res = {
    writeHead(nextStatus: number) {
      status = nextStatus;
    },
    end(nextBody = "") {
      body = String(nextBody);
    },
  };

  await serveStatic("/../public-evil/secret.txt", res, publicDir);

  assert.equal(status, 403);
  assert.deepEqual(JSON.parse(body), { error: "Forbidden" });
});

test("serveStatic handles file open races without an unhandled stream error", async () => {
  const { serveStatic } = require("../dist/.generated/plugin-service/static.cjs");
  const publicDir = join(tmpdir(), `eagle-media-preview-server-static-race-${Date.now()}`);
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, "index.html"), "ok");

  let status = 0;
  let body = "";
  let finishResponse: (() => void) | undefined;
  const responseFinished = new Promise<void>((resolve) => {
    finishResponse = resolve;
  });
  const res = {
    destroyed: false,
    headersSent: false,
    once() {},
    off() {},
    writeHead(nextStatus: number) {
      status = nextStatus;
      this.headersSent = true;
    },
    end(nextBody = "") {
      body = String(nextBody);
      finishResponse?.();
    },
    destroy(error: Error) {
      throw error;
    },
  };

  await serveStatic(
    "/index.html",
    res,
    publicDir,
    () => createReadStream(join(publicDir, "removed-before-open.html")),
  );
  await responseFinished;

  assert.equal(status, 500);
  assert.deepEqual(JSON.parse(body), { error: "Unable to read static file" });
});

test("media streams close their source file when the client disconnects", async () => {
  const { pipeMediaStream } = require("../dist/.generated/plugin-service/media.cjs");
  const root = join(tmpdir(), `eagle-media-preview-server-stream-close-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "large.bin");
  await writeFile(filePath, Buffer.alloc(2 * 1024 * 1024));
  const response = new PassThrough() as PassThrough & { writeHead: (status: number) => void };
  response.writeHead = () => {};

  const stream = pipeMediaStream(filePath, undefined, response, 200, {});
  const streamClosed = once(stream, "close");
  await once(stream, "open");
  response.destroy();
  await streamClosed;

  assert.equal(stream.destroyed, true);
  assert.equal(stream.closed, true);
});

test("createViewerServer serves static shell with browser hardening headers", async () => {
  const publicDir = join(tmpdir(), `eagle-media-preview-server-public-${Date.now()}`);
  await mkdir(publicDir, { recursive: true });
  await writeFile(join(publicDir, "index.html"), "<!doctype html><html><body>viewer</body></html>");
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    publicDir,
    viewerPassword: "",
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.match(response.headers.get("content-security-policy") || "", /style-src 'self' 'sha256-47DEQpj8HBSa\+\/TImW\+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY='/);
    assert.doesNotMatch(response.headers.get("content-security-policy") || "", /style-src[^;]*'unsafe-inline'/);
    assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
  } finally {
    await viewer.stop();
  }
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

test("createViewerServer serves the login shell publicly and protects APIs with cookie sessions", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    passwordHash: sha256("secret"),
    basicAuthUsername: "eagle",
  });

  await viewer.start();
  const status = viewer.status();
  const rootUrl = `http://127.0.0.1:${status.port}/`;
  const origin = `http://127.0.0.1:${status.port}`;

  const shell = await fetch(rootUrl);
  assert.equal(shell.status, 200);
  assert.equal(shell.headers.get("www-authenticate"), null);

  const denied = await fetch(`${origin}/api/items`, {
    headers: {
      Authorization: `Basic ${Buffer.from("eagle:secret").toString("base64")}`,
    },
  });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("www-authenticate"), null);
  assert.deepEqual(await denied.json(), { error: "Authentication required" });

  const cookie = await loginCookie(origin, "eagle", "secret");
  const allowed = await fetch(`${origin}/api/auth/status`, {
    headers: { Cookie: cookie },
  });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).authenticated, true);

  await viewer.stop();
});

test("createViewerServer does not expose library switching or library history", async () => {
  const calls: string[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [{ username: "owner", passwordHash: sha256("own"), role: "admin" }],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/Users/me/A.library", name: "A" };
      },
      async libraryHistory() {
        calls.push("libraryHistory");
        return ["/Users/me/A.library", "/Users/me/B.library"];
      },
      async switchLibrary(libraryPath: string) {
        calls.push(`switchLibrary:${libraryPath}`);
        return {};
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const adminCookie = await loginCookie(origin, "owner", "own");

    const libraries = await fetch(`${origin}/api/libraries`, { headers: { Cookie: adminCookie } });
    assert.equal(libraries.status, 404);

    const switched = await fetch(`${origin}/api/library/switch`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ libraryPath: "/Users/me/B.library" }),
    });
    assert.equal(switched.status, 404);
    assert.deepEqual(calls, []);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer keeps the Eagle API connection fixed and hides library paths", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [{ username: "owner", passwordHash: sha256("own"), role: "admin" }],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/Users/me/A.library", name: "A" };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const adminCookie = await loginCookie(origin, "owner", "own");

    const connected = await fetch(`${origin}/api/connect`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ host: "192.168.1.20", port: "41596", token: "secret" }),
    });
    assert.equal(connected.status, 200);
    const connectedBody = await connected.json();
    assert.deepEqual(connectedBody.app, { version: "1.0.0" });
    assert.equal(connectedBody.library.name, "A");
    assert.match(connectedBody.library.id, /^[A-Za-z0-9_-]{16}$/);

    const health = await fetch(`${origin}/api/health`, { headers: { Cookie: adminCookie } });
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.library.name, "A");
    assert.equal(healthBody.library.id, connectedBody.library.id);
    assert.equal(JSON.stringify(healthBody).includes("/Users/me"), false);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer only serves the library when Eagle has a shared library open", async () => {
  let openLibrary = "/Users/me/Shared.library";
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    sharedLibraries: ["/Users/me/Shared.library"],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: openLibrary, name: openLibrary.includes("Shared") ? "Shared" : "Private" };
      },
      async folders() {
        return { items: [{ id: "F1", name: "Folder" }], total: 1, offset: 0, limit: 1 };
      },
      async itemById() {
        throw new Error("item lookup must not run for unshared libraries");
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;

    const shared = await fetch(`${origin}/api/folders`);
    assert.equal(shared.status, 200);
    const sharedHealth = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(sharedHealth.libraryStatus, "shared");
    assert.equal(sharedHealth.library.name, "Shared");

    openLibrary = "/Users/me/Private.library";
    viewer.notifyLibraryChanged();

    const folders = await fetch(`${origin}/api/folders`);
    assert.equal(folders.status, 503);
    assert.deepEqual(await folders.json(), { error: "The library open in Eagle is not shared", code: "LIBRARY_NOT_SHARED" });

    const connect = await fetch(`${origin}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });
    assert.equal(connect.status, 503);

    const file = await fetch(`${origin}/file/ITEM1`);
    assert.equal(file.status, 503);

    const health = await fetch(`${origin}/api/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.libraryStatus, "not_shared");
    assert.equal(healthBody.library, null);
    assert.deepEqual(healthBody.app, { version: "1.0.0" });

    openLibrary = "/Users/me/Shared.library";
    viewer.notifyLibraryChanged();
    assert.equal((await fetch(`${origin}/api/folders`)).status, 200);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer reports library sharing publicly without naming the library", async () => {
  let openLibrary = "/Users/me/Shared.library";
  let libraryInfoCalls = 0;
  const eagleClient = {
    async appInfo() {
      return { version: "1.0.0" };
    },
    async libraryInfo() {
      libraryInfoCalls += 1;
      if (!openLibrary) throw new Error("offline");
      return { path: openLibrary, name: "Secret Name" };
    },
  };
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [{ username: "owner", passwordHash: sha256("own"), role: "admin" }],
    sharedLibraries: ["/Users/me/Shared.library"],
    eagleClient,
  });
  const unrestricted = createViewerServer({ host: "127.0.0.1", port: 0, eagleClient });

  await viewer.start();
  await unrestricted.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const shared = await fetch(`${origin}/api/library-status`);
    assert.equal(shared.status, 200);
    assert.deepEqual(await shared.json(), { libraryStatus: "shared" });

    openLibrary = "/Users/me/Private.library";
    viewer.notifyLibraryChanged();
    const notShared = await fetch(`${origin}/api/library-status`);
    const notSharedText = await notShared.text();
    assert.deepEqual(JSON.parse(notSharedText), { libraryStatus: "not_shared" });
    assert.equal(notSharedText.includes("Secret Name"), false);

    openLibrary = "";
    viewer.notifyLibraryChanged();
    assert.deepEqual(await (await fetch(`${origin}/api/library-status`)).json(), { libraryStatus: null });

    const callsBefore = libraryInfoCalls;
    const unrestrictedStatus = await fetch(`http://127.0.0.1:${unrestricted.status().port}/api/library-status`);
    assert.deepEqual(await unrestrictedStatus.json(), { libraryStatus: "shared" });
    assert.equal(libraryInfoCalls, callsBefore);
  } finally {
    await viewer.stop();
    await unrestricted.stop();
  }
});

test("createViewerServer drops an answer when Eagle switches libraries while the request is in progress", async () => {
  let open = { path: "/Users/me/Shared.library", name: "Shared" };
  let release: () => void = () => {};
  let started: () => void = () => {};
  const folderRequestStarted = new Promise<void>((resolve) => { started = resolve; });
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    sharedLibraries: ["/Users/me/Shared.library"],
    sessionSecret: "fixed-test-secret",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return open;
      },
      async folders() {
        started();
        await new Promise<void>((resolve) => { release = resolve; });
        return { items: [{ id: "F1", name: `folder of ${open.name}` }], total: 1, offset: 0, limit: 1 };
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const sharedId = (await (await globalThis.fetch(`${origin}/api/health`)).json()).library.id;
    const pending = globalThis.fetch(`${origin}/api/folders`, { headers: { "X-Library-Id": sharedId } });
    await folderRequestStarted;
    open = { path: "/Users/me/Private.library", name: "Private" };
    viewer.notifyLibraryChanged();
    release();

    const response = await pending;
    const text = await response.text();
    assert.equal(response.status, 409);
    assert.deepEqual(JSON.parse(text), { error: "The library open in Eagle has changed", code: "LIBRARY_CHANGED" });
    assert.equal(text.includes("Private"), false);
    assert.notEqual(response.headers.get("x-library-id"), libraryIdFor("fixed-test-secret", "/Users/me/Private.library"), "the refusal never names the unshared library");
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer never sends the id of an unshared library", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    sharedLibraries: ["/Users/me/Shared.library"],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/Users/me/Private.library", name: "Private" };
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const responses = [
      await globalThis.fetch(`${origin}/api/health`),
      await globalThis.fetch(`${origin}/api/folders`, { headers: { "X-Library-Id": "guess" } }),
      await globalThis.fetch(`${origin}/api/connect`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "{}" }),
      await globalThis.fetch(`${origin}/file/ITEM1?library=guess`),
    ];
    assert.deepEqual(responses.map((response) => response.status), [200, 503, 503, 503]);
    assert.deepEqual(responses.map((response) => response.headers.get("x-library-id")), [null, null, null, null]);
    const health = await responses[0].json();
    assert.equal(health.libraryStatus, "not_shared");
    assert.equal(health.library, null);
  } finally {
    await viewer.stop();
  }
});

for (const route of ["/api/folders", "/file/ITEM1"]) {
  test(`createViewerServer refuses ${route} when Eagle switches while the request is being admitted`, async () => {
    const root = join(tmpdir(), `eagle-media-preview-server-admit-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const filePath = join(root, "private.jpg");
    await writeFile(filePath, "private-file");
    const shared = { path: "/Users/me/Shared.library", name: "Shared" };
    const unshared = { path: "/Users/me/Private.library", name: "Private" };
    let open = unshared;
    let switchAfterNextRead = false;
    let viewer: ReturnType<typeof createViewerServer>;
    viewer = createViewerServer({
      host: "127.0.0.1",
      port: 0,
      sharedLibraries: [shared.path],
      sessionSecret: "fixed-test-secret",
      eagleClient: {
        async appInfo() {
          return { version: "1.0.0" };
        },
        async libraryInfo() {
          const current = open;
          if (switchAfterNextRead) {
            switchAfterNextRead = false;
            // Eagle reports the shared library, then switches to the unshared one right away.
            queueMicrotask(() => {
              open = unshared;
              viewer.notifyLibraryChanged();
            });
          }
          return current;
        },
        async folders() {
          return { items: [{ id: "F1", name: `folder of ${open.name}` }], total: 1, offset: 0, limit: 1 };
        },
        async itemById(id: string) {
          return { data: [{ id, filePath }] };
        },
      },
    });

    await viewer.start();
    try {
      const origin = `http://127.0.0.1:${viewer.status().port}`;
      // The real id of the unshared library, as a client could have learned it earlier.
      const { createHmac } = await import("node:crypto");
      const { libraryPathKey } = require("../dist/.generated/plugin-service/libraryAccess.cjs");
      const guessedId = createHmac("sha256", "fixed-test-secret").update(libraryPathKey(unshared.path)).digest("base64url").slice(0, 16);
      open = shared;
      viewer.notifyLibraryChanged();
      switchAfterNextRead = true;
      const separator = route.includes("?") ? "&" : "?";
      const response = await globalThis.fetch(`${origin}${route}${route.startsWith("/file/") ? `${separator}library=${guessedId}` : ""}`, {
        headers: route.startsWith("/api/") ? { "X-Library-Id": guessedId } : {},
      });
      const text = await response.text();
      assert.notEqual(response.status, 200);
      assert.equal(text.includes("Private"), false);
      assert.equal(text.includes("private-file"), false);
    } finally {
      await viewer.stop();
    }
  });
}

test("createViewerServer does not reveal an unshared library through a held-back /api/connect body", async () => {
  let open = { path: "/Users/me/Shared.library", name: "Shared" };
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    sharedLibraries: ["/Users/me/Shared.library"],
    sessionSecret: "fixed-test-secret",
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return open;
      },
    },
  });

  await viewer.start();
  try {
    const { port } = viewer.status();
    const origin = `http://127.0.0.1:${port}`;
    const unsharedId = libraryIdFor("fixed-test-secret", "/Users/me/Private.library");
    for (const notify of [true, false]) {
      open = { path: "/Users/me/Shared.library", name: "Shared" };
      viewer.notifyLibraryChanged();
      // Headers first; the body follows only after Eagle has switched to the unshared library.
      const response = await new Promise<{ status: number; body: string; libraryId: string }>((resolve, reject) => {
        const request = httpRequest({ host: "127.0.0.1", port, path: "/api/connect", method: "POST", headers: { "Content-Type": "application/json", Origin: origin } }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8"), libraryId: String(res.headers["x-library-id"] || "") }));
        });
        request.on("error", reject);
        request.flushHeaders();
        setTimeout(() => {
          open = { path: "/Users/me/Private.library", name: "PRIVATE_LIBRARY_NAME" };
          if (notify) viewer.notifyLibraryChanged();
          request.end("{}");
        }, 100);
      });
      // Without the notification the server still sees the shared library (cached for up to 3s)
      // and may answer with it; either way the unshared library is never named.
      if (notify) assert.notEqual(response.status, 200);
      assert.equal(response.body.includes("PRIVATE_LIBRARY_NAME"), false, `notify=${notify}`);
      assert.equal(response.body.includes(unsharedId), false, `notify=${notify}`);
      assert.notEqual(response.libraryId, unsharedId, `notify=${notify}`);
    }
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer re-checks the open library right before a write", async () => {
  let open = { path: "/Users/me/Shared.library", name: "Shared" };
  const writes: string[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    sharedLibraries: ["/Users/me/Shared.library"],
    sessionSecret: "fixed-test-secret",
    authUsers: [{ username: "editor", passwordHash: sha256("secret"), role: "editor" }],
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return open;
      },
      async updateItemStar(id: string, star: number) {
        writes.push(`${open.name}:${id}:${star}`);
        return { id, star };
      },
    },
  });

  await viewer.start();
  try {
    const { port } = viewer.status();
    const origin = `http://127.0.0.1:${port}`;
    const cookie = await loginCookie(origin, "editor", "secret");
    const sharedId = (await (await globalThis.fetch(`${origin}/api/health`, { headers: { Cookie: cookie } })).json()).library.id;
    // The client sends the headers, holds the body until Eagle has switched, then sends it.
    const response = await new Promise<{ status: number; body: string; libraryId: string }>((resolve, reject) => {
      const request = httpRequest({
        host: "127.0.0.1",
        port,
        path: "/api/items/ITEM1/star",
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie, "X-Library-Id": sharedId },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8"), libraryId: String(res.headers["x-library-id"] || "") }));
      });
      request.on("error", reject);
      request.flushHeaders();
      setTimeout(() => {
        open = { path: "/Users/me/Private.library", name: "Private" };
        viewer.notifyLibraryChanged();
        request.end(JSON.stringify({ star: 5 }));
      }, 100);
    });

    assert.equal(response.status, 409);
    assert.deepEqual(JSON.parse(response.body), { error: "The library open in Eagle has changed", code: "LIBRARY_CHANGED" });
    assert.notEqual(response.libraryId, libraryIdFor("fixed-test-secret", "/Users/me/Private.library"), "the refusal never names the unshared library");
    assert.deepEqual(writes, []);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer does not stream media after Eagle switches libraries mid-request", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-switch-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "asset.jpg");
  await writeFile(filePath, "shared-file");
  let open = { path: "/Users/me/Shared.library", name: "Shared" };
  let viewer: ReturnType<typeof createViewerServer>;
  viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return open;
      },
      async itemById(id: string) {
        // Eagle switches while the item is being resolved.
        open = { path: "/Users/me/Other.library", name: "Other" };
        viewer.notifyLibraryChanged();
        return { data: [{ id, filePath }] };
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const response = await globalThis.fetch(`${origin}/file/ITEM1${await libraryQuery(origin)}`, {
      headers: { "If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT" },
    });
    assert.equal(response.status, 409);
    assert.equal((await response.text()).includes("shared-file"), false);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer refuses pinned media requests while the open library cannot be confirmed", async () => {
  let eagleUp = true;
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        if (!eagleUp) throw new Error("offline");
        return { path: "/Users/me/A.library", name: "A" };
      },
      async itemById() {
        throw new Error("item lookup must not run");
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const query = await libraryQuery(origin);
    eagleUp = false;
    viewer.notifyLibraryChanged();
    const response = await fetch(`${origin}/file/ITEM1${query}`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Unable to reach Eagle API" });
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer tags API responses with the open library id", async () => {
  let openLibrary = "/Users/me/A.library";
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: openLibrary, name: "Library" };
      },
      async folders() {
        return { items: [], total: 0, offset: 0, limit: 0 };
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const first = await fetch(`${origin}/api/folders`);
    const firstId = first.headers.get("x-library-id");
    assert.match(firstId || "", /^[A-Za-z0-9_-]{16}$/);
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.library.id, firstId);

    openLibrary = "/Users/me/B.library";
    viewer.notifyLibraryChanged();
    const second = await fetch(`${origin}/api/folders`);
    assert.notEqual(second.headers.get("x-library-id"), firstId);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer requires library requests to name the open library", async () => {
  let openLibrary = "/Users/me/A.library";
  const itemLookups: string[] = [];
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: openLibrary, name: "Library" };
      },
      async folders() {
        return { items: [], total: 0, offset: 0, limit: 0 };
      },
      async itemById(id: string) {
        itemLookups.push(id);
        return { data: [{ id, filePath: "/nonexistent" }] };
      },
    },
  });

  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const connect = await fetch(`${origin}/api/connect`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "{}" });
    const connectedId = (await connect.json()).library.id;

    assert.equal((await fetch(`${origin}/api/folders`, { headers: { "X-Library-Id": connectedId } })).status, 200);

    openLibrary = "/Users/me/B.library";
    viewer.notifyLibraryChanged();

    const pinnedFetch = await fetch(`${origin}/api/folders`, { headers: { "X-Library-Id": connectedId } });
    assert.equal(pinnedFetch.status, 409);
    assert.deepEqual(await pinnedFetch.json(), { error: "The library open in Eagle has changed", code: "LIBRARY_CHANGED" });
    assert.notEqual(pinnedFetch.headers.get("x-library-id"), connectedId);

    const pinnedThumb = await fetch(`${origin}/api/items/ITEM1/thumb?library=${connectedId}`);
    assert.equal(pinnedThumb.status, 409);
    const pinnedFile = await fetch(`${origin}/file/ITEM1?library=${connectedId}`);
    assert.equal(pinnedFile.status, 409);
    assert.deepEqual(itemLookups, []);

    const unpinnedFile = await globalThis.fetch(`${origin}/file/ITEM1`);
    assert.equal(unpinnedFile.status, 400);
    assert.deepEqual(await unpinnedFile.json(), { error: "A library id is required for library requests", code: "LIBRARY_REQUIRED" });
    for (const path of ["/file/ITEM1/name.png", "/api/items/ITEM1/thumb", "/api/items/ITEM1/file", "/api/folders", "/api/items"]) {
      assert.equal((await globalThis.fetch(`${origin}${path}`)).status, 400, path);
    }
    assert.deepEqual(itemLookups, [], "library requests check the library before looking up the item");
    assert.equal((await fetch(`${origin}/api/health`, { headers: { "X-Library-Id": connectedId } })).status, 200);
    const reconnect = await fetch(`${origin}/api/connect`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Library-Id": connectedId }, body: "{}" });
    assert.equal(reconnect.status, 200);
  } finally {
    await viewer.stop();
  }
});

test("media revalidation preserves the one-hour cache and checks access before returning 304", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-cache-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "asset.jpg");
  const modified = new Date("2026-01-01T00:00:00.789Z");
  await writeFile(filePath, "demo-file");
  await utimes(filePath, modified, modified);
  let openLibrary = root;
  const viewer = createViewerServer({
    host: "127.0.0.1", port: 0,
    authUsers: [{ username: "owner", passwordHash: sha256("own"), role: "admin" }],
    sharedLibraries: [root],
    eagleClient: {
      async appInfo() { return { version: "1.0.0" }; },
      async libraryInfo() { return { path: openLibrary, name: "Test Library" }; },
      async itemById(id: string) { return { data: [{ id, filePath, thumbnailPath: filePath }] }; },
    },
  });
  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const cookie = await loginCookie(origin, "owner", "own");
    const health = await (await fetch(`${origin}/api/health`, { headers: { Cookie: cookie } })).json();
    const paths = ["/file/ITEM1", "/api/items/ITEM1/file", "/api/items/ITEM1/thumb"];
    const headers = { Cookie: cookie, "X-Library-Id": health.library.id };
    const lastModified = modified.toUTCString();
    for (const path of paths) {
      const url = `${origin}${path}`;
      const initial = await fetch(url, { headers });
      assert.equal(initial.status, 200);
      assert.equal(initial.headers.get("cache-control"), "private, max-age=3600");
      assert.equal(initial.headers.get("last-modified"), lastModified);
      assert.equal(await initial.text(), "demo-file");
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(url, { method, headers: { ...headers, "If-Modified-Since": lastModified } });
        assert.equal(response.status, 304, `${method} ${path}`);
        assert.equal(response.headers.get("cache-control"), "private, max-age=3600");
        assert.equal(response.headers.get("last-modified"), lastModified);
        assert.equal(response.headers.get("content-length"), null);
        assert.equal(await response.text(), "");
      }
      const conditionalHeaders: Record<string, string>[] = [
        { "If-Modified-Since": "invalid" },
        { "If-Modified-Since": "Wed, 31 Dec 2025 00:00:00 GMT" },
        { "If-Modified-Since": lastModified, "If-None-Match": '"unknown"' },
      ];
      for (const conditional of conditionalHeaders) {
        const response = await fetch(url, { headers: { ...headers, ...conditional } });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "demo-file");
      }
      const range = await fetch(url, { headers: { ...headers, Range: "bytes=0-3" } });
      assert.equal(range.status, 206);
      assert.equal(range.headers.get("content-range"), "bytes 0-3/9");
      assert.equal(await range.text(), "demo");
      const conditionalRange = await fetch(url, { headers: { ...headers, Range: "bytes=0-3", "If-Modified-Since": lastModified } });
      assert.equal(conditionalRange.status, 304);
      assert.equal(conditionalRange.headers.get("content-range"), null);
      assert.equal(await conditionalRange.text(), "");
      const unauthorized = await fetch(url, { headers: { "X-Library-Id": health.library.id, "If-Modified-Since": lastModified } });
      assert.equal(unauthorized.status, 401);
      await unauthorized.text();
    }
    await writeFile(filePath, "updated-file");
    const updated = new Date(modified.getTime() + 2000);
    await utimes(filePath, updated, updated);
    const changed = await fetch(`${origin}${paths[0]}`, { headers: { ...headers, "If-Modified-Since": lastModified } });
    assert.equal(changed.status, 200);
    assert.equal(changed.headers.get("last-modified"), updated.toUTCString());
    assert.equal(await changed.text(), "updated-file");
    openLibrary = join(root, "Private.library");
    viewer.notifyLibraryChanged();
    for (const path of paths) {
      const denied = await fetch(`${origin}${path}`, { headers: { ...headers, "If-Modified-Since": updated.toUTCString() } });
      assert.equal(denied.status, 503);
      assert.equal((await denied.json()).code, "LIBRARY_NOT_SHARED");
    }
    const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: origin } });
    assert.equal(logout.status, 200);
    await logout.text();
    for (const path of paths) {
      const expired = await fetch(`${origin}${path}`, { headers: { ...headers, "If-Modified-Since": updated.toUTCString() } });
      assert.equal(expired.status, 401);
      await expired.text();
    }
  } finally {
    await viewer.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("media revalidation uses an ETag so a replacement with an older timestamp is still sent", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-etag-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "asset.jpg");
  const modified = new Date("2026-01-01T00:00:00.789Z");
  await writeFile(filePath, "demo-file");
  await utimes(filePath, modified, modified);
  const viewer = createViewerServer({
    host: "127.0.0.1", port: 0,
    eagleClient: {
      async appInfo() { return { version: "1.0.0" }; },
      async libraryInfo() { return { path: root, name: "Test Library" }; },
      async itemById(id: string) { return { data: [{ id, filePath }] }; },
    },
  });
  await viewer.start();
  try {
    const origin = `http://127.0.0.1:${viewer.status().port}`;
    const health = await (await fetch(`${origin}/api/health`)).json();
    const url = `${origin}/api/items/ITEM1/file?library=${health.library.id}`;
    const initial = await fetch(url);
    const etag = initial.headers.get("etag") || "";
    assert.match(etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    await initial.text();

    for (const noneMatch of [etag, etag.replace(/^W\//, ""), `"other", ${etag}`, "*"]) {
      const response = await fetch(url, { headers: { "If-None-Match": noneMatch } });
      assert.equal(response.status, 304, noneMatch);
      assert.equal(response.headers.get("etag"), etag);
      assert.equal(await response.text(), "");
    }
    const range = await fetch(url, { headers: { "If-None-Match": etag, Range: "bytes=0-3" } });
    assert.equal(range.status, 304);
    await range.text();

    // A date later than the server clock is invalid, so the file is sent in full.
    const future = await fetch(url, { headers: { "If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT" } });
    assert.equal(future.status, 200);
    assert.equal(await future.text(), "demo-file");

    // Same second-precision Last-Modified, older mtime, different content and size.
    await writeFile(filePath, "replaced-file");
    const older = new Date(modified.getTime() - 500);
    await utimes(filePath, older, older);
    const replaced = await fetch(url, { headers: { "If-None-Match": etag, "If-Modified-Since": modified.toUTCString() } });
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.headers.get("etag"), etag);
    assert.equal(await replaced.text(), "replaced-file");
  } finally {
    await viewer.stop();
    await rm(root, { recursive: true, force: true });
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
  const response = await fetch(`http://127.0.0.1:${status.port}/file/ITEM123${await libraryQuery(`http://127.0.0.1:${status.port}`)}`);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "demo-file");

  await viewer.stop();
});

test("createViewerServer falls back to the library original when Eagle reports noThumbnail and a stale file path", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-original-fallback-${Date.now()}`);
  const itemId = "ML3OU9S3PAJRO";
  const itemDir = join(root, "images", `${itemId}.info`);
  await mkdir(itemDir, { recursive: true });
  await writeFile(join(itemDir, "metadata.json"), "{}");
  await writeFile(join(itemDir, "Shimiko.png"), "original-image");

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
      async itemById() {
        return {
          data: [{
            id: itemId,
            name: "Shimiko",
            ext: "png",
            width: 841,
            height: 1280,
            size: 772197,
            noThumbnail: true,
            filePath: join(root, "stale", "Shimiko.png"),
          }],
        };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/file/${itemId}${await libraryQuery(`http://127.0.0.1:${status.port}`)}`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(await response.text(), "original-image");
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer rejects direct file routes that resolve to a directory", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-directory-${Date.now()}`);
  await mkdir(root, { recursive: true });

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
          data: [{ id, filePath: root }],
        };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/file/DIR123${await libraryQuery(`http://127.0.0.1:${status.port}`)}`);

    assert.equal(response.status, 404);
    assertSecurityHeaders(response.headers);
    assert.deepEqual(await response.json(), { error: "Media file is unavailable" });
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer rejects direct file routes that resolve to a missing file without leaking the path", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-missing-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "missing.jpg");

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
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/file/MISSING123${await libraryQuery(`http://127.0.0.1:${status.port}`)}`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Media file is unavailable" });
  } finally {
    await viewer.stop();
  }
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
  const response = await fetch(`http://127.0.0.1:${status.port}/file/TEXT123${await libraryQuery(`http://127.0.0.1:${status.port}`)}`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(await response.text(), "# demo\n\nplain markdown");

  await viewer.stop();
});

test("createViewerServer prevents active library files from executing in the viewer origin", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-active-content-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const files = {
    html: join(root, "page.html"),
    js: join(root, "script.js"),
    svg: join(root, "image.svg"),
  };
  await Promise.all([
    writeFile(files.html, '<script src="/file/js"></script>'),
    writeFile(files.js, 'fetch("/api/library/switch", { method: "POST" })'),
    writeFile(files.svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  ]);

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
      async itemById(id: keyof typeof files) {
        return { data: [{ id, filePath: files[id] }] };
      },
    },
  });

  await viewer.start();
  try {
    const { port } = viewer.status();
    const query = await libraryQuery(`http://127.0.0.1:${port}`);
    const [htmlResponse, jsResponse, svgResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/file/html${query}`),
      fetch(`http://127.0.0.1:${port}/file/js${query}`),
      fetch(`http://127.0.0.1:${port}/file/svg${query}`),
    ]);

    assert.equal(htmlResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(jsResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(svgResponse.headers.get("content-type"), "image/svg+xml");
    for (const response of [htmlResponse, jsResponse, svgResponse]) {
      assert.equal(response.headers.get("content-security-policy"), "sandbox");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }
  } finally {
    await viewer.stop();
  }
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
    const response = await fetch(`http://127.0.0.1:${status.port}/file/PDF123/sample.pdf${await libraryQuery(`http://127.0.0.1:${status.port}`)}`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
    assert.doesNotMatch(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.match(response.headers.get("content-disposition") || "", /^inline;/);
    assert.match(response.headers.get("content-disposition") || "", /filename="sample\.pdf"/);
    assert.equal(await response.text(), "%PDF-1.1\n%%EOF\n");
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer reads InternetShortcut files for url previews", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-url-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "shortcut.url");
  await writeFile(filePath, "[InternetShortcut]\nURL=https://example.test/shortcut\n");

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
          data: [{ id, filePath, name: "shortcut", ext: "url" }],
        };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items/URL123/url-preview`);

    assert.equal(response.status, 200);
    assertSecurityHeaders(response.headers);
    assert.deepEqual(await response.json(), { url: "https://example.test/shortcut" });
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer reads UTF-16LE InternetShortcut files for url previews", async () => {
  const root = join(tmpdir(), `eagle-media-preview-server-url-utf16-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, "shortcut.url");
  await writeFile(filePath, Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from("[InternetShortcut]\r\nURL=https://example.test/utf16\r\n", "utf16le"),
  ]));

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
          data: [{ id, filePath, name: "shortcut", ext: "url" }],
        };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items/URL123/url-preview`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { url: "https://example.test/utf16" });
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

test("createViewerServer forwards untagged item menu filter to Eagle", async () => {
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
        return { items: [{ id: "untagged", tags: [] }], total: 1, offset: 0, limit: 30 };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items?folderId=__untagged__`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [{ id: "untagged", tags: [] }], total: 1, offset: 0, limit: 30 });
    assert.equal(calls[0].folderId, undefined);
    assert.equal(calls[0].isUntagged, true);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer bounds item list limit and offset before forwarding to Eagle", async () => {
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
        return { items: [], total: 0 };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;

    await fetch(`${origin}/api/items?limit=999999&offset=999999999`);
    await fetch(`${origin}/api/items?limit=-20&offset=-10`);
    await fetch(`${origin}/api/items?limit=abc&offset=abc`);
    await fetch(`${origin}/api/items?limit=30abc&offset=10abc`);
    await fetch(`${origin}/api/items?limit=30.5&offset=10.5`);

    assert.equal(calls[0].limit, 1000);
    assert.equal(calls[0].offset, 1000000);
    assert.equal(calls[1].limit, 1);
    assert.equal(calls[1].offset, 0);
    assert.equal(calls[2].limit, 30);
    assert.equal(calls[2].offset, 0);
    assert.equal(calls[3].limit, 30);
    assert.equal(calls[3].offset, 0);
    assert.equal(calls[4].limit, 30);
    assert.equal(calls[4].offset, 0);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer bounds search item limit and offset before forwarding to Eagle", async () => {
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
      async searchItems(options: ItemListOptions) {
        calls.push(options);
        return { items: [], total: 0 };
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const response = await fetch(`http://127.0.0.1:${status.port}/api/items?q=cat&limit=5000&offset=5000000`);

    assert.equal(response.status, 200);
    assert.equal(calls[0].limit, 1000);
    assert.equal(calls[0].offset, 1000000);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer serves cached item types for the current library", async () => {
  let scans = 0;
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
      async itemExtensions() {
        scans += 1;
        return [{ ext: "jpg", count: 3 }, { ext: "mp4", count: 1 }];
      },
    },
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const first = await fetch(`http://127.0.0.1:${status.port}/api/item-types`);
    const second = await fetch(`http://127.0.0.1:${status.port}/api/item-types`);

    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { items: [{ ext: "jpg", count: 3 }, { ext: "mp4", count: 1 }] });
    assert.equal(second.status, 200);
    assert.equal(scans, 1);
  } finally {
    await viewer.stop();
  }
});

test("createViewerServer serves the tag overview and tag covers", async () => {
  const coverTags: string[] = [];
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
      async tagOverview() {
        return { tags: [{ name: "tree", imageCount: 1 }], groups: [], starred: [] };
      },
      async tagCoverItem(tag: string) {
        coverTags.push(tag);
        return { id: "item-1", ext: "jpg" };
      },
    },
  });

  await viewer.start();
  try {
    const { port } = viewer.status();
    const overview = await fetch(`http://127.0.0.1:${port}/api/tag-overview`);
    assert.equal(overview.status, 200);
    assert.deepEqual(await overview.json(), { tags: [{ name: "tree", imageCount: 1 }], groups: [], starred: [] });

    const cover = await fetch(`http://127.0.0.1:${port}/api/tag-cover?tag=${encodeURIComponent(" tree ")}`);
    assert.equal(cover.status, 200);
    assert.deepEqual(await cover.json(), { item: { id: "item-1", ext: "jpg" } });
    assert.deepEqual(coverTags, ["tree"]);

    const missing = await fetch(`http://127.0.0.1:${port}/api/tag-cover`);
    assert.equal(missing.status, 400);
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
