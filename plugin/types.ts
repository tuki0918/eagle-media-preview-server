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
  sharedLibraries?: SharedLibrary[];
}

export interface PluginStatus {
  lastError?: string;
  settings?: PluginSettings;
  state?: ServerState | string;
  url?: string;
}

export type AccessLogRange = "1h" | "24h" | "7d";
export type AccessLogType = "auth" | "browse" | "edit" | "view";
export type AccessLogEventFilter = "" | AccessLogType;

export interface AccessLogEntry {
  at: number;
  event: string;
  /** File type and size of the original a view served. */
  ext?: string;
  ip: string;
  itemId?: string;
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
}

/** One row per address and signed-in user ("" when the requests carried no user). */
export interface AccessLogClient {
  active: boolean;
  authFailures: number;
  ip: string;
  lastSeen: number;
  requests: number;
  user: string;
  views: number;
}

export interface AccessLogSummary {
  activeClients: number;
  bucketMs: number;
  buckets: AccessLogBucket[];
  /** Every device in the log; `clients` holds only the most recently seen ones. */
  clientCount: number;
  clients: AccessLogClient[];
  filePath: string;
  /** When the manager built this summary. */
  generatedAt?: number;
  oldestAt: number | null;
  range: AccessLogRange;
  recent: AccessLogEntry[];
  retainedEntries: number;
  totals: { auth: number; authFailures: number; browse: number; edit: number; view: number };
}
