import type { ViewerMode } from "./types";

export interface TileLoadingState {
  viewMode: ViewerMode;
  itemCount: number;
  total: number;
  tilesLoadingMore: boolean;
}

export function hasMoreTiles({ itemCount, total }: Pick<TileLoadingState, "itemCount" | "total">) {
  return itemCount > 0 && itemCount < total;
}

export function shouldShowTileSentinel(state: Pick<TileLoadingState, "viewMode" | "itemCount" | "total">) {
  return state.viewMode === "tiles" && hasMoreTiles(state);
}

export function tileSentinelText({ tilesLoadingMore }: Pick<TileLoadingState, "tilesLoadingMore">) {
  return tilesLoadingMore ? "Loading more" : "Scroll to load more";
}

export function canLoadMoreTiles(state: TileLoadingState) {
  return state.viewMode === "tiles" && !state.tilesLoadingMore && hasMoreTiles(state);
}
