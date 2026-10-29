export type ServerState = "error" | "running" | "stopped";
export type SettingsTab = "access" | "general" | "libraries" | "security";
export type UserRole = "admin" | "editor" | "viewer";

export interface AuthUser {
  passwordHash?: string;
  role?: UserRole;
  username?: string;
}

export interface SharedLibrary {
  name: string;
  path: string;
}

export interface LibraryCandidate extends SharedLibrary {
  current: boolean;
  /** Shared by the saved settings (unsaved checkbox edits do not count). */
  shared: boolean;
}

export interface LibraryList {
  current: SharedLibrary | null;
  items: LibraryCandidate[];
}

export interface PluginSettings {
  customDomain?: string;
  allowMetadataEditing?: boolean;
  authUsers?: AuthUser[];
  authEnabled?: boolean;
  autoStart?: boolean;
  basicAuthUser?: string;
  host?: string;
  httpsCertPath?: string;
  httpsEnabled?: boolean;
  httpsKeyPath?: string;
  libraryProtectionEnabled?: boolean;
  passwordHash?: string;
  port?: number | string;
  sessionDurationDays?: number | string;
  sharedLibraries?: SharedLibrary[];
}

export interface PluginStatus {
  lastError?: string;
  settings?: PluginSettings;
  state?: ServerState | string;
  url?: string;
}
