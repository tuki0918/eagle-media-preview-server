import { describe, expect, test } from "vitest";
import {
  buildViewerSearch,
  buildViewerUrl,
  clampPageSize,
  currentPage,
  parseViewerUrlState,
  uniqueTags,
  type ViewerUrlState,
} from "./urlState";

function urlState(overrides: Partial<ViewerUrlState> = {}): ViewerUrlState {
  return {
    query: "",
    tags: [],
    folderId: "",
    ext: "",
    rating: "",
    filtersOpen: false,
    limit: 30,
    viewMode: "tiles",
    offset: 0,
    previewItemId: "",
    previewInfoOpen: false,
    ...overrides,
  };
}

describe("viewer URL state", () => {
  test("parses filters, pagination, and preview state from a query string", () => {
    expect(parseViewerUrlState("?q=cat&tag= alpha &tag=alpha&tag=beta&folder=f1&ext=jpg&rating=4&filters=1&limit=60&view=list&page=3&item=i1&info=1")).toEqual({
      query: "cat",
      tags: ["alpha", "beta"],
      folderId: "f1",
      ext: "jpg",
      rating: "4",
      filtersOpen: true,
      limit: 60,
      viewMode: "list",
      offset: 120,
      previewItemId: "i1",
      previewInfoOpen: true,
    });
  });

  test("clamps unsupported page sizes and ignores page offsets in tiles mode", () => {
    expect(clampPageSize("1")).toBe(30);
    expect(clampPageSize("9999")).toBe(1000);
    expect(parseViewerUrlState("?view=tiles&page=9&limit=60").offset).toBe(0);
  });

  test("ignores unsupported view modes", () => {
    expect(parseViewerUrlState("?view=table&page=2").viewMode).toBe("tiles");
  });

  test("builds compact query strings from non-default state", () => {
    const search = buildViewerSearch(urlState({
      query: "cat",
      tags: ["alpha", "beta"],
      folderId: "f1",
      ext: "jpg",
      rating: "4",
      filtersOpen: true,
      limit: 60,
      viewMode: "list",
      offset: 120,
      previewItemId: "i1",
      previewInfoOpen: true,
    }));
    expect(search).toBe("q=cat&tag=alpha&tag=beta&folder=f1&ext=jpg&rating=4&filters=1&limit=60&view=list&page=3&item=i1&info=1");
    expect(buildViewerUrl("/viewer", urlState({ query: "cat" }))).toBe("/viewer?q=cat");
  });

  test("computes current page and deduplicates normalized tags", () => {
    expect(currentPage({ offset: 60, limit: 30 })).toBe(3);
    expect(uniqueTags([" alpha ", "alpha", "", null, "beta"])).toEqual(["alpha", "beta"]);
  });
});
