import type { EagleFolder, EagleSmartFolder } from "./types";

export interface SearchControlsState {
  allFoldersTotal: number;
  filtersOpen: boolean;
  folders: readonly EagleFolder[];
  hasActiveFilters: boolean;
  hasResettableFilters: boolean;
  searchQuery: string;
  selectedExt: string;
  selectedFolderId: string;
  selectedLimit: number;
  selectedRating: string;
  selectedSmartFolderId: string;
  smartFolders: readonly EagleSmartFolder[];
}

const listeners = new Set<() => void>();
let currentSearchControls: SearchControlsState = {
  allFoldersTotal: 0,
  filtersOpen: false,
  folders: [],
  hasActiveFilters: false,
  hasResettableFilters: false,
  searchQuery: "",
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
