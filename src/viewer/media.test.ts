import { describe, expect, test } from "vitest";
import { thumbnailAriaLabel, thumbnailMediaType, thumbnailOverlayIcon } from "./media";

describe("thumbnail media helpers", () => {
  test("classifies supported thumbnail media types", () => {
    expect(thumbnailMediaType({ ext: "mp4" })).toBe("video");
    expect(thumbnailMediaType({ ext: "MP3" })).toBe("audio");
    expect(thumbnailMediaType({ ext: "pdf" })).toBe("document");
    expect(thumbnailMediaType({ ext: "url" })).toBe("document");
    expect(thumbnailMediaType({ ext: "md" })).toBe("document");
    expect(thumbnailMediaType({ ext: "png" })).toBe("image");
  });

  test("returns the expected overlay icon", () => {
    expect(thumbnailOverlayIcon("video")).toBe("play");
    expect(thumbnailOverlayIcon("audio")).toBe("play");
    expect(thumbnailOverlayIcon("document")).toBe("move-diagonal");
    expect(thumbnailOverlayIcon("image")).toBe("move-diagonal");
  });

  test("builds accessible thumbnail labels", () => {
    expect(thumbnailAriaLabel({ id: "1", name: "Clip", ext: "mp4" })).toBe("Play Clip");
    expect(thumbnailAriaLabel({ id: "1", name: "Photo", ext: "jpg" })).toBe("Open Photo");
    expect(thumbnailAriaLabel({ id: "fallback", ext: "png" })).toBe("Open fallback");
  });
});
