import { describe, expect, test } from "vitest";
import { buildTagSections } from "./tagOverview";

const overview = {
  tags: [
    { name: "vtuber", imageCount: 3, groups: [] },
    { name: "@work: xxx", imageCount: 5, groups: [] },
    { name: "tree", imageCount: 1, groups: ["group-nature"] },
    { name: "aaa", imageCount: 0, groups: [] },
    { name: "bbb", imageCount: 2, groups: [] },
  ],
  groups: [
    { id: "group-nature", name: "Nature", color: "green", tags: [] },
    { id: "group-media", name: "Media", tags: ["vtuber", "bbb"] },
    { id: "group-empty", name: "Empty", tags: [] },
  ],
  starred: [{ name: "@work: xxx", imageCount: 5 }, { name: "bbb", imageCount: 2 }],
};

describe("tag sections", () => {
  test("puts starred tags first and splits the rest into groups and ungrouped tags", () => {
    const sections = buildTagSections(overview);

    expect(sections.starred.map((tag) => tag.name)).toEqual(["@work: xxx", "bbb"]);
    expect(sections.groups.map((group) => [group.name, group.tags.map((tag) => tag.name)])).toEqual([
      ["Nature", ["tree"]],
      ["Media", ["vtuber"]],
    ]);
    expect(sections.groups[0].color).toBe("green");
    expect(sections.ungrouped).toEqual([{ name: "aaa", count: 0 }]);
    expect(sections.total).toBe(5);
  });

  test("filters every section by a case-insensitive name match", () => {
    const sections = buildTagSections(overview, " TR ");

    expect(sections.starred).toEqual([]);
    expect(sections.groups.map((group) => group.name)).toEqual(["Nature"]);
    expect(sections.ungrouped).toEqual([]);
    expect(sections.total).toBe(1);
  });

  test("tolerates missing or malformed data", () => {
    expect(buildTagSections(null)).toEqual({ groups: [], starred: [], total: 0, ungrouped: [] });
    expect(buildTagSections({ tags: ["plain", { name: "" }, 3], groups: [{ name: "Named only", tags: ["plain"] }] })).toEqual({
      groups: [{ color: "", id: "Named only", name: "Named only", tags: [{ name: "plain", count: 0 }] }],
      starred: [],
      total: 1,
      ungrouped: [],
    });
  });
});
