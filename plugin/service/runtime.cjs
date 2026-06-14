"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const { mkdir, readFile, writeFile } = require("fs").promises;
const { createHash } = require("crypto");
const { dirname, join } = require("path");
const { homedir, networkInterfaces } = require("os");
const { createViewerServer } = require("./viewerServer.cjs");
const DEFAULT_SETTINGS = {
    autoStart: false,
    host: "0.0.0.0",
    port: 41532,
    authEnabled: false,
    basicAuthUser: "eagle",
    passwordHash: "",
    preferredLanAddress: "",
    lastServerStatus: "stopped",
};
function defaultSettingsPath() {
    return join(homedir(), ".eagle-media-preview-server", "settings.json");
}
function createSettingsStore({ filePath = defaultSettingsPath() } = {}) {
    return {
        filePath,
        async load() {
            try {
                const raw = await readFile(filePath, "utf8");
                return normalizeSettings(JSON.parse(raw));
            }
            catch (error) {
                if (error.code === "ENOENT")
                    return { ...DEFAULT_SETTINGS };
                throw error;
            }
        },
        async save(input = {}) {
            const current = await this.load();
            const next = normalizeSettings({ ...current, ...input });
            if (input.password || input.confirmPassword) {
                if (String(input.password || "") !== String(input.confirmPassword || "")) {
                    throw new Error("Password confirmation does not match");
                }
                if (!String(input.password || "").trim())
                    throw new Error("Password is required");
                next.passwordHash = hashPassword(input.password);
            }
            if (next.authEnabled && !next.passwordHash) {
                throw new Error("Password is required when password protection is enabled");
            }
            if (!next.authEnabled)
                next.passwordHash = "";
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
            return next;
        },
    };
}
function normalizeSettings(input = {}) {
    const port = Number.parseInt(input.port ?? DEFAULT_SETTINGS.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("port must be an integer from 1-65535");
    }
    return {
        autoStart: Boolean(input.autoStart ?? DEFAULT_SETTINGS.autoStart),
        host: String(input.host || DEFAULT_SETTINGS.host).trim() || DEFAULT_SETTINGS.host,
        port,
        authEnabled: Boolean(input.authEnabled ?? DEFAULT_SETTINGS.authEnabled),
        basicAuthUser: String(input.basicAuthUser || DEFAULT_SETTINGS.basicAuthUser).trim() || DEFAULT_SETTINGS.basicAuthUser,
        passwordHash: String(input.passwordHash || ""),
        preferredLanAddress: String(input.preferredLanAddress || ""),
        lastServerStatus: ["running", "stopped", "error"].includes(input.lastServerStatus)
            ? input.lastServerStatus
            : DEFAULT_SETTINGS.lastServerStatus,
    };
}
function hashPassword(value) {
    return createHash("sha256").update(String(value)).digest("hex");
}
function getLanAddresses() {
    const output = [];
    for (const [label, entries] of Object.entries(networkInterfaces())) {
        for (const entry of entries || []) {
            if (entry.family === "IPv4" && !entry.internal)
                output.push({ label, address: entry.address });
        }
    }
    return output;
}
function buildAccessUrl({ host = "0.0.0.0", port = 41532, preferredLanAddress = "", lanAddresses = [] } = {}) {
    const address = selectLanAddress({ preferredLanAddress, lanAddresses, host });
    return `http://${address}:${port}`;
}
function selectLanAddress({ preferredLanAddress = "", lanAddresses = [], host = "0.0.0.0" } = {}) {
    if (preferredLanAddress && lanAddresses.some((entry) => entry.address === preferredLanAddress))
        return preferredLanAddress;
    if (host === "127.0.0.1" || host === "localhost")
        return "localhost";
    if (host && host !== "0.0.0.0")
        return host;
    if (lanAddresses[0]?.address)
        return lanAddresses[0].address;
    return "localhost";
}
function createServerManager({ settingsStore = createSettingsStore(), viewerServerFactory = createViewerServer, lanAddressProvider = getLanAddresses, } = {}) {
    let viewer = null;
    let stateOverride = "stopped";
    let lastError = "";
    async function snapshot(settings = null) {
        const loadedSettings = settings || await settingsStore.load();
        const lanAddresses = lanAddressProvider();
        const status = viewer ? viewer.status() : {
            state: stateOverride,
            host: loadedSettings.host,
            port: loadedSettings.port,
            lastError,
        };
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
    async function createViewer(settings) {
        return viewerServerFactory({
            host: settings.host,
            port: settings.port,
            basicAuthUsername: settings.basicAuthUser,
            passwordHash: settings.authEnabled ? settings.passwordHash : "",
        });
    }
    function needsServerRestart(prev, next) {
        return prev.host !== next.host
            || prev.port !== next.port
            || prev.authEnabled !== next.authEnabled
            || prev.basicAuthUser !== next.basicAuthUser
            || prev.passwordHash !== next.passwordHash;
    }
    return {
        async init() {
            const settings = await settingsStore.load();
            if (settings.autoStart)
                return this.start();
            return snapshot(settings);
        },
        async start() {
            const settings = await settingsStore.load();
            if (!viewer)
                viewer = await createViewer(settings);
            try {
                await viewer.start();
                stateOverride = "running";
                lastError = "";
            }
            catch (error) {
                stateOverride = "error";
                lastError = error.message || String(error);
            }
            return snapshot(settings);
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
        async saveSettings(input) {
            const wasRunning = viewer?.status().state === "running";
            const current = await settingsStore.load();
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
module.exports = {
    DEFAULT_SETTINGS,
    buildAccessUrl,
    createServerManager,
    createSettingsStore,
    getLanAddresses,
    hashPassword,
    normalizeSettings,
};
