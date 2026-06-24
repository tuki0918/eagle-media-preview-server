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
    name?: string;
  };
  app?: {
    version?: string;
  };
}

export interface ViewerPermissions {
  manageLibrary: boolean;
  read: boolean;
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
}

export interface TagSuggestionApiItem {
  color?: string;
  groups?: unknown;
  name?: string;
  count?: number;
}

export interface TagGroupApiItem {
  color?: string;
  description?: string;
  id?: string;
  name?: string;
  tags?: unknown;
}

export interface LoadItemsOptions {
  append?: boolean;
}

export interface OpenPreviewOptions {
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
  ext: string;
  rating: string;
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
