import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
  assert.equal(normalizeSettings({}).sessionDurationDays, 7);
  assert.equal(normalizeSettings({}).settingsVersion, 2);
  assert.equal("requestLogEnabled" in normalizeSettings({ requestLogEnabled: false }), false);
  assert.equal("preferredLanAddress" in normalizeSettings({ preferredLanAddress: "192.168.1.50" }), false);
});

test("generated settings reject malformed port strings", () => {
  assert.throws(() => normalizeSettings({ port: "41532abc" }), /port must be an integer/);
  assert.throws(() => normalizeSettings({ port: "41532.5" }), /port must be an integer/);
});

test("generated settings reject invalid session duration values", () => {
  assert.equal(normalizeSettings({ sessionDurationDays: "14" }).sessionDurationDays, 14);
  assert.throws(() => normalizeSettings({ sessionDurationDays: "0" }), /sessionDurationDays must be an integer/);
  assert.throws(() => normalizeSettings({ sessionDurationDays: "1.5" }), /sessionDurationDays must be an integer/);
  assert.throws(() => normalizeSettings({ sessionDurationDays: "366" }), /sessionDurationDays must be an integer/);
});

test("generated runtime builds HTTPS access URLs when enabled", () => {
  assert.equal(buildAccessUrl({
    host: "127.0.0.1",
    httpsEnabled: true,
    port: 4443,
  }), "https://localhost:4443");
});

test("custom domains are normalized and validated as hostnames", () => {
  assert.equal(normalizeSettings({}).customDomain, "");
  assert.equal(normalizeSettings({ customDomain: " Windows-PC.LOCAL " }).customDomain, "windows-pc.local");
  assert.equal(normalizeSettings({ customDomain: "DESKTOP-ABC123" }).customDomain, "desktop-abc123");
  assert.equal(normalizeSettings({ customDomain: "メディア.example" }).customDomain, "xn--cckb1i8d.example");
  for (const customDomain of [
    "http://dummy.local", "dummy.local:41532", "dummy.local/path", "dummy.local?x=1",
    "dummy.local#hash", "user@dummy.local", "*.local", "dummy..local", "-dummy.local",
    "dummy_.local", "dummy.local\\path", "dummy%2elocal", "dummy local",
    `${"a".repeat(64)}.local`, Array(5).fill("a".repeat(63)).join("."),
  ]) {
    assert.throws(() => normalizeSettings({ customDomain }), /Hostname must be a hostname/, customDomain);
  }
});

test("custom domain access URLs use the configured protocol and port with automatic fallback", () => {
  const options = { host: "0.0.0.0", port: 41532, lanAddresses: [{ label: "eth0", address: "192.168.1.20" }] };
  assert.equal(buildAccessUrl({ ...options, customDomain: "DUMMY.local" }), "http://dummy.local:41532");
  assert.equal(buildAccessUrl({ ...options, customDomain: "media.example.com", httpsEnabled: true, port: 4443 }), "https://media.example.com:4443");
  assert.equal(buildAccessUrl({ ...options, customDomain: "" }), "http://192.168.1.20:41532");
  assert.equal(buildAccessUrl({ ...options, customDomain: "", host: "127.0.0.1" }), "http://localhost:41532");
});

test("settings persist, reject invalid changes, and clear custom domains", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-domain-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });
  await store.save({ customDomain: " DUMMY.LOCAL " });
  assert.equal((await store.load()).customDomain, "dummy.local");
  assert.equal(JSON.parse(await readFile(filePath, "utf8")).customDomain, "dummy.local");
  await assert.rejects(() => store.save({ customDomain: "https://other.local" }), /Hostname must be/);
  assert.equal((await store.load()).customDomain, "dummy.local");
  await store.save({ customDomain: "" });
  assert.equal((await store.load()).customDomain, "");
});

