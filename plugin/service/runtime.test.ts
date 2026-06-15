import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const {
  DEFAULT_SETTINGS,
  createServerManager,
  createSettingsStore,
  hashPassword,
  normalizeSettings,
} = require("../../dist/.generated/plugin-service/runtime.cjs");
const PASSWORD_HASH_PATTERN = /^pbkdf2\$sha256\$210000\$[^$]+\$[^$]+$/;

test("generated CommonJS runtime loads with require for Eagle plugin windows", () => {
  assert.equal(normalizeSettings({}).port, DEFAULT_SETTINGS.port);
  assert.equal("requestLogEnabled" in normalizeSettings({ requestLogEnabled: false }), false);
});

test("generated settings store uses the product settings directory by default", () => {
  const store = createSettingsStore();
  assert.match(store.filePath, /[\\/]\.eagle-media-preview-server[\\/]settings\.json$/);
  assert.equal(store.filePath.includes(".eagle-api-viewer-plugin"), false);
});

test("generated settings store hashes password", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  const saved = await store.save({
    authEnabled: true,
    password: "secret",
    confirmPassword: "secret",
  });

  assert.match(saved.passwordHash, PASSWORD_HASH_PATTERN);
  assert.notEqual(saved.passwordHash, hashPassword("secret"));
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

test("generated settings store requires BasicAuth before metadata editing can be enabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await assert.rejects(
    () => store.save({ allowMetadataEditing: true }),
    /BasicAuth/i,
  );
});

test("generated settings store clears metadata editing when BasicAuth is disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  await store.save({
    authEnabled: true,
    allowMetadataEditing: true,
    password: "secret",
    confirmPassword: "secret",
  });
  const saved = await store.save({ authEnabled: false });

  assert.equal(saved.authEnabled, false);
  assert.equal(saved.allowMetadataEditing, false);
  assert.equal(saved.passwordHash, "");
  assert.equal(saved.authUsers.length, 1);
  assert.match(saved.authUsers[0].passwordHash, PASSWORD_HASH_PATTERN);
});

test("generated server manager restarts after metadata editing setting changes while running", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    authEnabled: true,
    passwordHash: hashPassword("secret"),
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
        calls.push(["save", settings.allowMetadataEditing]);
        return settings;
      },
    },
    viewerServerFactory(options: { allowMetadataEditing: boolean }) {
      calls.push(["create", options.allowMetadataEditing]);
      return {
        async start() {
          calls.push(["start", options.allowMetadataEditing]);
        },
        async stop() {
          calls.push(["stop", options.allowMetadataEditing]);
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
  await manager.saveSettings({ allowMetadataEditing: true });

  assert.deepEqual(calls, [
    ["create", false],
    ["start", false],
    ["save", true],
    ["stop", false],
    ["create", true],
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

test("generated server manager accepts PBKDF2 password hashes for BasicAuth", async () => {
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
  const token = Buffer.from("editor:secret").toString("base64");
  const response = await fetch(`http://127.0.0.1:${started.port}/api/auth/status`, {
    headers: { Authorization: `Basic ${token}` },
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
