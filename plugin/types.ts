export type ServerState = "error" | "running" | "stopped";
export type SettingsTab = "access" | "general" | "libraries" | "security";
export type UserRole = "admin" | "editor" | "viewer";

export interface AuthUser {
  /**
   * Panel-only, never saved: identifies this row while it is being edited, so per-library access
   * follows the row rather than whatever name is typed. Defaults to the saved username.
   */
  rowKey?: string;
  /** Editors only: admins can always upload and viewers never can. */
  canUpload?: boolean;
  passwordHash?: string;
  role?: UserRole;
  username?: string;
}

export interface SharedLibrary {
  /**
   * "selected" limits the library to `users` (an empty list means only admins); absent means every
   * user. While settings are being edited, `users` holds row keys; they become usernames on save.
   */
  access?: "selected";
  name: string;
  path: string;
  users?: string[];
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

export interface BlockedAddress {
  address: string;
  addedAt: number;
}

export interface PluginSettings {
  blockedAddresses?: BlockedAddress[];
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
  /** Believe X-Forwarded-For from a proxy on this machine; off by default. */
  trustForwardedFor?: boolean;
  sharedLibraries?: SharedLibrary[];
}

export interface PluginStatus {
  lastError?: string;
  settings?: PluginSettings;
  state?: ServerState | string;
  url?: string;
}

export type AccessLogRange = "1h" | "24h" | "7d";
export type AccessLogType = "auth" | "browse" | "edit" | "system" | "view";
export type AccessLogEventFilter = "" | AccessLogType;

/** A chip in Recent events: an exact value of one column. */
export interface AccessLogFilter {
  field: "address" | "event" | "user";
  value: string;
}

/** Log keys whose panel wording matches the search text, since the log itself holds only the keys. */
export interface AccessLogSearchKeys {
  events: string[];
  fields: string[];
}

export interface AccessLogEntry {
  at: number;
  event: string;
  /** File type and size of the original a view served. */
  ext?: string;
  /** Which fields an edit or settings change touched; never their values. */
  fields?: string[];
  ip: string;
  itemId?: string;
  /** The library open in Eagle at the time, as an opaque id. */
  libraryId?: string;
  method?: string;
  path?: string;
  size?: number;
  status?: number;
  type: AccessLogType;
  user?: string;
}

export interface AccessLogBucket {
  auth: number;
  authFailures: number;
  browse: number;
  edit: number;
  end: number;
  start: number;
  view: number;
  /** Edits that were refused or failed: nothing changed. */
  editFailures?: number;
  /** Server and settings events. */
  system?: number;
  /** Failed media fetches: not views. */
  viewFailures?: number;
}

/** One row per address and signed-in user ("" when the requests carried no user). */
export interface AccessLogClient {
  active: boolean;
  authFailures: number;
  ip: string;
  lastSeen: number;
  editFailures?: number;
  edits: number;
  user: string;
  views: number;
}

export interface AccessLogSummary {
  activeClients: number;
  buckets: AccessLogBucket[];
  /** Every device seen in the selected range; `clients` holds only the most recently seen ones. */
  clientCount: number;
  clients: AccessLogClient[];
  range: AccessLogRange;
  recent: AccessLogEntry[];
  /** viewFailures: failed media fetches, listed under Views but not counted as views. */
  totals: { auth: number; authFailures: number; browse: number; edit: number; editFailures?: number; system?: number; view: number; viewFailures?: number };
}
