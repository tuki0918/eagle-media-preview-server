export interface ServerRestartSettings {
  customDomain?: unknown;
  authEnabled?: unknown;
  authUsers?: unknown;
  autoStart?: unknown;
  host?: unknown;
  httpsCertPath?: unknown;
  httpsEnabled?: unknown;
  httpsKeyPath?: unknown;
  libraryProtectionEnabled?: unknown;
  port?: unknown;
  sessionDurationDays?: unknown;
  sharedLibraries?: unknown;
}

export type SettingsPatch = Record<string, unknown>;

export function settingsPayloadChanged(current: ServerRestartSettings | undefined, nextSettings: SettingsPatch) {
  if (!current) return true;
  if (Boolean(nextSettings.autoStart ?? current.autoStart) !== Boolean(current.autoStart)) return true;
  return serverSettingsChanged(current, nextSettings);
}

export function serverSettingsChanged(current: ServerRestartSettings, nextSettings: SettingsPatch) {
  if (librarySettingsChanged(current, nextSettings)) return true;
  if ((nextSettings.customDomain ?? current.customDomain ?? "") !== (current.customDomain ?? "")) return true;
  if ((nextSettings.host ?? current.host) !== current.host) return true;
  if (Boolean(nextSettings.httpsEnabled ?? current.httpsEnabled) !== Boolean(current.httpsEnabled)) return true;
  if ((nextSettings.httpsCertPath ?? current.httpsCertPath ?? "") !== (current.httpsCertPath ?? "")) return true;
  if ((nextSettings.httpsKeyPath ?? current.httpsKeyPath ?? "") !== (current.httpsKeyPath ?? "")) return true;
  if (Number(nextSettings.port ?? current.port) !== Number(current.port)) return true;
  if (Number(nextSettings.sessionDurationDays ?? current.sessionDurationDays ?? 7) !== Number(current.sessionDurationDays ?? 7)) return true;
  if (Boolean(nextSettings.authEnabled ?? current.authEnabled) !== Boolean(current.authEnabled)) return true;
  if (JSON.stringify(nextSettings.authUsers ?? current.authUsers ?? []) !== JSON.stringify(current.authUsers ?? [])) return true;
  return false;
}

export function serverRestartSettingsChanged(current: ServerRestartSettings, nextSettings: SettingsPatch) {
  if (librarySettingsChanged(current, nextSettings)) return true;
  if ((nextSettings.customDomain ?? current.customDomain ?? "") !== (current.customDomain ?? "")) return true;
  const currentAuthEnabled = Boolean(current.authEnabled);
  const nextAuthEnabled = Boolean(nextSettings.authEnabled ?? current.authEnabled);
  if ((nextSettings.host ?? current.host) !== current.host) return true;
  if (Boolean(nextSettings.httpsEnabled ?? current.httpsEnabled) !== Boolean(current.httpsEnabled)) return true;
  if ((nextSettings.httpsCertPath ?? current.httpsCertPath ?? "") !== (current.httpsCertPath ?? "")) return true;
  if ((nextSettings.httpsKeyPath ?? current.httpsKeyPath ?? "") !== (current.httpsKeyPath ?? "")) return true;
  if (Number(nextSettings.port ?? current.port) !== Number(current.port)) return true;
  if (Number(nextSettings.sessionDurationDays ?? current.sessionDurationDays ?? 7) !== Number(current.sessionDurationDays ?? 7)) return true;
  if (nextAuthEnabled !== currentAuthEnabled) return true;
  if (!currentAuthEnabled && !nextAuthEnabled) return false;
  if (hasPasswordUpdates(nextSettings.userPasswords)) return true;
  if (JSON.stringify(nextSettings.authUsers ?? current.authUsers ?? []) !== JSON.stringify(current.authUsers ?? [])) return true;
  return false;
}

// The shared-library list is read when the server starts, so changing it needs a restart.
function librarySettingsChanged(current: ServerRestartSettings, nextSettings: SettingsPatch) {
  if (Boolean(nextSettings.libraryProtectionEnabled ?? current.libraryProtectionEnabled) !== Boolean(current.libraryProtectionEnabled)) return true;
  return JSON.stringify(nextSettings.sharedLibraries ?? current.sharedLibraries ?? []) !== JSON.stringify(current.sharedLibraries ?? []);
}

function hasPasswordUpdates(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length);
}
