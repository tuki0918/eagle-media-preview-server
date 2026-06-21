import type { ViewerState } from "./types";

export type FilterState = Pick<ViewerState, "query" | "tags" | "folderId" | "smartFolderId" | "ext" | "rating">;

export type ResetFilterState = FilterState & Pick<ViewerState, "offset">;

export function hasActiveFilters({ query, tags, folderId, smartFolderId, ext, rating }: FilterState) {
  return Boolean(query || tags.length || folderId || smartFolderId || ext || rating !== "");
}

export function hasResettableFilters({ query, tags, ext, rating }: FilterState) {
  return Boolean(query || tags.length || ext || rating !== "");
}

export function resetFilterState(current: Pick<FilterState, "folderId" | "smartFolderId"> = { folderId: "", smartFolderId: "" }): ResetFilterState {
  return {
    query: "",
    tags: [],
    folderId: current.folderId,
    smartFolderId: current.smartFolderId,
    ext: "",
    rating: "",
    offset: 0,
  };
}
