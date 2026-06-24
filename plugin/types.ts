export type ServerState = "error" | "running" | "stopped";
export type SettingsTab = "access" | "general" | "security";
export type UserRole = "admin" | "editor" | "viewer";

export interface AuthUser {
  passwordHash?: string;
  role?: UserRole;
  username?: string;
}

export interface PluginSettings {
  allowMetadataEditing?: boolean;
  authUsers?: AuthUser[];
  authEnabled?: boolean;
  autoStart?: boolean;
  basicAuthUser?: string;
  host?: string;
  httpsCertPath?: string;
  httpsEnabled?: boolean;
  httpsKeyPath?: string;
  passwordHash?: string;
  port?: number | string;
  sessionDurationDays?: number | string;
}

export interface PluginStatus {
  lastError?: string;
  settings?: PluginSettings;
  state?: ServerState | string;
  url?: string;
}