test("settings load falls back to no custom domain when the stored hostname is invalid", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-domain-invalid-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });
  await store.save({ port: 4321 });
  const stored = JSON.parse(await readFile(filePath, "utf8"));
  await writeFile(filePath, JSON.stringify({ ...stored, customDomain: "http://bad host:1/path" }));
  const loaded = await store.load();
  assert.equal(loaded.customDomain, "");
  assert.equal(loaded.port, 4321);
  await store.save({ customDomain: "fixed.local" });
  assert.equal((await store.load()).customDomain, "fixed.local");
  await assert.rejects(() => store.save({ customDomain: "bad host" }), /Hostname must be/);
});

test("server manager applies domain changes and removal to the listener and displayed URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-domain-manager-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  await store.save({ host: "0.0.0.0" });
  const calls: unknown[] = [];
  const manager = createServerManager({
    settingsStore: store,
    lanAddressProvider: () => [{ label: "eth0", address: "192.168.1.20" }],
    viewerServerFactory(options: { customDomain: string; host: string; port: number }) {
      calls.push(["create", options.customDomain, options.host]);
      return {
        async start() {},
        async stop() { calls.push(["stop", options.customDomain]); },
        status: () => ({ state: "running", host: options.host, port: options.port }),
      };
    },
  });
  try {
    assert.equal((await manager.start()).url, "http://192.168.1.20:41532");
    const saved = await manager.saveSettings({ customDomain: "dummy.local" });
    assert.equal(saved.url, "http://dummy.local:41532");
    assert.equal(saved.state, "running");
    const cleared = await manager.saveSettings({ customDomain: "" });
    assert.equal(cleared.url, "http://192.168.1.20:41532");
    assert.deepEqual(calls, [
      ["create", "", "0.0.0.0"], ["stop", ""],
      ["create", "dummy.local", "0.0.0.0"], ["stop", "dummy.local"],
      ["create", "", "0.0.0.0"],
    ]);
  } finally {
    await manager.stop();
  }
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
  assert.equal(raw.sessionDurationDays, 7);
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

test("generated settings store runs loads that migrate in the same queue as saves", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  // A legacy file: the first load migrates it and writes it back.
  await writeFile(filePath, JSON.stringify({ authEnabled: false, basicAuthUser: "legacy", port: 41532 }), "utf8");
  const store = createSettingsStore({ filePath });

  const saving = store.save({ autoStart: true });
  const migrating = store.load();
  const later = store.load();
  const [saved, loaded] = await Promise.all([saving, migrating, later]);
  assert.equal(saved.autoStart, true);
  // Loads queued after the save see it, and none of them writes the old settings back.
  assert.equal(loaded.autoStart, true);
  assert.equal(JSON.parse(await readFile(filePath, "utf8")).autoStart, true);
});

test("generated settings store keeps a hand-edited trustForwardedFor when the panel saves", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });
  assert.equal((await store.load()).trustForwardedFor, false);
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  await writeFile(filePath, JSON.stringify({ ...raw, trustForwardedFor: true }), "utf8");
  // The panel never sends the field, so a save leaves the hand-edited value alone.
  await store.save({ port: 41600 });
  assert.equal(JSON.parse(await readFile(filePath, "utf8")).trustForwardedFor, true);
});

test("generated settings store writes the upload limits and keeps hand-edited values when the panel saves", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });
  await store.load();
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(raw.uploadMaxSizeMB, 2048);
  assert.equal(raw.uploadTimeoutMinutes, 60);

  await writeFile(filePath, JSON.stringify({ ...raw, uploadMaxSizeMB: 500, uploadTimeoutMinutes: 180 }), "utf8");
  await store.save({ port: 41600 });
  const saved = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(saved.uploadMaxSizeMB, 500);
  assert.equal(saved.uploadTimeoutMinutes, 180);
});

test("a mistyped upload limit falls back to the default, and timeouts stop at their maximum", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const filePath = join(dir, "settings.json");
  const store = createSettingsStore({ filePath });
  await store.load();
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  await writeFile(filePath, JSON.stringify({ ...raw, uploadMaxSizeMB: "2g", uploadTimeoutMinutes: 100000 }), "utf8");
  const loaded = await store.load();
  assert.equal(loaded.uploadMaxSizeMB, 2048);
  assert.equal(loaded.uploadTimeoutMinutes, 24 * 60);
});

