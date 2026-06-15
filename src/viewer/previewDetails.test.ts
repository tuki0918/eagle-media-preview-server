import { describe, expect, test } from "vitest";
import { previewDetailRows } from "./previewDetails";

describe("viewer preview detail rows", () => {
  test("builds rows for a basic image item", () => {
    expect(previewDetailRows({
      id: "item-1",
      ext: "jpg",
      size: 1536,
      width: 800,
      height: 600,
      modifiedAt: "2024-01-02T03:04:00Z",
    }).map((row) => [row.label, row.value])).toEqual([
      ["Type", "JPG"],
      ["Size", "1.5 KB"],
      ["Dimensions", "800 x 600"],
      ["ID", "item-1"],
      ["Date Modified", expect.stringMatching(/^2024\/01\/02/)],
    ]);
  });

  test("includes duration for timed media", () => {
    expect(previewDetailRows({
      id: "clip-1",
      ext: "mp4",
      duration: 65,
    }).map((row) => [row.label, row.value])).toContainEqual(["Duration", "1:05"]);
  });

  test("falls back when modified date is unavailable", () => {
    expect(previewDetailRows({ id: "item-1", ext: "" }).at(-1)).toEqual({
      label: "Date Modified",
      value: "-",
    });
  });
});
