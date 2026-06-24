import type { EagleItem } from "./types";

export interface TagExplorerItem {
  color?: string;
  count?: number;
  groups: readonly string[];
  name: string;
  thumbnailItem?: EagleItem;
}

export interface TagExplorerGroup {
  color?: string;
  description?: string;
  id: string;
  name: string;
  tags: readonly string[];
}

export interface TagExplorerState {
  error: string;
  groups: readonly TagExplorerGroup[];
  items: readonly TagExplorerItem[];
  mode: "library" | "tagExplorer";
  pinnedTags: readonly string[];
  query: string;
  selectedTags: readonly string[];
  status: "idle" | "loading" | "ready" | "error";
  onOpen: () => void;
  onRefresh: () => void;
  onRemoveSelectedTag: (tag: string) => void;
  onSearch: (query: string) => void;
  onSelectTag: (tag: string) => void;
  onTogglePinned: (tag: string) => void;
}

const noop = () => {};
const listeners = new Set<() => void>();
let currentTagExplorerState: TagExplorerState = {
  error: "",
  groups: [],
  items: [],
  mode: "library",
  pinnedTags: [],
  query: "",
  selectedTags: [],
  status: "idle",
  onOpen: noop,
  onRefresh: noop,
  onRemoveSelectedTag: noop,
  onSearch: noop,
  onSelectTag: noop,
  onTogglePinned: noop,
};

export function getTagExplorerState() {
  return currentTagExplorerState;
}

export function setTagExplorerState(nextState: Partial<TagExplorerState>) {
  currentTagExplorerState = { ...currentTagExplorerState, ...nextState };
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeTagExplorerState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