test("generated server manager gives the viewer server the upload limits in its own units", async () => {
  let options: Record<string, unknown> = {};
  const settings = { ...DEFAULT_SETTINGS, host: "127.0.0.1", port: 41532, uploadMaxSizeMB: 512, uploadTimeoutMinutes: 180 };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save() {
        return settings;
      },
    },
    viewerServerFactory(input: Record<string, unknown>) {
      options = input;
      return {
        async start() {},
        async stop() {},
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
  assert.equal(options.uploadMaxBytes, 512 * 1024 * 1024);
  assert.equal(options.uploadRequestTimeoutMs, 3 * 60 * 60 * 1000);
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

test("generated settings store validates HTTPS certificate files before enabling HTTPS", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  const certPath = join(dir, "cert.pem");
  const keyPath = join(dir, "key.pem");

  await assert.rejects(
    () => store.save({ httpsCertPath: certPath, httpsEnabled: true, httpsKeyPath: keyPath }),
    /HTTPS certificate file is not readable/i,
  );

  await writeFile(certPath, "not a certificate", "utf8");
  await writeFile(keyPath, "not a private key", "utf8");
  await assert.rejects(
    () => store.save({ httpsCertPath: certPath, httpsEnabled: true, httpsKeyPath: keyPath }),
    /valid TLS certificate/i,
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

test("generated server manager passes session duration and restarts when it changes", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    authEnabled: true,
    authUsers: [{ username: "reader", role: "viewer", passwordHash: hashPassword("secret") }],
    host: "127.0.0.1",
    port: 41532,
    sessionDurationDays: 7,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input: Record<string, unknown>) {
        settings = { ...settings, ...input };
        calls.push(["save", settings.sessionDurationDays]);
        return settings;
      },
    },
    viewerServerFactory(options: { sessionMaxAgeSeconds: number }) {
      calls.push(["create", options.sessionMaxAgeSeconds]);
      return {
        async start() {
          calls.push(["start", options.sessionMaxAgeSeconds]);
        },
        async stop() {
          calls.push(["stop", options.sessionMaxAgeSeconds]);
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
  await manager.saveSettings({ sessionDurationDays: 14 });

  assert.deepEqual(calls, [
    ["create", 7 * 24 * 60 * 60],
    ["start", 7 * 24 * 60 * 60],
    ["save", 14],
    ["stop", 7 * 24 * 60 * 60],
    ["create", 14 * 24 * 60 * 60],
    ["start", 14 * 24 * 60 * 60],
  ]);
});

test("generated server manager does not trust X-Forwarded-For by default and restarts when it is turned on", async () => {
  const calls: unknown[] = [];
  let settings = { ...DEFAULT_SETTINGS, host: "127.0.0.1", port: 41532 };
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
    viewerServerFactory(options: { trustForwardedFor?: boolean }) {
      calls.push(["create", options.trustForwardedFor]);
      return {
        async start() {},
        async stop() {
          calls.push(["stop", options.trustForwardedFor]);
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

  assert.equal(DEFAULT_SETTINGS.trustForwardedFor, false);
  await manager.start();
  await manager.saveSettings({ trustForwardedFor: true });
  assert.deepEqual(calls, [["create", false], ["stop", false], ["create", true]]);
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

test("generated server manager discards a failed viewer after its settings change", async () => {
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
      let viewerState = "stopped";
      calls.push(["create", options.port]);
      return {
        async start() {
          calls.push(["start", options.port]);
          if (options.port === 41532) {
            viewerState = "error";
            throw new Error("address already in use");
          }
          viewerState = "running";
        },
        async stop() {
          calls.push(["stop", options.port]);
          viewerState = "stopped";
        },
        status() {
          return { state: viewerState, host: options.host, port: options.port };
        },
      };
    },
    lanAddressProvider() {
      return [{ label: "lo0", address: "127.0.0.1" }];
    },
  });

  const failed = await manager.start();
  assert.equal(failed.state, "error");

  const saved = await manager.saveSettings({ port: 6123 });
  assert.equal(saved.state, "stopped");
  assert.equal(saved.port, 6123);
  assert.equal(saved.lastError, "");

  const started = await manager.start();
  assert.equal(started.state, "running");
  assert.equal(started.port, 6123);
  assert.deepEqual(calls, [
    ["create", 41532],
    ["start", 41532],
    ["save", 6123],
    ["stop", 41532],
    ["create", 6123],
    ["start", 6123],
  ]);
});

test("generated settings normalize shared libraries and keep protection off by default", () => {
  assert.equal(normalizeSettings({}).libraryProtectionEnabled, false);
  assert.deepEqual(normalizeSettings({}).sharedLibraries, []);
  assert.deepEqual(normalizeSettings({
    libraryProtectionEnabled: true,
    sharedLibraries: [
      { path: "/Users/me/Work.library/" },
      { path: "/Users/me/Work.library", name: "Duplicate" },
      "/Users/me/Photos.library",
      { path: "  " },
      null,
    ],
  }).sharedLibraries, [
    { path: "/Users/me/Work.library", name: "Work" },
    { path: "/Users/me/Photos.library", name: "Photos" },
  ]);
});

test("generated settings store keeps per-library users, dropping deleted users", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  const users = [
    { username: "alice", role: "viewer", passwordHash: hashPassword("a") },
    { username: "bob", role: "viewer", passwordHash: hashPassword("b") },
  ];
  await store.save({ authUsers: users, sharedLibraries: [{ path: "/L/Family.library", access: "selected", users: ["alice", "bob", "ghost"] }] });
  assert.deepEqual((await store.load()).sharedLibraries[0].users, ["alice", "bob"]);
  // Removing the last allowed users leaves the library limited to nobody, not open to everyone.
  const saved = await store.save({ authUsers: [{ username: "carol", role: "viewer", passwordHash: hashPassword("c") }] });
  assert.deepEqual(saved.sharedLibraries, [{ path: "/L/Family.library", name: "Family", access: "selected", users: [] }]);
});

test("generated server manager passes per-library users only with both protections on", async () => {
  const calls: unknown[] = [];
  let settings = {
    ...DEFAULT_SETTINGS,
    authEnabled: false,
    authUsers: [{ username: "alice", role: "viewer", passwordHash: hashPassword("a") }],
    libraryProtectionEnabled: true,
    sharedLibraries: [{ path: "/L/Family.library", name: "Family", access: "selected", users: ["alice"] }],
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
    viewerServerFactory(options: { libraryUserRules?: unknown }) {
      calls.push(options.libraryUserRules);
      return { async start() {}, async stop() {}, status: () => ({ state: "running", host: "127.0.0.1", port: 41532 }) };
    },
    lanAddressProvider: () => [],
  });
  await manager.start();
  await manager.saveSettings({ authEnabled: true });
  assert.deepEqual(calls, [[], [{ path: "/L/Family.library", users: ["alice"] }]]);
});

test("generated server manager passes shared libraries to the viewer when it starts", async () => {
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
        settings = normalizeSettings({ ...settings, ...input });
        return settings;
      },
    },
    viewerServerFactory(options: { sharedLibraries: string[] | null }) {
      calls.push(["create", options.sharedLibraries]);
      return {
        async start() {
          calls.push(["start"]);
        },
        async stop() {
          calls.push(["stop"]);
        },
        notifyLibraryChanged() {
          calls.push(["libraryChanged"]);
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

  await manager.saveSettings({ libraryProtectionEnabled: true, sharedLibraries: [{ path: "/Users/me/Work.library" }] });
  await manager.start();
  manager.libraryChanged();
  await manager.saveSettings({ sharedLibraries: [] });

  assert.deepEqual(calls, [
    ["create", ["/Users/me/Work.library"]],
    ["start"],
    ["libraryChanged"],
    ["stop"],
    ["create", []],
    ["start"],
  ]);
});

test("generated server manager lists libraries from Eagle's own settings and the open library", async () => {
  const root = await mkdtemp(join(tmpdir(), "eagle-libraries-"));
  const userData = join(root, "Eagle");
  const work = join(root, "Work.library");
  const open = join(root, "Private.library");
  const archived = join(root, "Archive", "Old.library");
  await Promise.all([mkdir(userData, { recursive: true }), mkdir(work), mkdir(open)]);
  await writeFile(join(userData, "Settings"), JSON.stringify({
    libraryHistory: [open, `${work}/`, join(root, "Deleted.library"), 42],
    pinterestAccessToken: "must-not-leak",
  }));
  const settings = normalizeSettings({
    libraryProtectionEnabled: true,
    sharedLibraries: [{ path: work }, { path: archived }],
  });
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save() {
        return settings;
      },
    },
    lanAddressProvider() {
      return [];
    },
  });

  const libraries = await manager.libraries({ current: { path: open, name: "Private" }, userDataPath: userData });

  assert.deepEqual(libraries, {
    current: { path: open, name: "Private" },
    items: [
      { path: work, name: "Work", current: false, shared: true },
      { path: archived, name: "Old", current: false, shared: true },
      { path: open, name: "Private", current: true, shared: false },
    ],
  });
  assert.equal(JSON.stringify(libraries).includes("must-not-leak"), false);
});

test("generated server manager still lists saved libraries without Eagle settings, unshared while protection is off", async () => {
  const settings = normalizeSettings({ sharedLibraries: [{ path: "/Users/me/Work.library" }] });
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save() {
        return settings;
      },
    },
    defaultEagleUserDataPath: () => join(tmpdir(), "missing-eagle-user-data"),
    lanAddressProvider() {
      return [];
    },
  });

  assert.deepEqual(await manager.libraries(), {
    current: null,
    items: [{ path: "/Users/me/Work.library", name: "Work", current: false, shared: false }],
  });
});

