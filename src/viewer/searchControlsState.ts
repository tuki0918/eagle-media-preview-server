import type { SortKey, SortOrder } from "./sort";
import type { EagleFolder, EagleSmartFolder, ViewerSection } from "./types";

export interface SearchControlsState {
  allFoldersTotal: number;
  /** The user may add files to the library. */
  canUpload?: boolean;
  /** The server's limit per file, known once connected. */
  uploadMaxBytes?: number;
  /** File extensions present in the current library; empty until loaded. */
  availableExts?: readonly string[];
  /** True while the library's extensions are being fetched. */
  availableExtsLoading?: boolean;
  /** True once the extensions are known, so an empty list means there are none (not that they failed). */
  availableExtsLoaded?: boolean;
  filtersOpen: boolean;
  folders: readonly EagleFolder[];
  hasActiveFilters: boolean;
  hasResettableFilters: boolean;
  searchQuery: string;
  section?: ViewerSection;
  selectedExt: string;
  selectedFolderId: string;
  selectedLimit: number;
  selectedRating: string;
  selectedSmartFolderId: string;
  /** Experimental sort: usable only when the server has it on and its library index is ready. */
  sortAvailable?: boolean;
  /** While the server's index is being built: the sort control is shown disabled with this text. */
  sortPreparing?: string;
  selectedSort?: SortKey;
  selectedOrder?: "" | SortOrder;
  smartFolders: readonly EagleSmartFolder[];
  /** Sidebar shortcut totals; 0 hides the count. */
  tagsTotal?: number;
  uncategorizedTotal?: number;
  untaggedTotal?: number;
}

const listeners = new Set<() => void>();
let currentSearchControls: SearchControlsState = {
  allFoldersTotal: 0,
  filtersOpen: false,
  folders: [],
  hasActiveFilters: false,
  hasResettableFilters: false,
  searchQuery: "",
  section: "items",
  selectedExt: "",
  selectedFolderId: "",
  selectedLimit: 30,
  selectedRating: "",
  selectedSmartFolderId: "",
  smartFolders: [],
};

export function getSearchControlsState() {
  return currentSearchControls;
}

export function setSearchControlsState(nextState: SearchControlsState) {
  currentSearchControls = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSearchControlsState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
