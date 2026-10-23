import type { TagOverviewResponse } from "./tagOverview";

export interface TagListState {
  error: string;
  onSelectTag: (tag: string) => void;
  overview: TagOverviewResponse | null;
  /** Text typed into the tag search panel; filters the list locally. */
  query: string;
  status: "idle" | "loading" | "ready" | "error";
}

const listeners = new Set<() => void>();
let currentTagList: TagListState = {
  error: "",
  onSelectTag: () => {},
  overview: null,
  query: "",
  status: "idle",
};

export function getTagListState() {
  return currentTagList;
}

export function setTagListState(patch: Partial<TagListState>) {
  currentTagList = { ...currentTagList, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeTagListState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setTagSearchQuery(query: string) {
  if (currentTagList.query === query) return;
  setTagListState({ query });
}
