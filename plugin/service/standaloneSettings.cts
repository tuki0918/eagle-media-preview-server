import { createHmac, randomBytes } from "node:crypto";
import { SettingsValidationError, type PluginSettings, type SettingsInput } from "./runtime.cjs";

const { libraryPathKey } = require("./libraryAccess.cjs");
const { expandPath } = require("./standaloneConfig.cjs");

type SettingsFields = Pick<PluginSettings,
  "authEnabled" | "autoStart" | "customDomain" | "experimentalSort" | "host" | "httpsCertPath" | "httpsEnabled" |
  "httpsKeyPath" | "libraryProtectionEnabled" | "port" | "sessionDurationDays" | "sharedLibraries">;

type PanelUser = Omit<PluginSettings["authUsers"][number], "passwordHash"> & { hasPassword: boolean };
export interface PanelSettings {
  revision: string;
  settings: SettingsFields & { authUsers: PanelUser[] };
  libraries: Array<{ id: string; name: string; path: string; current: false; shared: boolean }>;
}

const booleanFields = ["authEnabled", "autoStart", "experimentalSort", "httpsEnabled", "libraryProtectionEnabled"] as const;
const stringFields = ["customDomain", "host", "httpsCertPath", "httpsKeyPath"] as const;
const numberFields = ["port", "sessionDurationDays"] as const;

const editableFields = [...booleanFields, ...stringFields, ...numberFields, "sharedLibraries"] as const;
const revisionKey = randomBytes(32);

export function panelSettingsRevision(settings: PluginSettings) {
  // Compare the editable settings, including any password updates, without exposing the hashes.
  const values = [...editableFields.map((field) => settings[field]), settings.authUsers];
  return createHmac("sha256", revisionKey).update(JSON.stringify(values)).digest("base64url");
}

export function panelSettings(
  settings: PluginSettings,
  configuredLibraries: Array<{ name: string; path: string }>,
): PanelSettings {
  const selected = Object.fromEntries(editableFields.map((field) => [field, settings[field]])) as SettingsFields;
  const shared = new Set(settings.sharedLibraries.map(({ path }) => libraryPathKey(path)));
  const libraries = new Map<string, PanelSettings["libraries"][number]>();
  for (const library of [...settings.sharedLibraries, ...configuredLibraries]) {
    const id: string = libraryPathKey(library.path);
    if (!libraries.has(id)) {
      libraries.set(id, { name: library.name, path: library.path, id, current: false, shared: shared.has(id) });
    }
  }
  return {
    revision: panelSettingsRevision(settings),
    settings: {
      ...selected,
      authUsers: settings.authUsers.map(({ passwordHash, ...user }) => ({ ...user, hasPassword: Boolean(passwordHash) })),
    },
    libraries: [...libraries.values()],
  };
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SettingsValidationError(message);
  return value as Record<string, unknown>;
}

export type PanelSettingSwitch = "authEnabled" | "autoStart" | "host" | "httpsEnabled";

export function settingsSwitchPatch(field: unknown, checked: unknown): SettingsInput {
  if (typeof checked !== "boolean") throw new SettingsValidationError("Switch needs a boolean value");
  switch (field) {
    case "host": return { host: checked ? "0.0.0.0" : "127.0.0.1" };
    case "authEnabled": return { authEnabled: checked };
    case "autoStart": return { autoStart: checked };
    case "httpsEnabled": return { httpsEnabled: checked };
    default: throw new SettingsValidationError("Unknown settings switch");
  }
}

export function settingsPatch(value: unknown, current: PluginSettings): SettingsInput {
  const payload = object(value, "Settings must be a JSON object");
  const patch: SettingsInput = {};
  for (const key of booleanFields) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== "boolean") throw new SettingsValidationError(`${key} must be a boolean`);
    patch[key] = payload[key];
  }
  for (const key of stringFields) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== "string") throw new SettingsValidationError(`${key} must be text`);
    patch[key] = payload[key];
  }
  for (const key of numberFields) {
    if (payload[key] === undefined) continue;
    const number = payload[key];
    if (typeof number !== "number" && (typeof number !== "string" || !/^\d+$/.test(number.trim()))) {
      throw new SettingsValidationError(`${key} must be an integer`);
    }
    patch[key] = Number(number);
  }
  if (payload.authUsers !== undefined) {
    if (!Array.isArray(payload.authUsers)) throw new SettingsValidationError("Users must be a list");
    const existing = new Map(current.authUsers.map((user) => [user.username, user.passwordHash]));
    const passwords: Array<[string, string]> = [];
    patch.authUsers = payload.authUsers.map((value: unknown) => {
      const user = object(value, "Each user needs a username");
      const username = typeof user.username === "string" ? user.username.trim() : "";
      const previous = typeof user.rowKey === "string" ? user.rowKey : username;
      if (typeof user.password === "string" && user.password.trim()) passwords.push([username, user.password]);
      const role = user.role === "admin" || user.role === "editor" ? user.role : "viewer";
      return { username, role, canUpload: user.canUpload === true, passwordHash: existing.get(previous) || "" };
    });
    patch.userPasswords = Object.fromEntries(passwords);
    // The legacy top-level credential must not bring a deleted user back.
    patch.passwordHash = "";
  }
  if (payload.sharedLibraries !== undefined) {
    if (!Array.isArray(payload.sharedLibraries)) throw new SettingsValidationError("Shared libraries must be a list");
    patch.sharedLibraries = payload.sharedLibraries.map((value: unknown) => {
      const library = object(value, "Each shared library needs a path");
      if (typeof library.path !== "string" || !library.path.trim()) throw new SettingsValidationError("Each shared library needs a path");
      return {
        path: expandPath(library.path),
        name: typeof library.name === "string" ? library.name : "",
        ...(library.access === "selected" ? {
          access: "selected" as const,
          users: Array.isArray(library.users) ? library.users.filter((user): user is string => typeof user === "string") : [],
        } : {}),
      };
    });
  }
  return patch;
}
