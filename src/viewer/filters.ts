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
  if (rating) labels.push(ratingFilterSummary(rating));
  return labels;
}

// The rating filter is stored as a comma-separated list ("5,4,0"); a single value stays compatible with old URLs.
export function parseRatingFilter(value: string): number[] {
  const ratings = new Set<number>();
  for (const part of value.split(",")) {
    const text = part.trim();
    if (!text) continue;
    const rating = Number(text);
    if (Number.isInteger(rating) && rating >= 0 && rating <= 5) ratings.add(rating);
  }
  // Highest rating first, "no rating" last — the same order the server returns the groups in.
  return [...ratings].sort((left, right) => (left === 0 ? 1 : right === 0 ? -1 : right - left));
}

export function formatRatingFilter(ratings: Iterable<number>) {
  return parseRatingFilter([...ratings].join(",")).join(",");
}

export function toggleRatingFilter(value: string, rating: number) {
  const ratings = new Set(parseRatingFilter(value));
  if (ratings.has(rating)) ratings.delete(rating);
  else ratings.add(rating);
  return formatRatingFilter(ratings);
}

export function ratingFilterLabel(rating: number) {
  return rating === 0 ? "None" : `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

// One selection reads as its star row; several collapse to "★5,4" (plus ", None") so the field stays scannable.
export function ratingFilterSummary(value: string) {
  const ratings = parseRatingFilter(value);
  if (!ratings.length) return "All ratings";
  if (ratings.length === 1) return ratingFilterLabel(ratings[0]);
  const starred = ratings.filter((rating) => rating > 0);
  const parts = starred.length ? [`★${starred.join(",")}`] : [];
  if (ratings.includes(0)) parts.push("None");
  return parts.join(", ");
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
