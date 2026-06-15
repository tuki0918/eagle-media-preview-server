import { describe, expect, test } from "vitest";
import {
  clamp,
  flattenFolders,
  folderDisplayNames,
  folderIds,
  formatBytes,
  formatDateShort,
  formatDuration,
  formatDurationCell,
  formatItemDate,
  isTimedMedia,
  itemTags,
  mediaTypeLabel,
  normalizeRating,
  originalFileName,
  previewFileName,
} from "./format";

describe("viewer format helpers", () => {
  test("builds stable original and preview file names", () => {
    expect(originalFileName({ id: "abc", name: "image", ext: "jpg" })).toBe("image.jpg");
    expect(originalFileName({ id: "abc", name: "image.JPG", ext: ".jpg" })).toBe("image.JPG");
    expect(originalFileName({ id: "abc", ext: "png" })).toBe("abc.png");
    expect(previewFileName({ id: "abc", name: "clip", ext: "mp4" })).toBe("clip.mp4");
  });

  test("formats media size and duration values for compact UI cells", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatDuration(62.4)).toBe("1:02");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDurationCell({ ext: "mp4", duration: 12 })).toBe("0:12");
    expect(formatDurationCell({ ext: "jpg", duration: 12 })).toBe("");
  });

  test("normalizes tags and folder references", () => {
    expect(itemTags({ tags: [" alpha ", "", null, "beta"] })).toEqual(["alpha", "beta"]);
    expect(folderIds([{ id: "folder-a" }, "folder-b", { name: "missing-id" }, null])).toEqual(["folder-a", "folder-b"]);
    expect(folderDisplayNames(["folder-a", "folder-c"], [{ id: "folder-a", name: "Folder A" }])).toEqual([
      "Folder A",
      "folder-c",
    ]);
  });

  test("normalizes rating values for display and optimistic updates", () => {
    expect(normalizeRating(0)).toBe(0);
    expect(normalizeRating("5")).toBe(5);
    expect(normalizeRating(6)).toBe(0);
    expect(normalizeRating(2.5)).toBe(0);
    expect(normalizeRating("bad")).toBe(0);
  });

  test("flattens folder trees with depth metadata", () => {
    expect(flattenFolders([
      {
        id: "root",
        name: "Root",
        children: [{ id: "child", name: "Child" }],
      },
    ])).toEqual([
      { id: "root", name: "Root", children: [{ id: "child", name: "Child" }], depth: 0 },
      { id: "child", name: "Child", depth: 1 },
    ]);
  });

  test("formats item labels, dates, and media classification", () => {
    expect(mediaTypeLabel({ ext: "webm" })).toBe("WEBM");
    expect(mediaTypeLabel({})).toBe("FILE");
    expect(isTimedMedia({ ext: "flac" })).toBe(true);
    expect(isTimedMedia({ ext: "gif" })).toBe(false);
    expect(formatItemDate({ modifiedAt: "2024-01-02T03:04:00Z" }, ["modifiedAt"])).toMatch(/^2024\/01\/02/);
    expect(formatDateShort(Date.UTC(2024, 0, 2))).toMatch(/^2024\/01\/02$/);
    expect(clamp(12, 1, 10)).toBe(10);
    expect(clamp(-1, 1, 10)).toBe(1);
  });
});
