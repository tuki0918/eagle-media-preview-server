import { describe, expect, test } from "vitest";
import {
  dedupeSuggestions,
  folderLabel,
  folderSuggestionItems,
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

  test("builds folder suggestions in folder order with selected folders disabled", () => {
    const folders = [
      { id: "root", name: "Root", depth: 0, imageCount: 10 },
      { id: "child", name: "Child", depth: 1, imageCount: 3 },
    ];

    expect(folderLabel("child", folders)).toBe("Root / Child");
    expect(folderSuggestionItems({
      query: "chi",
      selectedValues: [],
      recentFolderIds: ["child"],
      folders,
    })).toEqual([
      { value: "child", label: "Child", meta: "3 items", depth: 1, disabled: false },
    ]);

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
