import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const {
  DEFAULT_SETTINGS,
  buildAccessUrl,
  createServerManager,
  createSettingsStore,
  hashPassword,
  normalizeSettings,
} = require("../../dist/.generated/plugin-service/runtime.cjs");
const PASSWORD_HASH_PATTERN = /^pbkdf2\$sha256\$210000\$[^$]+\$[^$]+$/;
const SESSION_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

test("generated CommonJS runtime loads with require for Eagle plugin windows", () => {
  assert.equal(normalizeSettings({}).port, DEFAULT_SETTINGS.port);
  assert.equal(normalizeSettings({}).host, "127.0.0.1");
  assert.equal(normalizeSettings({}).httpsEnabled, false);
  assert.equal(normalizeSettings({}).settingsVersion, 2);
  assert.equal("requestLogEnabled" in normalizeSettings({ requestLogEnabled: false }), false);
  assert.equal("preferredLanAddress" in normalizeSettings({ preferredLanAddress: "192.168.1.50" }), false);
});

test("generated settings reject malformed port strings", () => {
  assert.throws(() => normalizeSettings({ port: "41532abc" }), /port must be an integer/);
  assert.throws(() => normalizeSettings({ port: "41532.5" }), /port must be an integer/);
});

test("generated runtime builds HTTPS access URLs when enabled", () => {
  assert.equal(buildAccessUrl({
    host: "127.0.0.1",
    httpsEnabled: true,
    port: 4443,
  }), "https://localhost:4443");
});

test("generated settings store uses the product settings directory by default", () => {
  const store = createSettingsStore();
  assert.match(store.filePath, /[\\/]\.eagle-media-preview-server[\\/]settings\.json$/);
  assert.equal(store.filePath.includes(".eagle-api-viewer-plugin"), false);
});

test("generated settings store hashes per-user passwords", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  const saved = await store.save({
    authEnabled: true,
    authUsers: [{ username: "reader", role: "viewer", passwordHash: "" }],
    userPasswords: { reader: "secret" },
  });

  assert.match(saved.authUsers[0].passwordHash, PASSWORD_HASH_PATTERN);
  assert.notEqual(saved.authUsers[0].passwordHash, hashPassword("secret"));
  assert.equal(saved.passwordHash, saved.authUsers[0].passwordHash);

  const raw = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  assert.equal(raw.settingsVersion, 2);
  assert.equal("authUsers" in raw, true);
  assert.equal("allowMetadataEditing" in raw, false);
  assert.equal("basicAuthUser" in raw, false);
  assert.equal("passwordHash" in raw, false);
});

test("generated settings store creates and persists a session secret", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });

  const loaded = await store.load();
  assert.match(loaded.sessionSecret, SESSION_SECRET_PATTERN);

  const raw = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(raw.settingsVersion, 2);
  assert.equal(raw.sessionSecret, loaded.sessionSecret);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);

  const saved = await store.save({ autoStart: true });
  assert.equal(saved.sessionSecret, loaded.sessionSecret);
});

test("generated settings store migrates existing settings with a session secret", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  await writeFile(filePath, JSON.stringify({ port: 41532 }), "utf8");
  const store = createSettingsStore({ filePath });

  const loaded = await store.load();
  assert.match(loaded.sessionSecret, SESSION_SECRET_PATTERN);

  const raw = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(raw.settingsVersion, 2);
  assert.equal(raw.sessionSecret, loaded.sessionSecret);
  assert.equal("allowMetadataEditing" in raw, false);
  assert.equal("basicAuthUser" in raw, false);
  assert.equal("passwordHash" in raw, false);
});

test("generated settings store migrates legacy auth fields into canonical auth users on disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  const passwordHash = hashPassword("secret");
  await writeFile(filePath, JSON.stringify({
    authEnabled: true,
    allowMetadataEditing: true,
    basicAuthUser: "legacy",
    passwordHash,
    port: 41532,
  }), "utf8");
  const store = createSettingsStore({ filePath });

  const loaded = await store.load();
  assert.deepEqual(loaded.authUsers, [
    { username: "legacy", role: "editor", passwordHash },
  ]);
  assert.equal(loaded.allowMetadataEditing, true);

  const raw = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(raw.settingsVersion, 2);
  assert.deepEqual(raw.authUsers, loaded.authUsers);
  assert.equal("allowMetadataEditing" in raw, false);
  assert.equal("basicAuthUser" in raw, false);
  assert.equal("passwordHash" in raw, false);
});

