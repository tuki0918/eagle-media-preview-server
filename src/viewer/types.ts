export interface EagleFolder {
  id: string;
  name: string;
  imageCount?: number;
  children?: EagleFolder[];
  depth?: number;
}

export interface EagleItem {
  id?: string;
  name?: string;
  ext?: string;
  width?: number;
  height?: number;
  duration?: unknown;
  size?: number;
  tags?: unknown;
  folders?: unknown;
  [key: string]: unknown;
}

export type ViewerMode = "grid" | "tiles" | "table";

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

export interface LoadFoldersResponse {
  items?: EagleFolder[];
}

export interface LoadItemsResponse {
  items?: EagleItem[];
  total?: number;
}

export interface TagSuggestionApiItem {
  name?: string;
  count?: number;
}

export interface LoadItemsOptions {
  append?: boolean;
}

export interface OpenPreviewOptions {
  skipHistory?: boolean;
}

export interface RenderImagePreviewOptions {
  srcKind?: string;
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
  ext: string;
  rating: string;
  filtersOpen: boolean;
  folders: EagleFolder[];
  viewMode: ViewerMode;
  tilesLoadingMore: boolean;
  tilesObserver: IntersectionObserver | null;
  requestId: number;
  previewTransform: PreviewTransform;
  previewFitScale: number;
  previewNaturalScale: number;
  previewDrag: PreviewDrag | null;
  previewPointers: Map<number, PreviewPoint>;
  previewPinch: PreviewPinch | null;
  previewItemId: string;
  previewInfoOpen: boolean;
  restoringHistory: boolean;
}
