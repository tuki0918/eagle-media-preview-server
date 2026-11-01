import { describe, expect, test } from "vitest";
import {
  dedupeSuggestions,
  folderLabel,
  folderSuggestionItems,
  groupedTagSuggestionItems,
  matchesQuery,
  readRecentList,
  rememberRecentValues,
  tagSuggestionItems,
  uniqueValues,
  writeRecentList,
} from "./metadata";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("viewer metadata helpers", () => {
  test("builds tag suggestions from recent and remote tag sources", () => {
    expect(tagSuggestionItems({
      query: "alp",
      selectedValues: ["selected"],
      recentTags: ["alpha", "selected"],
      remoteTags: [{ name: "alpha", count: 4 }, { name: "alpine", count: 12 }, { name: "beta" }],
    })).toEqual([
      { value: "alpha", label: "alpha", meta: "Recent" },
      { value: "alpine", label: "alpine", meta: "12" },
    ]);
  });

  test("groups registered tag suggestions like the All tags view", () => {
    const overview = {
      tags: [{ name: "sky", imageCount: 4 }, { name: "red", imageCount: 2 }, { name: "blue", imageCount: 1 }, { name: "misc", imageCount: 3 }],
      starred: [{ name: "sky" }],
      groups: [{ id: "g1", name: "Colors", color: "#f00", tags: ["red", "blue"] }],
    };

    expect(groupedTagSuggestionItems({ query: "", recentTags: ["misc"], overview })).toEqual([
      { value: "misc", label: "misc", meta: "3", group: "Recent", groupColor: "", groupId: "section:recent" },
      { value: "sky", label: "sky", meta: "4", group: "Starred", groupColor: "", groupId: "section:starred" },
      { value: "blue", label: "blue", meta: "1", group: "Colors", groupColor: "#f00", groupId: "group:g1" },
      { value: "red", label: "red", meta: "2", group: "Colors", groupColor: "#f00", groupId: "group:g1" },
      { value: "misc", label: "misc", meta: "3", group: "Ungrouped", groupColor: "", groupId: "section:ungrouped" },
    ]);
    expect(groupedTagSuggestionItems({ query: "re", recentTags: ["misc"], overview }).map((item) => [item.group, item.value])).toEqual([
      ["Colors", "red"],
    ]);
  });

  test("keeps a tag group named like a built-in section distinct", () => {
    const items = groupedTagSuggestionItems({
      query: "",
      recentTags: ["red"],
      overview: { tags: [{ name: "red", imageCount: 1 }], groups: [{ id: "g-recent", name: "Recent", tags: ["red"] }] },
    });

    expect(items.map((item) => [item.group, item.groupId])).toEqual([
      ["Recent", "section:recent"],
      ["Recent", "group:g-recent"],
    ]);
  });

  test("builds folder suggestions in folder order with selected folders disabled", () => {
    const folders = [
      { id: "root", name: "Root", depth: 0, imageCount: 10, children: [{ id: "child", name: "Child", depth: 1, imageCount: 3 }] },
    ];

    expect(folderLabel("child", folders)).toBe("Root / Child");
    // Like the sidebar search, the parent of a match stays listed for context.
    expect(folderSuggestionItems({
      query: "chi",
      selectedValues: [],
      recentFolderIds: ["child"],
      folders,
    })).toEqual([
      { value: "root", label: "Root", meta: "10 items", depth: 0, disabled: false },
      { value: "child", label: "Child", meta: "3 items", depth: 1, disabled: false },
    ]);
    // A matching folder keeps its subfolders.
    expect(folderSuggestionItems({ query: "roo", selectedValues: [], recentFolderIds: [], folders }).map((item) => item.value)).toEqual(["root", "child"]);
    expect(folderSuggestionItems({ query: "nothing", selectedValues: [], recentFolderIds: [], folders })).toEqual([]);
    // Depth-only lists (no children arrays) resolve parents the same way.
    const flatFolders = [
      { id: "a", name: "Alpha", depth: 0 },
      { id: "a1", name: "Social", depth: 1 },
      { id: "b", name: "Beta", depth: 0 },
    ];
    expect(folderSuggestionItems({ query: "soc", selectedValues: [], recentFolderIds: [], folders: flatFolders }).map((item) => item.value)).toEqual(["a", "a1"]);

    expect(folderSuggestionItems({
      query: "",
      selectedValues: ["child"],
      recentFolderIds: ["child"],
      folders,
    })).toEqual([
      { value: "root", label: "Root", meta: "10 items", depth: 0, disabled: false },
      { value: "child", label: "Child", meta: "Added", depth: 1, disabled: true },
    ]);
  });

  test("formats folder suggestion counts like the sidebar", () => {
    const folders = [
      { id: "zero", name: "Zero", depth: 0, imageCount: 0 },
      { id: "string-count", name: "String Count", depth: 0, imageCount: "12" },
    ] as unknown as Parameters<typeof folderSuggestionItems>[0]["folders"];

    expect(folderSuggestionItems({
      query: "",
      selectedValues: [],
      recentFolderIds: [],
      folders,
    })).toEqual([
      { value: "zero", label: "Zero", meta: "", depth: 0, disabled: false },
      { value: "string-count", label: "String Count", meta: "12 items", depth: 0, disabled: false },
    ]);
  });

  test("deduplicates, filters, and matches suggestion values", () => {
    expect(dedupeSuggestions([
      { value: "a", label: "A", meta: "" },
      { value: "a", label: "Duplicate", meta: "" },
      { value: "", label: "Missing", meta: "" },
      { value: "b", label: "B", meta: "" },
    ])).toEqual([
      { value: "a", label: "A", meta: "" },
      { value: "b", label: "B", meta: "" },
    ]);
    expect(matchesQuery("Alpha Beta", "bet")).toBe(true);
    expect(matchesQuery("Alpha", "zzz")).toBe(false);
    expect(uniqueValues([" a ", "a", "", null, "b"])).toEqual(["a", "b"]);
  });

  test("reads, writes, and prepends recent metadata values", () => {
    const storage = new MemoryStorage();
    storage.setItem("recent", JSON.stringify([" old ", "old", "", "older"]));

    expect(readRecentList("recent", storage)).toEqual(["old", "older"]);
    writeRecentList("recent", ["a", "b", "a"], storage);
    expect(JSON.parse(storage.getItem("recent") || "[]")).toEqual(["a", "b"]);

    rememberRecentValues("recent", ["c", "a"], storage);
    expect(JSON.parse(storage.getItem("recent") || "[]")).toEqual(["c", "a", "b"]);
  });
});
