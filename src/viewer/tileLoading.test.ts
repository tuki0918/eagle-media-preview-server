import { describe, expect, test } from "vitest";
import {
  canLoadMoreTiles,
  hasMoreTiles,
  shouldShowTileSentinel,
  tileSentinelText,
  type TileLoadingState,
} from "./tileLoading";

const tileState = (overrides: Partial<TileLoadingState> = {}): TileLoadingState => ({
  viewMode: "tiles",
  itemCount: 30,
  total: 90,
  tilesLoadingMore: false,
  ...overrides,
});

describe("tile loading helpers", () => {
  test("detects whether the current tile list can grow", () => {
    expect(hasMoreTiles({ itemCount: 30, total: 90 })).toBe(true);
    expect(hasMoreTiles({ itemCount: 0, total: 90 })).toBe(false);
    expect(hasMoreTiles({ itemCount: 90, total: 90 })).toBe(false);
  });

  test("shows the sentinel only in tiles mode with more items available", () => {
    expect(shouldShowTileSentinel(tileState())).toBe(true);
    expect(shouldShowTileSentinel(tileState({ viewMode: "grid" }))).toBe(false);
    expect(shouldShowTileSentinel(tileState({ itemCount: 90 }))).toBe(false);
  });

  test("uses stable sentinel labels for idle and loading states", () => {
    expect(tileSentinelText(tileState())).toBe("Scroll to load more");
    expect(tileSentinelText(tileState({ tilesLoadingMore: true }))).toBe("Loading more");
  });

  test("loads more only when tiles mode is ready and has more items", () => {
    expect(canLoadMoreTiles(tileState())).toBe(true);
    expect(canLoadMoreTiles(tileState({ viewMode: "table" }))).toBe(false);
    expect(canLoadMoreTiles(tileState({ tilesLoadingMore: true }))).toBe(false);
    expect(canLoadMoreTiles(tileState({ itemCount: 90 }))).toBe(false);
  });
});
