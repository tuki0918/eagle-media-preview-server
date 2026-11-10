import { describe, expect, test } from "vitest";
import { DEFAULT_SORT_LABEL, SORT_OPTIONS, defaultSortOrder, effectiveSortOrder, parseSortKey, parseSortOrder, sortDirectionLabel, sortLabel, sortSummary } from "./sort";

describe("experimental sort helpers", () => {
  test("accepts only known sort keys, case-insensitively", () => {
    expect(parseSortKey("name")).toBe("name");
    expect(parseSortKey("FILESIZE")).toBe("filesize");
    expect(parseSortKey("random")).toBe("");
    expect(parseSortKey("")).toBe("");
    expect(parseSortKey(null)).toBe("");
  });

  test("starts each key in the direction people usually want", () => {
    expect(SORT_OPTIONS.map((option) => [option.key, option.defaultOrder])).toEqual([
      ["import", "desc"],
      ["btime", "desc"],
      ["mtime", "desc"],
      ["name", "asc"],
      ["ext", "asc"],
      ["filesize", "desc"],
      ["resolution", "desc"],
      ["rating", "desc"],
      ["duration", "desc"],
    ]);
    expect(defaultSortOrder("")).toBe("desc");
  });

  test("keeps a direction only when it differs from the default, and only with a sort", () => {
    expect(parseSortOrder("name", "desc")).toBe("desc");
    expect(parseSortOrder("name", "ASC")).toBe("");
    expect(parseSortOrder("import", "desc")).toBe("");
    expect(parseSortOrder("import", "asc")).toBe("asc");
    expect(parseSortOrder("name", "sideways")).toBe("");
    expect(parseSortOrder("", "asc")).toBe("");
    expect(effectiveSortOrder("name", "")).toBe("asc");
    expect(effectiveSortOrder("name", "desc")).toBe("desc");
  });

  test("summarizes the sort for the menu and the active filter labels", () => {
    expect(sortSummary("", "")).toBe(DEFAULT_SORT_LABEL);
    expect(DEFAULT_SORT_LABEL).toBe("Default order");
    expect(sortSummary("name", "")).toBe("Name: A → Z");
    expect(sortSummary("import", "")).toBe("Date added: Newest first");
    expect(sortSummary("filesize", "asc")).toBe("File size: Smallest first");
    expect(sortSummary("rating", "")).toBe("Rating: Highest first");
  });

  test("names each direction for its key", () => {
    expect(sortLabel("duration")).toBe("Duration");
    expect(sortLabel("")).toBe(DEFAULT_SORT_LABEL);
    expect(sortDirectionLabel("mtime", "asc")).toBe("Oldest first");
    expect(sortDirectionLabel("ext", "desc")).toBe("Z → A");
    expect(sortDirectionLabel("duration", "desc")).toBe("Longest first");
    expect(sortDirectionLabel("", "asc")).toBe("Ascending");
  });
});
