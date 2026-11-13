import type { SortKey, SortOrder } from "./sort";
export interface EagleFolder {
  id: string;
  name: string;
  imageCount?: number;
  isExpand?: boolean;
  children?: EagleFolder[];
  depth?: number;
}

export interface EagleSmartFolder extends EagleFolder {
  conditions?: unknown;
  description?: string;
  icon?: string;
  iconColor?: string;
  modificationTime?: number;
}

export interface EagleItem {
  id?: string;
  name?: string;
  ext?: string;
  width?: number;
  height?: number;
  isDeleted?: boolean;
  duration?: unknown;
  size?: number;
  annotation?: unknown;
  url?: unknown;
  tags?: unknown;
  folders?: unknown;
  [key: string]: unknown;
}

export type ViewerMode = "grid" | "tiles" | "list";

export type ViewerSection = "items" | "tags";

export interface PreviewTransform {
  scale: number;
  x: number;
  y: number;
}

export interface PreviewPoint {
  x: number;
  y: number;
}

export interface PreviewDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export interface PreviewPinch {
  distance: number;
  scale: number;
}

export interface ConnectResponse {
  library?: {
    /** Opaque per-server id; changes when Eagle opens a different library. */
    id?: string;
    name?: string;
  };
  app?: {
    version?: string;
  };
  /** Sent only to users who may upload. */
  uploadMaxBytes?: number;
  /** The server can't change the library (the standalone server): everyone may only browse. */
  readOnly?: boolean;
  /** Optional server features; `sort` is the experimental sort. */
  features?: { sort?: boolean };
  /** With the experimental sort, how far the server's background index of this library has got. */
  sortIndex?: SortIndexState;
}

export interface SortIndexState {
  loaded?: number;
  status?: "building" | "failed" | "ready";
  total?: number;
}

export interface HealthResponse extends ConnectResponse {
  libraryStatus?: "forbidden" | "not_shared" | "shared" | null;
  permissions?: AuthStatusPermissions;
}

export interface ViewerPermissions {
  manageLibrary: boolean;
  read: boolean;
  upload: boolean;
  writeMetadata: boolean;
  writeRating: boolean;
}

export interface AuthStatusPermissions extends Partial<ViewerPermissions> {}

export interface AuthStatusResponse {
  authenticated?: boolean;
  permissions?: AuthStatusPermissions;
  required?: boolean;
  sessionMaxAgeSeconds?: number;
  user?: {
    role?: string;
    username?: string;
  } | null;
}

export interface LoadFoldersResponse {
  items?: EagleFolder[];
}

export interface LoadSmartFoldersResponse {
  items?: EagleSmartFolder[];
}

export interface LoadItemsResponse {
  items?: EagleItem[];
  total?: number;
  /**
   * Sent for sorted requests; until "ready" the items are in Eagle's order. `complete: false` means
   * the server's index is missing some items, so the list may be short.
   */
  sort?: { complete?: boolean; status?: "failed" | "indexing" | "ready"; loaded?: number; total?: number };
}

export interface TagSuggestionApiItem {
  name?: string;
  count?: number;
}

export interface LoadItemsOptions {
  append?: boolean;
}

export interface OpenPreviewOptions {
  replaceHistory?: boolean;
  skipHistory?: boolean;
}

export type ItemPatch = Partial<EagleItem>;

export interface ViewerState {
  offset: number;
  limit: number;
  total: number;
  items: EagleItem[];
  query: string;
  tags: string[];
  tagSuggestionsRequestId: number;
  folderId: string;
  smartFolderId: string;
  section: ViewerSection;
  ext: string;
  rating: string;
  /** Experimental sort; "" is Eagle's order. */
  sort: SortKey;
  /** "" is the sort's default direction. */
  order: "" | SortOrder;
  filtersOpen: boolean;
  folders: EagleFolder[];
  smartFolders: EagleSmartFolder[];
  viewMode: ViewerMode;
  tilesLoadingMore: boolean;
  tilesObserver: IntersectionObserver | null;
  requestId: number;
  previewItemId: string;
  previewInfoOpen: boolean;
  restoringHistory: boolean;
  permissions: ViewerPermissions;
}
