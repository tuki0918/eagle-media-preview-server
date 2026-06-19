import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createViewerServer, resolveDefaultPublicDir, sha256 } from "./viewerServer.js";

const require = createRequire(import.meta.url);

type ItemListOptions = { keywords?: string; limit?: number | string; offset?: number | string; query?: string; tags?: string[] };
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

  const invalidStatusMethod = await fetch(`http://127.0.0.1:${status.port}/api/auth/status`, {
    method: "POST",
  });
  assert.equal(invalidStatusMethod.status, 405);
  assert.equal(invalidStatusMethod.headers.get("allow"), "GET");
  assert.deepEqual(await invalidStatusMethod.json(), { error: "Method not allowed" });

  const invalidItemsMethod = await fetch(`http://127.0.0.1:${status.port}/api/items`, {
    method: "POST",
  });
  assert.equal(invalidItemsMethod.status, 405);
  assert.equal(invalidItemsMethod.headers.get("allow"), "GET");
  assert.deepEqual(await invalidItemsMethod.json(), { error: "Method not allowed" });

  const login = await fetch(`http://127.0.0.1:${status.port}/api/auth/login`, {
    method: "POST",
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), {
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

  const logout = await fetch(`http://127.0.0.1:${status.port}/api/auth/logout`, {
    method: "POST",
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), {
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
    assert.match(cookie, /viewer_session=/);
    const loginBody = await login.json();
    assert.match(loginBody.sessionToken, /^[^.]+\.[^;]+/);
    assert.deepEqual(loginBody, {
      required: true,
      authenticated: true,
      sessionToken: loginBody.sessionToken,
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

    const authenticatedWithBearer = await fetch(`${origin}/api/auth/status`, {
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal(authenticatedWithBearer.status, 200);
    assert.equal((await authenticatedWithBearer.json()).authenticated, true);

    const logout = await fetch(`${origin}/api/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${loginBody.sessionToken}`,
        Origin: origin,
      },
    });
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), {
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

    const revokedBearer = await fetch(`${origin}/api/auth/status`, {
      headers: { Authorization: `Bearer ${loginBody.sessionToken}` },
    });
    assert.equal((await revokedBearer.json()).authenticated, false);

    const malformedCookie = await fetch(`${origin}/api/auth/status`, {
      headers: { Cookie: "viewer_session=%E0%A4%A" },
    });
    assert.equal(malformedCookie.status, 200);
    assert.deepEqual(await malformedCookie.json(), {
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
    assert.match(otherUser.headers.get("set-cookie") || "", /viewer_session=/);
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
    assert.match(cookie, /viewer_session=[^.]+\.[^;]+/);
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
    const setCookie = Array.isArray(rawSetCookie) ? String(rawSetCookie[0] || "") : String(rawSetCookie || "");
    assert.match(setCookie, /viewer_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Secure/);

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
    const readerCookie = await loginCookie(origin, "reader", "read");
    const adminCookie = await loginCookie(origin, "owner", "own");

    const denied = await fetch(`${origin}/api/library/switch`, {
      method: "POST",
      headers: {
        Cookie: readerCookie,
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
        Cookie: adminCookie,
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

test("createViewerServer restricts Eagle API connection changes to admins", async () => {
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    authUsers: [
      { username: "reader", passwordHash: sha256("read"), role: "viewer" },
      { username: "owner", passwordHash: sha256("own"), role: "admin" },
    ],
  });

  await viewer.start();
  try {
    const status = viewer.status();
    const origin = `http://127.0.0.1:${status.port}`;
    const readerCookie = await loginCookie(origin, "reader", "read");

    const deniedRemoteHost = await fetch(`${origin}/api/connect`, {
      method: "POST",
      headers: {
        Cookie: readerCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ host: "192.168.1.20", port: "41595", token: "secret" }),
    });
    assert.equal(deniedRemoteHost.status, 403);
    assert.deepEqual(await deniedRemoteHost.json(), {
      error: "Admin permission is required to change the Eagle API connection",
    });

    const deniedLocalPort = await fetch(`${origin}/api/connect`, {
      method: "POST",
      headers: {
        Cookie: readerCookie,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ host: "127.0.0.1", port: "41596" }),
    });
    assert.equal(deniedLocalPort.status, 403);
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

    assert.equal(calls[0].limit, 1000);
    assert.equal(calls[0].offset, 1000000);
    assert.equal(calls[1].limit, 1);
    assert.equal(calls[1].offset, 0);
    assert.equal(calls[2].limit, 30);
    assert.equal(calls[2].offset, 0);
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
