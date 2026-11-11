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
    smartFolderId: "",
    section: "items",
    aiChatId: "",
    ext: "",
    rating: "",
    sort: "",
    order: "",
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
    expect(parseViewerUrlState("?q=cat&tag= alpha &tag=alpha&tag=beta&folder=f1&smartFolder=s1&ext=jpg&rating=4&filters=1&limit=60&view=list&page=3&item=i1&info=1")).toEqual({
      query: "cat",
      tags: ["alpha", "beta"],
      folderId: "f1",
      smartFolderId: "s1",
      section: "items",
      aiChatId: "",
      ext: "jpg",
      rating: "4",
      sort: "",
      order: "",
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

  test("round-trips the experimental sort, dropping the default direction and unknown keys", () => {
    expect(parseViewerUrlState("?sort=name&order=desc")).toMatchObject({ sort: "name", order: "desc" });
    expect(parseViewerUrlState("?sort=name&order=asc")).toMatchObject({ sort: "name", order: "" });
    expect(parseViewerUrlState("?sort=bogus&order=asc")).toMatchObject({ sort: "", order: "" });
    expect(buildViewerSearch(urlState({ sort: "filesize", order: "desc" }))).toBe("sort=filesize&order=desc");
    expect(buildViewerSearch(urlState({ sort: "import" }))).toBe("sort=import");
  });

  test("ignores unsupported view modes", () => {
    expect(parseViewerUrlState("?view=table&page=2").viewMode).toBe("tiles");
  });

  test("builds compact query strings from non-default state", () => {
    const search = buildViewerSearch(urlState({
      query: "cat",
      tags: ["alpha", "beta"],
      folderId: "f1",
      smartFolderId: "s1",
      ext: "jpg",
      rating: "4",
      filtersOpen: true,
      limit: 60,
      viewMode: "list",
      offset: 120,
      previewItemId: "i1",
      previewInfoOpen: true,
    }));
    expect(search).toBe("q=cat&tag=alpha&tag=beta&folder=f1&smartFolder=s1&ext=jpg&rating=4&filters=1&limit=60&view=list&page=3&item=i1&info=1");
    expect(buildViewerUrl("/viewer", urlState({ query: "cat" }))).toBe("/viewer?q=cat");
  });

  test("computes current page and deduplicates normalized tags", () => {
    expect(currentPage({ offset: 60, limit: 30 })).toBe(3);
    expect(uniqueTags([" alpha ", "alpha", "", null, "beta"])).toEqual(["alpha", "beta"]);
  });

  test("keeps the AI chat and its chat id in the URL, and nothing else", () => {
    expect(buildViewerSearch(urlState({ section: "ai", aiChatId: "c1", query: "cat", tags: ["a"], previewItemId: "i1" }))).toBe("section=ai&chat=c1");
    expect(buildViewerSearch(urlState({ section: "ai" }))).toBe("section=ai");
    expect(parseViewerUrlState("?section=ai&chat=c1")).toMatchObject({ section: "ai", aiChatId: "c1" });
    // A chat id means nothing outside the AI chat.
    expect(parseViewerUrlState("?chat=c1")).toMatchObject({ section: "items", aiChatId: "" });
  });

  test("keeps only the section in the URL while the tag list is open", () => {
    expect(buildViewerSearch(urlState({ section: "tags", query: "cat", folderId: "f1", viewMode: "grid" }))).toBe("section=tags");
    expect(parseViewerUrlState("?section=tags").section).toBe("tags");
    expect(parseViewerUrlState("?section=other").section).toBe("items");
  });
});