test("generated settings store saves multiple auth users with roles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  const saved = await store.save({
    authEnabled: true,
    authUsers: [
      { username: "reader", role: "viewer", passwordHash: "" },
      { username: "editor", role: "editor", passwordHash: "" },
    ],
    userPasswords: {
      reader: "read-secret",
      editor: "edit-secret",
    },
  });

  assert.equal(saved.authUsers.length, 2);
  assert.equal(saved.authUsers[0].username, "reader");
  assert.equal(saved.authUsers[0].role, "viewer");
  assert.match(saved.authUsers[0].passwordHash, PASSWORD_HASH_PATTERN);
  assert.equal(saved.authUsers[1].username, "editor");
  assert.equal(saved.authUsers[1].role, "editor");
  assert.match(saved.authUsers[1].passwordHash, PASSWORD_HASH_PATTERN);
  assert.equal(saved.allowMetadataEditing, true);
  assert.equal(saved.basicAuthUser, "reader");

  const raw = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  assert.equal(raw.settingsVersion, 2);
  assert.deepEqual(raw.authUsers, saved.authUsers);
  assert.equal("allowMetadataEditing" in raw, false);
  assert.equal("basicAuthUser" in raw, false);
  assert.equal("passwordHash" in raw, false);
});

test("generated settings store migrates legacy auth settings into a viewer user", () => {
  const passwordHash = hashPassword("secret");
  const settings = normalizeSettings({
    authEnabled: true,
    basicAuthUser: "legacy",
    passwordHash,
  });

  assert.deepEqual(settings.authUsers, [
    { username: "legacy", role: "viewer", passwordHash },
  ]);
});

test("generated settings store migrates legacy auth settings with the default username", () => {
  const passwordHash = hashPassword("secret");
  const settings = normalizeSettings({
    authEnabled: true,
    passwordHash,
  });

  assert.deepEqual(settings.authUsers, [
    { username: "eagle", role: "viewer", passwordHash },
  ]);
});

test("generated settings store rejects enabled auth without a password", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await assert.rejects(
    () => store.save({ authEnabled: true }),
    /password/i,
  );
});

test("generated settings store rejects invalid auth users", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await assert.rejects(
    () => store.save({ authUsers: [{ username: "", role: "viewer", passwordHash: "hash" }] }),
    /username/i,
  );
  await assert.rejects(
    () => store.save({
      authUsers: [
        { username: "reader", role: "viewer", passwordHash: "hash" },
        { username: "Reader", role: "editor", passwordHash: "hash" },
      ],
    }),
    /duplicate username/i,
  );
});

test("generated settings store requires password protection before metadata editing can be enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await assert.rejects(
    () => store.save({ allowMetadataEditing: true }),
    /Password protection/i,
  );
});

test("generated settings store requires certificate paths before HTTPS can be enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await assert.rejects(
    () => store.save({ httpsEnabled: true }),
    /HTTPS requires certificate and key paths/i,
  );
});

test("generated settings store clears metadata editing when password protection is disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await store.save({
    authEnabled: true,
    allowMetadataEditing: true,
    authUsers: [{ username: "editor", role: "editor", passwordHash: "" }],
    userPasswords: { editor: "secret" },
  });
  const saved = await store.save({ authEnabled: false });

  assert.equal(saved.authEnabled, false);
  assert.equal(saved.allowMetadataEditing, false);
  assert.equal(saved.passwordHash, "");
  assert.equal(saved.authUsers.length, 1);
  assert.match(saved.authUsers[0].passwordHash, PASSWORD_HASH_PATTERN);
});

test("generated server manager restarts after auth user roles change while running", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    authEnabled: true,
    allowMetadataEditing: false,
    authUsers: [{ username: "editor", role: "viewer", passwordHash: hashPassword("secret") }],
    host: "127.0.0.1",
    port: 41532,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        settings = { ...settings, ...input };
        settings.allowMetadataEditing = settings.authUsers.some((user: { role: string }) => user.role === "admin" || user.role === "editor");
        calls.push(["save", settings.authUsers]);
        return settings;
      },
    },
    viewerServerFactory(options: { authUsers: Array<{ role: string }> }) {
      const canEdit = options.authUsers.some((user) => user.role === "admin" || user.role === "editor");
      calls.push(["create", canEdit]);
      return {
        async start() {
          calls.push(["start", canEdit]);
        },
        async stop() {
          calls.push(["stop", canEdit]);
        },
        status() {
          return { state: "running", host: "127.0.0.1", port: 41532 };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  await manager.start();
  await manager.saveSettings({
    authUsers: [{ username: "editor", role: "editor", passwordHash: settings.authUsers[0].passwordHash }],
  });

  assert.deepEqual(calls, [
    ["create", false],
    ["start", false],
    ["save", [{ username: "editor", role: "editor", passwordHash: settings.authUsers[0].passwordHash }]],
    ["stop", false],
    ["create", true],
    ["start", true],
  ]);
});

test("generated server manager passes HTTPS settings and restarts when they change", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 41532,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        settings = { ...settings, ...input };
        calls.push(["save", settings.httpsEnabled, settings.httpsCertPath, settings.httpsKeyPath]);
        return settings;
      },
    },
    viewerServerFactory(options: { httpsCertPath: string; httpsEnabled: boolean; httpsKeyPath: string }) {
      calls.push(["create", options.httpsEnabled, options.httpsCertPath, options.httpsKeyPath]);
      return {
        async start() {
          calls.push(["start", options.httpsEnabled]);
        },
        async stop() {
          calls.push(["stop", options.httpsEnabled]);
        },
        status() {
          return { state: "running", host: "127.0.0.1", port: 41532 };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  await manager.start();
  const saved = await manager.saveSettings({
    httpsCertPath: "/tmp/cert.pem",
    httpsEnabled: true,
    httpsKeyPath: "/tmp/key.pem",
  });

  assert.equal(saved.url, "https://localhost:41532");
  assert.deepEqual(calls, [
    ["create", false, "", ""],
    ["start", false],
    ["save", true, "/tmp/cert.pem", "/tmp/key.pem"],
    ["stop", false],
    ["create", true, "/tmp/cert.pem", "/tmp/key.pem"],
    ["start", true],
  ]);
});

test("generated server manager can start and stop a viewer server", async () => {
  let settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 0,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        Object.assign(settings, input);
        return settings;
      },
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  const started = await manager.start();
  assert.equal(started.state, "running");

  const response = await fetch(`http://127.0.0.1:${started.port}/api/auth/status`);
  assert.equal(response.status, 200);

  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
});

