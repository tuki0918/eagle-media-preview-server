import { describe, expect, test } from "vitest";
import {
  dragPreviewTransform,
  initialPreviewScales,
  minimumPreviewScale,
  nextPreviewScales,
  nextZoomScale,
  pointerDistance,
  setPreviewZoom,
} from "./previewTransform";

describe("preview transform helpers", () => {
  test("creates and updates fitted image scales", () => {
    expect(initialPreviewScales()).toEqual({
      fitScale: 1,
      naturalScale: 1,
      transform: { scale: 1, x: 0, y: 0 },
    });

    expect(nextPreviewScales({
      imageWidth: 1000,
      imageHeight: 500,
      viewportWidth: 500,
      viewportHeight: 500,
      previousFitScale: 1,
      previousTransform: { scale: 1, x: 24, y: 12 },
    })).toEqual({
      fitScale: 0.48,
      naturalScale: 1,
      transform: { scale: 0.48, x: 0, y: 0 },
    });
  });

  test("keeps a manually zoomed transform while updating fit scale", () => {
    const transform = { scale: 2, x: 10, y: -8 };
    expect(nextPreviewScales({
      imageWidth: 1000,
      imageHeight: 500,
      viewportWidth: 500,
      viewportHeight: 500,
      previousFitScale: 0.48,
      previousTransform: transform,
    }).transform).toBe(transform);
  });

  test("clamps zoom scale and preserves zoom position", () => {
    expect(minimumPreviewScale(0.4, 1)).toBe(0.2);
    expect(minimumPreviewScale(0.01, 1)).toBe(0.05);
    expect(nextZoomScale(1, 20, 0.4, 1)).toBe(8);
    expect(nextZoomScale(0.1, 0.1, 0.4, 1)).toBe(0.2);
    expect(setPreviewZoom(2, { x: 4, y: -3 })).toEqual({ scale: 2, x: 4, y: -3 });
  });

  test("moves transform by drag delta and measures pinch distance", () => {
    expect(dragPreviewTransform(
      { scale: 2, x: 0, y: 0 },
      { startX: 10, startY: 20, originX: 3, originY: 4 },
      { x: 15, y: 12 },
    )).toEqual({ scale: 2, x: 8, y: -4 });

    expect(pointerDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
    expect(pointerDistance([{ x: 0, y: 0 }])).toBe(0);
  });
});
