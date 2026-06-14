import { test } from "vitest";
import assert from "node:assert/strict";
import { createServerManager, type ManagedViewerServer } from "./serverManager.js";
import { DEFAULT_SETTINGS, normalizeSettings, type PluginSettings, type SettingsInput } from "./settingsStore.js";

const testSettings = (overrides: SettingsInput = {}): PluginSettings => normalizeSettings({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

test("server manager starts, stops, and reports access URL", async () => {
  const calls: unknown[][] = [];
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return testSettings({
          host: "0.0.0.0",
          port: 41532,
          passwordHash: "",
          preferredLanAddress: "192.168.1.50",
          lastServerStatus: "stopped",
        });
      },
      async save(value: SettingsInput = {}) {
        calls.push(["save", value]);
        return testSettings(value);
      },
    },
    createViewerServer(): ManagedViewerServer {
      calls.push(["create"]);
      return {
        async start() {
          calls.push(["start"]);
          return this.status();
        },
        async stop() {
          calls.push(["stop"]);
          return this.status();
        },
        status() {
          return { state: "running", host: "0.0.0.0", port: 41532, requestCount: 2 };
        },
      };
    },
    getLanAddresses() {
      return [{ address: "192.168.1.50", label: "en0" }];
    },
  });

  const started = await manager.start();
  assert.equal(started.state, "running");
  assert.equal(started.url, "http://192.168.1.50:41532");

  await manager.stop();
  assert.deepEqual(calls.map(([name]) => name), ["create", "start", "stop"]);
});

test("server manager reports localhost URL when public network is disabled", async () => {
  const manager = createServerManager({
    settingsStore: {
      async load() {
        return testSettings({
          host: "127.0.0.1",
          port: 41532,
          passwordHash: "",
          preferredLanAddress: "",
          lastServerStatus: "stopped",
        });
      },
      async save(value: SettingsInput = {}) {
        return testSettings(value);
      },
    },
    createViewerServer() {
      return {
        async start() {
          return this.status();
        },
        async stop() {
          return this.status();
        },
        status() {
          return { state: "running", host: "127.0.0.1", port: 41532, requestCount: 0 };
        },
      };
    },
    getLanAddresses() {
      return [{ address: "192.168.1.50", label: "en0" }];
    },
  });

  const status = await manager.status();
  assert.equal(status.url, "http://localhost:41532");
});

test("server manager restarts after saving binding settings while running", async () => {
  const calls: unknown[][] = [];
  let settings = testSettings({
    autoStart: false,
    host: "0.0.0.0",
    port: 41532,
    authEnabled: false,
    passwordHash: "",
    preferredLanAddress: "192.168.1.50",
    lastServerStatus: "stopped",
  });

  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(next: SettingsInput = {}) {
        settings = testSettings({ ...settings, ...next });
        calls.push(["save", settings.port]);
        return settings;
      },
    },
    createViewerServer(options) {
      calls.push(["create", options.port]);
      return {
        async start() {
          calls.push(["start", options.port]);
          return this.status();
        },
        async stop() {
          calls.push(["stop", options.port]);
          return this.status();
        },
        status() {
          return { state: "running", host: options.host, port: options.port, requestCount: 0 };
        },
      };
    },
    getLanAddresses() {
      return [{ address: "192.168.1.50", label: "en0" }];
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

test("server manager does not restart when only auto start changes while running", async () => {
  const calls: unknown[][] = [];
  let settings = testSettings({
    autoStart: false,
    host: "0.0.0.0",
    port: 41532,
    authEnabled: false,
    basicAuthUser: "eagle",
    passwordHash: "",
    preferredLanAddress: "",
    lastServerStatus: "stopped",
  });

  const manager = createServerManager({
    settingsStore: {
      async load() {
        return settings;
      },
      async save(next: SettingsInput = {}) {
        settings = testSettings({ ...settings, ...next });
        calls.push(["save", settings.autoStart]);
        return settings;
      },
    },
    createViewerServer() {
      calls.push(["create"]);
      return {
        async start() {
          calls.push(["start"]);
          return this.status();
        },
        async stop() {
          calls.push(["stop"]);
          return this.status();
        },
        status() {
          return { state: "running", host: "0.0.0.0", port: 41532, requestCount: 0 };
        },
      };
    },
  });

  await manager.start();
  const snapshot = await manager.saveSettings({ autoStart: true });

  assert.equal(snapshot.settings.autoStart, true);
  assert.deepEqual(calls, [
    ["create"],
    ["start"],
    ["save", true],
  ]);
});
