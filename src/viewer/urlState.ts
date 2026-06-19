import { DEFAULT_PAGE_SIZE, DEFAULT_VIEW_MODE, MAX_PAGE_SIZE } from "./constants";
import { clamp, normalizeTag } from "./format";
import type { ViewerState } from "./types";

export type ViewerUrlState = Pick<
  ViewerState,
  | "query"
  | "tags"
  | "folderId"
  | "ext"
  | "rating"
  | "filtersOpen"
  | "limit"
  | "viewMode"
  | "offset"
  | "previewItemId"
  | "previewInfoOpen"
>;

export function parseViewerUrlState(search: string): ViewerUrlState {
  const params = new URLSearchParams(search);
  const limit = clampPageSize(params.get("limit"));
  const viewModeParam = params.get("view");
  const viewMode = viewModeParam === "tiles" ? "tiles" : viewModeParam === "list" ? "list" : DEFAULT_VIEW_MODE;
  return {
    query: params.get("q") || "",
    tags: uniqueTags(params.getAll("tag")),
    folderId: params.get("folder") || "",
    ext: params.get("ext") || "",
    rating: params.get("rating") || "",
    filtersOpen: params.get("filters") === "1",
    limit,
    viewMode,
    offset: viewMode === "tiles" ? 0 : (Math.max(1, Number.parseInt(params.get("page") || "1", 10)) - 1) * limit,
    previewItemId: params.get("item") || "",
    previewInfoOpen: params.get("info") === "1",
  };
}

export function buildViewerSearch(state: ViewerUrlState) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const tag of state.tags) params.append("tag", tag);
  if (state.folderId) params.set("folder", state.folderId);
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);
  if (state.filtersOpen) params.set("filters", "1");
  if (state.limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(state.limit));
  if (state.viewMode !== DEFAULT_VIEW_MODE) params.set("view", state.viewMode);
  if (state.viewMode !== "tiles") params.set("page", String(currentPage(state)));
  if (state.previewItemId) params.set("item", state.previewItemId);
  if (state.previewInfoOpen) params.set("info", "1");
  return params.toString();
}

export function buildViewerUrl(pathname: string, state: ViewerUrlState) {
  const search = buildViewerSearch(state);
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function currentPage(state: Pick<ViewerState, "offset" | "limit">) {
  return Math.floor(state.offset / state.limit) + 1;
}

export function clampPageSize(value: string | null) {
  const parsed = Number.parseInt(value || String(DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return clamp(parsed, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

export function uniqueTags(tags: unknown[]) {
  const unique: string[] = [];
  for (const tag of tags.map(normalizeTag).filter(Boolean)) {
    if (!unique.includes(tag)) unique.push(tag);
  }
  return unique;
}
