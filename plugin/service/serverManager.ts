import { createViewerServer as defaultCreateViewerServer } from "../../server/viewerServer.js";
import { createSettingsStore, type PluginSettings, type SettingsInput, type SettingsStore } from "./settingsStore.js";
import { buildAccessUrl } from "./qrUrlBuilder.js";
import { getLanAddresses as defaultGetLanAddresses } from "./networkInfo.js";
import type { LanAddress } from "./qrUrlBuilder.js";

export interface ViewerServerStatus {
  state: string;
  host: string;
  port: number;
  requestCount?: number;
  lastError?: string;
}

export interface ManagedViewerServer {
  start(): Promise<ViewerServerStatus>;
  stop(): Promise<ViewerServerStatus>;
  status(): ViewerServerStatus;
}

export interface ServerManagerOptions {
  settingsStore?: SettingsStore;
  createViewerServer?: (options: {
    host: string;
    port: number;
    basicAuthUsername: string;
    passwordHash: string;
  }) => ManagedViewerServer;
  getLanAddresses?: () => LanAddress[];
}

export function createServerManager({
  settingsStore = createSettingsStore(),
  createViewerServer = defaultCreateViewerServer,
  getLanAddresses = defaultGetLanAddresses,
}: ServerManagerOptions = {}) {
  let viewer: ManagedViewerServer | null = null;
  let stateOverride = "stopped";
  let lastError = "";

  async function currentSettings() {
    return settingsStore.load();
  }

  async function createViewer(settings: PluginSettings) {
    return createViewerServer({
      host: settings.host,
      port: settings.port,
      basicAuthUsername: settings.basicAuthUser,
      passwordHash: settings.authEnabled ? settings.passwordHash : "",
    });
  }

  function needsServerRestart(prev: PluginSettings, next: PluginSettings) {
    return prev.host !== next.host
      || prev.port !== next.port
      || prev.authEnabled !== next.authEnabled
      || prev.basicAuthUser !== next.basicAuthUser
      || prev.passwordHash !== next.passwordHash;
  }

  async function snapshot(settings: PluginSettings | null = null) {
    const loadedSettings = settings || await currentSettings();
    const lanAddresses = getLanAddresses();
    const status = viewer ? viewer.status() : { state: stateOverride, host: loadedSettings.host, port: loadedSettings.port, lastError };
    return {
      ...status,
      settings: loadedSettings,
      lanAddresses,
      url: buildAccessUrl({
        host: loadedSettings.host,
        port: status.port || loadedSettings.port,
        preferredLanAddress: loadedSettings.preferredLanAddress,
        lanAddresses,
      }),
      lastError: status.lastError || lastError,
    };
  }

  return {
    async init() {
      const settings = await currentSettings();
      if (settings.autoStart) {
        return this.start();
      }
      return snapshot(settings);
    },

    async start() {
      const settings = await currentSettings();
      if (!viewer) viewer = await createViewer(settings);
      try {
        await viewer.start();
        stateOverride = "running";
        lastError = "";
        return snapshot(settings);
      } catch (error) {
        stateOverride = "error";
        lastError = error.message || String(error);
        return snapshot(settings);
      }
    },

    async stop() {
      if (viewer) {
        await viewer.stop();
        viewer = null;
      }
      stateOverride = "stopped";
      return snapshot();
    },

    async restart() {
      await this.stop();
      return this.start();
    },

    async saveSettings(input: SettingsInput) {
      const wasRunning = viewer?.status().state === "running";
      const current = await currentSettings();
      const settings = await settingsStore.save(input);
      if (wasRunning && needsServerRestart(current, settings)) {
        await this.stop();
        return this.start();
      }
      return snapshot(settings);
    },

    async status() {
      return snapshot();
    },
  };
}
