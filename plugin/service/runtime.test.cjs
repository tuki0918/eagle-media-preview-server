const assert = require("node:assert/strict");
const { mkdtemp } = require("fs").promises;
const { join } = require("path");
const { tmpdir } = require("os");
const {
  DEFAULT_SETTINGS,
  createServerManager,
  createSettingsStore,
  hashPassword,
  normalizeSettings,
} = require("./runtime.cjs");

test("CommonJS runtime loads with require for Eagle plugin windows", () => {
  assert.equal(normalizeSettings({}).port, DEFAULT_SETTINGS.port);
  assert.equal("requestLogEnabled" in normalizeSettings({ requestLogEnabled: false }), false);
});

test("CommonJS settings store uses the product settings directory by default", () => {
  const store = createSettingsStore();
  assert.match(store.filePath, /[\\/]\.eagle-media-preview-server[\\/]settings\.json$/);
  assert.equal(store.filePath.includes(".eagle-api-viewer-plugin"), false);
});

test("CommonJS settings store hashes password", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eagle-plugin-runtime-"));
  const store = createSettingsStore({ filePath: join(dir, "settings.json") });

  const saved = await store.save({
    authEnabled: true,
    password: "secret",
    confirmPassword: "secret",
  });

  assert.equal(saved.passwordHash, hashPassword("secret"));
});

test("CommonJS server manager can start and stop a viewer server", async () => {
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
      async save(input) {
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

test("CommonJS server manager reports localhost URL when public network is disabled", async () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    host: "127.0.0.1",
    port: 41532,
  };
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(input) {
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

test("CommonJS server manager does not restart when only auto start changes while running", async () => {
  const calls = [];
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
      async save(input) {
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
