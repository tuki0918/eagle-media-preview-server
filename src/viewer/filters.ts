import type { ViewerState } from "./types";

export type FilterState = Pick<ViewerState, "query" | "tags" | "folderId" | "smartFolderId" | "ext" | "rating">;

export type ResetFilterState = FilterState & Pick<ViewerState, "offset">;

export function hasActiveFilters({ query, tags, folderId, smartFolderId, ext, rating }: FilterState) {
  return Boolean(query || tags.length || folderId || smartFolderId || ext || rating !== "");
}

export function hasResettableFilters({ query, tags, ext, rating }: FilterState) {
  return Boolean(query || tags.length || ext || rating !== "");
}

// Short labels for the filters hidden inside the search panel (folders already show in the header title).
export function activeFilterLabels({ query, tags, ext, rating }: Pick<FilterState, "query" | "tags" | "ext" | "rating">) {
  const labels: string[] = [];
  if (query) labels.push(`"${query}"`);
  for (const tag of tags) labels.push(`#${tag}`);
  if (ext) labels.push(ext.toUpperCase());
  if (rating === "0") labels.push("No rating");
  else if (rating !== "") labels.push(`★ ${rating}`);
  return labels;
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