test("server manager starts and saves normally when the access log fails", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-broken-log-"));
  const { createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");
  const accessLog = createAccessLog({ filePath: join(dir, "access-log.jsonl") });
  accessLog.record = () => {
    throw new Error("log is broken");
  };
  const manager = createServerManager({
    accessLog,
    settingsStore: createSettingsStore({ filePath: join(dir, "settings.json") }),
    lanAddressProvider: () => [],
    viewerServerFactory: (options: { host: string; port: number }) => ({
      async start() {},
      async stop() {},
      status: () => ({ state: "running", host: options.host, port: options.port }),
    }),
  });
  const started = await manager.start();
  assert.equal(started.state, "running");
  assert.equal(started.lastError, "");
  assert.equal((await manager.saveSettings({ autoStart: true })).settings.autoStart, true);
});

test("server manager logs a library switch with the new library's id, running or not", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-switch-log-"));
  const { createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");
  const { libraryIdFor } = require("../../dist/.generated/plugin-service/libraryAccess.cjs");
  const { createViewerServer } = require("../../dist/.generated/plugin-service/viewerServer.cjs");
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  const manager = createServerManager({
    accessLog: createAccessLog({ filePath: join(dir, "access-log.jsonl") }),
    settingsStore: store,
    lanAddressProvider: () => [],
  });
  const switches = async () => (await manager.accessLogSummary({ range: "1h" })).recent
    .filter((entry: { event: string }) => entry.event === "library_changed")
    .map((entry: { libraryId?: string }) => entry.libraryId);
  const { sessionSecret } = await store.load();
  const idOf = (path: string) => libraryIdFor(path, sessionSecret);

  await manager.libraryChanged("/Users/me/B.library");
  assert.deepEqual(await switches(), [idOf("/Users/me/B.library")]);

  // The same id the viewer gets for that library, so the log lines up with what it reports.
  const viewer = createViewerServer({
    host: "127.0.0.1",
    port: 0,
    sessionSecret,
    eagleClient: {
      async appInfo() {
        return { version: "1.0.0" };
      },
      async libraryInfo() {
        return { path: "/Users/me/B.library", name: "B" };
      },
    },
  });
  await viewer.start();
  try {
    const health = await (await fetch(`http://127.0.0.1:${viewer.status().port}/api/health`)).json();
    assert.equal(health.library.id, idOf("/Users/me/B.library"));
  } finally {
    await viewer.stop();
  }
});

