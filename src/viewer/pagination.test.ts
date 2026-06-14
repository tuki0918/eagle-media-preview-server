import { describe, expect, test } from "vitest";
import { currentFetchLimit, pageButtonList, totalPages } from "./pagination";

describe("viewer pagination helpers", () => {
  test("prefetches extra pages only for unfiltered tiles mode", () => {
    expect(currentFetchLimit({ viewMode: "tiles", tags: [], limit: 30 })).toBe(90);
    expect(currentFetchLimit({ viewMode: "tiles", tags: ["tag"], limit: 30 })).toBe(30);
    expect(currentFetchLimit({ viewMode: "grid", tags: [], limit: 30 })).toBe(30);
    expect(currentFetchLimit({ viewMode: "tiles", tags: [], limit: 800 })).toBe(1000);
  });

  test("computes at least one total page", () => {
    expect(totalPages(0, 30)).toBe(1);
    expect(totalPages(61, 30)).toBe(3);
  });

  test("builds compact page button ranges", () => {
    expect(pageButtonList(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageButtonList(2, 10)).toEqual([1, 2, 3, 4, 5, "...", 10]);
    expect(pageButtonList(9, 10)).toEqual([1, "...", 6, 7, 8, 9, 10]);
    expect(pageButtonList(6, 12)).toEqual([1, "...", 5, 6, 7, "...", 12]);
  });
});
