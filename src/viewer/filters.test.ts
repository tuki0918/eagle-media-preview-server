import { describe, expect, test } from "vitest";
import { hasActiveFilters, hasResettableFilters, resetFilterState, type FilterState } from "./filters";

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

  test("detects resettable filters without treating category as clearable", () => {
    expect(hasResettableFilters(emptyFilters())).toBe(false);
    expect(hasResettableFilters(emptyFilters({ folderId: "folder" }))).toBe(false);
    expect(hasResettableFilters(emptyFilters({ query: "cat" }))).toBe(true);
    expect(hasResettableFilters(emptyFilters({ tags: ["tag"] }))).toBe(true);
    expect(hasResettableFilters(emptyFilters({ ext: "png" }))).toBe(true);
    expect(hasResettableFilters(emptyFilters({ rating: "0" }))).toBe(true);
  });

  test("returns the reset state while preserving the selected category", () => {
    expect(resetFilterState({ folderId: "folder" })).toEqual({
      query: "",
      tags: [],
      folderId: "folder",
      ext: "",
      rating: "",
      offset: 0,
    });
  });
});