test("server manager asks Eagle to switch libraries and passes on a refusal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-switch-library-"));
  const { createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");
  const paths: string[] = [];
  let refusal = "";
  const manager = createServerManager({
    accessLog: createAccessLog({ filePath: join(dir, "access-log.jsonl") }),
    librarySwitcher: {
      async switchLibrary(libraryPath: string) {
        if (refusal) throw new Error(refusal);
        paths.push(libraryPath);
      },
    },
    settingsStore: createSettingsStore({ filePath: join(dir, "settings.json") }),
  });

  await manager.switchLibrary("/Users/me/B.library");
  assert.deepEqual(paths, ["/Users/me/B.library"]);
  refusal = "No such library";
  await assert.rejects(manager.switchLibrary("/Users/me/Missing.library"), /No such library/);
});

test("server manager logs which library is open when the server starts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-open-log-"));
  const { createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");
  const { libraryIdFor } = require("../../dist/.generated/plugin-service/libraryAccess.cjs");
  const { createViewerServer } = require("../../dist/.generated/plugin-service/viewerServer.cjs");
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  let eagleUp = true;
  const manager = createServerManager({
    accessLog: createAccessLog({ filePath: join(dir, "access-log.jsonl") }),
    settingsStore: store,
    lanAddressProvider: () => [],
    viewerServerFactory: (options: Record<string, unknown>) => createViewerServer({
      ...options,
      host: "127.0.0.1",
      port: 0,
      eagleClient: {
        async appInfo() {
          return { version: "1.0.0" };
        },
        async libraryInfo() {
          if (!eagleUp) throw new Error("Eagle is not running");
          return { path: "/Users/me/Work.library", name: "Work" };
        },
      },
    }),
  });
  const events = async () => (await manager.accessLogSummary({ range: "1h" })).recent
    .filter((entry: { type: string }) => entry.type === "system")
    .reverse()
    .map((entry: { event: string; libraryId?: string }) => [entry.event, entry.libraryId]);
  const { sessionSecret } = await store.load();
  try {
    assert.equal((await manager.start()).state, "running");
    const expected = [["server_start", undefined], ["library_open", libraryIdFor("/Users/me/Work.library", sessionSecret)]];
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    assert.deepEqual(await events(), expected);

    // Eagle not answering holds nothing up and logs no library.
    await manager.stop();
    eagleUp = false;
    assert.equal((await manager.start()).state, "running");
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    assert.deepEqual(await events(), [...expected, ["server_stop", undefined], ["server_start", undefined]]);
  } finally {
    await manager.stop();
  }
});

