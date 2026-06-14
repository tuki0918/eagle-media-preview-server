import { describe, expect, test } from "vitest";
import { hasActiveFilters, resetFilterState, type FilterState } from "./filters";

const emptyFilters = (overrides: Partial<FilterState> = {}): FilterState => ({
  query: "",
  tags: [],
  folderId: "",
  ext: "",
  rating: "",
  ...overrides,
});

describe("filter state helpers", () => {
  test("detects active search filters", () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
    expect(hasActiveFilters(emptyFilters({ query: "cat" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ tags: ["tag"] }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ folderId: "folder" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ ext: "png" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ rating: "0" }))).toBe(true);
  });

  test("returns the canonical reset state", () => {
    expect(resetFilterState()).toEqual({
      query: "",
      tags: [],
      folderId: "",
      ext: "",
      rating: "",
      offset: 0,
    });
  });
});
