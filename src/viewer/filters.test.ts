import { describe, expect, test } from "vitest";
import { activeFilterLabels, formatRatingFilter, hasActiveFilters, hasResettableFilters, parseRatingFilter, ratingFilterSummary, resetFilterState, toggleRatingFilter, type FilterState } from "./filters";

const emptyFilters = (overrides: Partial<FilterState> = {}): FilterState => ({
  query: "",
  tags: [],
  folderId: "",
  smartFolderId: "",
  ext: "",
  rating: "",
  ...overrides,
});

describe("filter state helpers", () => {
  test("labels the filters hidden in the search panel", () => {
    expect(activeFilterLabels(emptyFilters({ folderId: "folder" }))).toEqual([]);
    expect(activeFilterLabels(emptyFilters({ query: "cat", tags: ["a", "b"], ext: "jpg", rating: "3" }))).toEqual([
      '"cat"',
      "#a",
      "#b",
      "JPG",
      "★★★☆☆",
    ]);
    expect(activeFilterLabels(emptyFilters({ rating: "0" }))).toEqual(["None"]);
    expect(activeFilterLabels(emptyFilters({ rating: "5,0,4" }))).toEqual(["★5,4, None"]);
  });

  test("parses, formats, and toggles multi-select ratings", () => {
    expect(parseRatingFilter("")).toEqual([]);
    expect(parseRatingFilter("3")).toEqual([3]);
    expect(parseRatingFilter("0, 2,5,2,9,x")).toEqual([5, 2, 0]);
    expect(formatRatingFilter([0, 4, 5])).toBe("5,4,0");
    expect(toggleRatingFilter("", 4)).toBe("4");
    expect(toggleRatingFilter("4", 0)).toBe("4,0");
    expect(toggleRatingFilter("5,4,0", 4)).toBe("5,0");
    expect(toggleRatingFilter("4", 4)).toBe("");
  });

  test("summarizes the selected ratings for the field", () => {
    expect(ratingFilterSummary("")).toBe("All ratings");
    expect(ratingFilterSummary("5")).toBe("★★★★★");
    expect(ratingFilterSummary("0")).toBe("None");
    expect(ratingFilterSummary("4,5")).toBe("★5,4");
    expect(ratingFilterSummary("5,4,0")).toBe("★5,4, None");
  });

  test("detects active search filters", () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
    expect(hasActiveFilters(emptyFilters({ query: "cat" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ tags: ["tag"] }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ folderId: "folder" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ smartFolderId: "smart-folder" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ ext: "png" }))).toBe(true);
    expect(hasActiveFilters(emptyFilters({ rating: "0" }))).toBe(true);
  });

  test("detects resettable filters without treating category as clearable", () => {
    expect(hasResettableFilters(emptyFilters())).toBe(false);
    expect(hasResettableFilters(emptyFilters({ folderId: "folder" }))).toBe(false);
    expect(hasResettableFilters(emptyFilters({ smartFolderId: "smart-folder" }))).toBe(false);
    expect(hasResettableFilters(emptyFilters({ query: "cat" }))).toBe(true);
    expect(hasResettableFilters(emptyFilters({ tags: ["tag"] }))).toBe(true);
    expect(hasResettableFilters(emptyFilters({ ext: "png" }))).toBe(true);
    expect(hasResettableFilters(emptyFilters({ rating: "0" }))).toBe(true);
  });

  test("returns the reset state while preserving the selected category", () => {
    expect(resetFilterState({ folderId: "folder", smartFolderId: "smart-folder" })).toEqual({
      query: "",
      tags: [],
      folderId: "folder",
      smartFolderId: "smart-folder",
      ext: "",
      rating: "",
      offset: 0,
    });
  });
});