test("server manager logs a failed start with its reason", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-start-log-"));
  const { createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");
  const manager = createServerManager({
    accessLog: createAccessLog({ filePath: join(dir, "access-log.jsonl") }),
    settingsStore: createSettingsStore({ filePath: join(dir, "settings.json") }),
    lanAddressProvider: () => [],
    viewerServerFactory: () => ({
      async start() { throw new Error("port in use"); },
      async stop() {},
      status: () => ({ state: "stopped" }),
    }),
  });
  await manager.start();
  const { recent } = await manager.accessLogSummary({ range: "1h" });
  assert.deepEqual(recent.map((entry: { event: string; path?: string }) => [entry.event, entry.path]), [["server_start_failed", "port in use"]]);
});

test("server manager blocks addresses live without a restart and keeps the access log after stop", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-block-manager-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  const { createAccessLog } = require("../../dist/.generated/plugin-service/accessLog.cjs");
  const accessLog = createAccessLog({ filePath: join(dir, "access-log.jsonl") });
  const calls: unknown[] = [];
  const manager = createServerManager({
    accessLog,
    settingsStore: store,
    lanAddressProvider: () => [],
    viewerServerFactory(options: { blockedAddresses: Array<{ address: string }>; host: string; port: number }) {
      calls.push(["create", options.blockedAddresses.map((entry) => entry.address)]);
      return {
        async start() {},
        async stop() { calls.push(["stop"]); },
        setBlockedAddresses(next: Array<{ address: string }>) { calls.push(["live", next.map((entry) => entry.address)]); },
        status: () => ({ state: "running", host: options.host, port: options.port }),
      };
    },
  });
  await manager.start();
  const blocked = await manager.blockAddress("192.168.1.50");
  assert.deepEqual(blocked.settings.blockedAddresses.map((entry: { address: string }) => entry.address), ["192.168.1.50"]);
  await assert.rejects(manager.blockAddress("127.0.0.1"), /Loopback/);
  const unblocked = await manager.unblockAddress("192.168.1.50");
  assert.deepEqual(unblocked.settings.blockedAddresses, []);
  assert.deepEqual(calls, [["create", []], ["live", ["192.168.1.50"]], ["live", []]]);
  // A settings save alongside a block change keeps both.
  await Promise.all([manager.blockAddress("192.168.1.70"), manager.saveSettings({ autoStart: true })]);
  const both = await store.load();
  assert.equal(both.autoStart, true);
  assert.deepEqual(both.blockedAddresses.map((entry: { address: string }) => entry.address), ["192.168.1.70"]);
  await manager.unblockAddress("192.168.1.70");
  await manager.saveSettings({ autoStart: false });
  // Two changes at once both land: each starts from the list the previous one saved.
  await Promise.all([manager.blockAddress("192.168.1.60"), manager.blockAddress("192.168.1.61")]);
  assert.deepEqual((await store.load()).blockedAddresses.map((entry: { address: string }) => entry.address), ["192.168.1.60", "192.168.1.61"]);
  await Promise.all([manager.unblockAddress("192.168.1.60"), manager.unblockAddress("192.168.1.61")]);
  assert.deepEqual((await store.load()).blockedAddresses, []);

  accessLog.record({ type: "view", event: "view", ip: "192.168.1.20" });
  await manager.stop();
  const summary = await manager.accessLogSummary({ range: "1h" });
  assert.equal(summary.recent.filter((entry: { type: string }) => entry.type === "view").length, 1);
  assert.equal(manager.accessLogConnectedCount(), 1);
  // Oldest first: what the admin did to the server, by field name and never by value.
  const events = summary.recent.filter((entry: { type: string }) => entry.type === "system").reverse();
  assert.deepEqual(events.map((entry: { event: string; path?: string; fields?: string[] }) => [entry.event, entry.path ?? entry.fields?.join(" ")]), [
    ["server_start", undefined],
    ["address_blocked", "192.168.1.50"],
    ["address_unblocked", "192.168.1.50"],
    ["address_blocked", "192.168.1.70"],
    ["settings_changed", "autoStart"],
    ["address_unblocked", "192.168.1.70"],
    ["settings_changed", "autoStart"],
    ["address_blocked", "192.168.1.60"],
    ["address_blocked", "192.168.1.61"],
    ["address_unblocked", "192.168.1.60"],
    ["address_unblocked", "192.168.1.61"],
    ["server_stop", undefined],
  ]);
  await manager.clearAccessLog();
  assert.deepEqual((await manager.accessLogSummary({ range: "1h" })).recent.map((entry: { event: string }) => entry.event), ["log_cleared"]);
});

test("settings keep canUpload only on editors, and leave it off users that don't have it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });
  const saved = await store.save({
    authEnabled: true,
    authUsers: [
      { username: "editor", role: "editor", passwordHash: "h", canUpload: true },
      { username: "plain", role: "editor", passwordHash: "h" },
      { username: "viewer", role: "viewer", passwordHash: "h", canUpload: true },
      { username: "admin", role: "admin", passwordHash: "h", canUpload: true },
    ],
  });
  assert.deepEqual(saved.authUsers.map((user: { canUpload?: boolean }) => user.canUpload), [true, undefined, undefined, undefined]);
  assert.equal("canUpload" in saved.authUsers[1], false);
});
