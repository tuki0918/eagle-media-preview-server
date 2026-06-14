import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type ServerStatus = "running" | "stopped" | "error";

export interface PluginSettings {
  autoStart: boolean;
  host: string;
  port: number;
  authEnabled: boolean;
  basicAuthUser: string;
  passwordHash: string;
  preferredLanAddress: string;
  lastServerStatus: ServerStatus;
}

export type SettingsInput = Partial<Omit<PluginSettings, "port">> & {
  port?: number | string;
  password?: string;
  confirmPassword?: string;
  [key: string]: unknown;
};

export interface SettingsStore {
  filePath?: string;
  load(): Promise<PluginSettings>;
  save(input?: SettingsInput): Promise<PluginSettings>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  autoStart: false,
  host: "0.0.0.0",
  port: 41532,
  authEnabled: false,
  basicAuthUser: "eagle",
  passwordHash: "",
  preferredLanAddress: "",
  lastServerStatus: "stopped",
};

export function defaultSettingsPath() {
  return join(homedir(), ".eagle-media-preview-server", "settings.json");
}

export function createSettingsStore({ filePath = defaultSettingsPath() }: { filePath?: string } = {}): SettingsStore {
  return {
    filePath,

    async load() {
      try {
        const raw = await readFile(filePath, "utf8");
        return normalizeSettings(JSON.parse(raw));
      } catch (error) {
        if (error.code === "ENOENT") return { ...DEFAULT_SETTINGS };
        throw error;
      }
    },

    async save(input: SettingsInput = {}) {
      const current = await this.load();
      const next = normalizeSettings({
        ...current,
        ...input,
      });

      if (input.password || input.confirmPassword) {
        if (String(input.password || "") !== String(input.confirmPassword || "")) {
          throw new Error("Password confirmation does not match");
        }
        if (!String(input.password || "").trim()) {
          throw new Error("Password is required");
        }
        next.passwordHash = hashPassword(String(input.password || ""));
      }

      if (next.authEnabled && !next.passwordHash) {
        throw new Error("Password is required when password protection is enabled");
      }
      if (!next.authEnabled) {
        next.passwordHash = "";
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      return next;
    },
  };
}

export function normalizeSettings(input: SettingsInput = {}): PluginSettings {
  const port = Number.parseInt(String(input.port ?? DEFAULT_SETTINGS.port), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("port must be an integer from 1-65535");
  }

  const lastServerStatus = input.lastServerStatus && ["running", "stopped", "error"].includes(input.lastServerStatus)
    ? input.lastServerStatus
    : DEFAULT_SETTINGS.lastServerStatus;

  return {
    autoStart: Boolean(input.autoStart ?? DEFAULT_SETTINGS.autoStart),
    host: String(input.host || DEFAULT_SETTINGS.host).trim() || DEFAULT_SETTINGS.host,
    port,
    authEnabled: Boolean(input.authEnabled ?? DEFAULT_SETTINGS.authEnabled),
    basicAuthUser: String(input.basicAuthUser || DEFAULT_SETTINGS.basicAuthUser).trim() || DEFAULT_SETTINGS.basicAuthUser,
    passwordHash: String(input.passwordHash || ""),
    preferredLanAddress: String(input.preferredLanAddress || ""),
    lastServerStatus,
  };
}

export function hashPassword(value: string | number) {
  return createHash("sha256").update(String(value)).digest("hex");
}
