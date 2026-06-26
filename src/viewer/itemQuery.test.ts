import { describe, expect, test } from "vitest";
import { itemMatchesFolderFilter, itemQueryParams, type ItemQueryState } from "./itemQuery";

const queryState = (overrides: Partial<ItemQueryState> = {}): ItemQueryState => ({
  offset: 0,
  limit: 30,
  query: "",
  tags: [],
  folderId: "",
  ext: "",
  rating: "",
  smartFolderId: "",
  ...overrides,
});

describe("itemQueryParams", () => {
  test("includes required pagination parameters", () => {
    expect(itemQueryParams(queryState({ offset: 60, limit: 120 })).toString()).toBe("offset=60&limit=120");
  });

  test("includes active filters and repeats tag parameters", () => {
    const params = itemQueryParams(queryState({
      query: "cat",
      tags: ["cute", "black"],
      folderId: "folder-1",
      ext: "png",
      rating: "4",
    }));

    expect(params.toString()).toBe("offset=0&limit=30&q=cat&tags=cute&tags=black&folderId=folder-1&ext=png&rating=4");
    expect(params.getAll("tags")).toEqual(["cute", "black"]);
  });

  test("keeps zero rating but omits an empty rating", () => {
    expect(itemQueryParams(queryState({ rating: "0" })).get("rating")).toBe("0");
    expect(itemQueryParams(queryState({ rating: "" })).has("rating")).toBe(false);
  });

  test("uses smart folder id instead of regular folder id", () => {
    const params = itemQueryParams(queryState({ folderId: "folder-1", smartFolderId: "smart-1" }));

    expect(params.get("smartFolderId")).toBe("smart-1");
    expect(params.has("folderId")).toBe(false);
  });

  test("checks whether edited item folders still match the active folder filter", () => {
    expect(itemMatchesFolderFilter({ folders: ["folder-1"] }, { folderId: "folder-1", smartFolderId: "" })).toBe(true);
    expect(itemMatchesFolderFilter({ folders: ["folder-2"] }, { folderId: "folder-1", smartFolderId: "" })).toBe(false);
    expect(itemMatchesFolderFilter({ folders: [] }, { folderId: "__uncategorized__", smartFolderId: "" })).toBe(true);
    expect(itemMatchesFolderFilter({ folders: ["folder-1"] }, { folderId: "__uncategorized__", smartFolderId: "" })).toBe(false);
    expect(itemMatchesFolderFilter({ folders: [], tags: [] }, { folderId: "__untagged__", smartFolderId: "" })).toBe(true);
    expect(itemMatchesFolderFilter({ folders: [], tags: ["tag"] }, { folderId: "__untagged__", smartFolderId: "" })).toBe(false);
    expect(itemMatchesFolderFilter({ folders: [] }, { folderId: "folder-1", smartFolderId: "smart-1" })).toBe(true);
    expect(itemMatchesFolderFilter({ folders: ["folder-2"] }, { folderId: "", smartFolderId: "" })).toBe(true);
  });
});