test("generated server manager passes the persisted session secret to the viewer server", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 41532,
    sessionSecret: "persisted-secret",
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        settings = { ...settings, ...input };
        return settings;
      },
    },
    viewerServerFactory(options: { sessionSecret: string }) {
      calls.push(["create", options.sessionSecret]);
      return {
        async start() {
          calls.push(["start"]);
        },
        async stop() {
          calls.push(["stop"]);
        },
        status() {
          return { state: "running", host: "127.0.0.1", port: 41532 };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  await manager.start();

  assert.deepEqual(calls, [
    ["create", "persisted-secret"],
    ["start"],
  ]);
});

test("generated server manager accepts PBKDF2 password hashes for cookie login", async () => {
  let settings = {
    ...DEFAULT_SETTINGS,
    authEnabled: true,
    authUsers: [
      { username: "editor", role: "editor", passwordHash: hashPassword("secret") },
    ],
    host: "127.0.0.1",
    port: 0,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        Object.assign(settings, input);
        return settings;
      },
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  const started = await manager.start();
  const origin = `http://127.0.0.1:${started.port}`;
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ username: "editor", password: "secret" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie") || "";
  assert.match(cookie, /viewer_session=/);

  const response = await fetch(`${origin}/api/auth/status`, {
    headers: { Cookie: cookie },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.user.username, "editor");
  assert.equal(body.permissions.writeMetadata, true);

  await manager.stop();
});

test("generated server manager reports localhost URL when public network is disabled", async () => {
  let settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 41532,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        Object.assign(settings, input);
        return settings;
      },
    },
    lanAddressProvider() {
      return [{ label: "en0", address: "192.168.1.50" }];
    },
  });

  const status = await manager.status();
  assert.equal(status.url, "http://localhost:41532");
});

test("generated server manager does not restart when only auto start changes while running", async () => {
  const calls: unknown[] = [];
  const settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 0,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        Object.assign(settings, input);
        calls.push(["save", settings.autoStart]);
        return settings;
      },
    },
    viewerServerFactory() {
      calls.push(["create"]);
      return {
        async start() {
          calls.push(["start"]);
        },
        async stop() {
          calls.push(["stop"]);
        },
        status() {
          return { state: "running", host: "127.0.0.1", port: 41532 };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  await manager.start();
  await manager.saveSettings({ autoStart: true });

  assert.deepEqual(calls, [
    ["create"],
    ["start"],
    ["save", true],
  ]);
});

test("generated server manager does not restart when inactive auth users change while running", async () => {
  const calls: unknown[] = [];
  const settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 0,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        Object.assign(settings, input);
        calls.push(["save", settings.authUsers]);
        return settings;
      },
    },
    viewerServerFactory() {
      calls.push(["create"]);
      return {
        async start() {
          calls.push(["start"]);
        },
        async stop() {
          calls.push(["stop"]);
        },
        status() {
          return { state: "running", host: "127.0.0.1", port: 41532 };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  await manager.start();
  await manager.saveSettings({
    authUsers: [{ username: "reader", role: "viewer", passwordHash: "hash" }],
  });

  assert.deepEqual(calls, [
    ["create"],
    ["start"],
    ["save", [{ username: "reader", role: "viewer", passwordHash: "hash" }]],
  ]);
});

test("generated server manager restarts after saving binding settings while running", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 41532,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        settings = { ...settings, ...input };
        calls.push(["save", settings.port]);
        return settings;
      },
    },
    viewerServerFactory(options: { host: string; port: number }) {
      calls.push(["create", options.port]);
      return {
        async start() {
          calls.push(["start", options.port]);
        },
        async stop() {
          calls.push(["stop", options.port]);
        },
        status() {
          return { state: "running", host: options.host, port: options.port };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  await manager.start();
  await manager.saveSettings({ port: 6123 });

  assert.deepEqual(calls, [
    ["create", 41532],
    ["start", 41532],
    ["save", 6123],
    ["stop", 41532],
    ["create", 6123],
    ["start", 6123],
  ]);
});
