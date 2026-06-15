import type { ViewerState } from "./types";

export type FilterState = Pick<ViewerState, "query" | "tags" | "folderId" | "ext" | "rating">;

export type ResetFilterState = FilterState & Pick<ViewerState, "offset">;

export function hasActiveFilters({ query, tags, folderId, ext, rating }: FilterState) {
  return Boolean(query || tags.length || folderId || ext || rating !== "");
}

export function resetFilterState(): ResetFilterState {
  return {
    query: "",
    tags: [],
    folderId: "",
    ext: "",
    rating: "",
    offset: 0,
  };
}
