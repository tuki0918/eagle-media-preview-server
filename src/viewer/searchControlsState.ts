import type { EagleFolder, EagleSmartFolder, ViewerSection } from "./types";

export interface SearchControlsState {
  allFoldersTotal: number;
  /** File extensions present in the current library; empty until loaded. */
  availableExts?: readonly string[];
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
