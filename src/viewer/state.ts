import { DEFAULT_VIEW_MODE } from "./constants";
import type { ViewerState } from "./types";

export const state: ViewerState = {
  offset: 0,
  limit: 30,
  total: 0,
  items: [],
  query: "",
  tags: [],
  tagSuggestionsRequestId: 0,
  folderId: "",
  smartFolderId: "",
  ext: "",
  rating: "",
  filtersOpen: false,
  folders: [],
  smartFolders: [],
  viewMode: DEFAULT_VIEW_MODE,
  tilesLoadingMore: false,
  tilesObserver: null,
  requestId: 0,
  previewItemId: "",
  previewInfoOpen: false,
  restoringHistory: false,
  permissions: {
    manageLibrary: false,
    read: true,
    writeMetadata: false,
    writeRating: false,
  },
};
