import type { EagleFolder } from "./types";

export interface SearchControlsState {
  allFoldersTotal: number;
  filtersOpen: boolean;
  folders: readonly EagleFolder[];
  hasActiveFilters: boolean;
  searchQuery: string;
  selectedExt: string;
  selectedFolderId: string;
  selectedLimit: number;
  selectedRating: string;
}

const listeners = new Set<() => void>();
let currentSearchControls: SearchControlsState = {
  allFoldersTotal: 0,
  filtersOpen: false,
  folders: [],
  hasActiveFilters: false,
  searchQuery: "",
  selectedExt: "",
  selectedFolderId: "",
  selectedLimit: 30,
  selectedRating: "",
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
