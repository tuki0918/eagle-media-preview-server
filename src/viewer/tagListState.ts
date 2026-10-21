import type { TagOverviewResponse } from "./tagOverview";

export interface TagListState {
  error: string;
  onSelectTag: (tag: string) => void;
  overview: TagOverviewResponse | null;
  status: "idle" | "loading" | "ready" | "error";
}

const listeners = new Set<() => void>();
let currentTagList: TagListState = {
  error: "",
  onSelectTag: () => {},
  overview: null,
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
