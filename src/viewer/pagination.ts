import { MAX_PAGE_SIZE, TILE_PREFETCH_PAGES } from "./constants";
import type { ViewerMode } from "./types";

export type PageButton = number | "...";

export function currentFetchLimit({
  viewMode,
  tags,
  limit,
}: {
  viewMode: ViewerMode;
  tags: readonly string[];
  limit: number;
}) {
  if (viewMode !== "tiles" || tags.length) return limit;
  return Math.min(limit * TILE_PREFETCH_PAGES, MAX_PAGE_SIZE);
}

export function totalPages(total: number, limit: number) {
  return Math.max(1, Math.ceil(total / limit));
}

export function pageButtonList(current: number, total: number): PageButton[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}
