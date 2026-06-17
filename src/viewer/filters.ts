import type { ViewerState } from "./types";

export type FilterState = Pick<ViewerState, "query" | "tags" | "folderId" | "ext" | "rating">;

export type ResetFilterState = FilterState & Pick<ViewerState, "offset">;

export function hasActiveFilters({ query, tags, folderId, ext, rating }: FilterState) {
  return Boolean(query || tags.length || folderId || ext || rating !== "");
}

export function hasResettableFilters({ query, tags, ext, rating }: FilterState) {
  return Boolean(query || tags.length || ext || rating !== "");
}

export function resetFilterState(current: Pick<FilterState, "folderId"> = { folderId: "" }): ResetFilterState {
  return {
    query: "",
    tags: [],
    folderId: current.folderId,
    ext: "",
    rating: "",
    offset: 0,
  };
}
