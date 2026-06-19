import { describe, expect, test } from "vitest";
import {
  isViewerMode,
  needsViewModeReload,
  savedViewerMode,
} from "./viewMode";

describe("isViewerMode", () => {
  test("accepts supported viewer modes", () => {
    expect(isViewerMode("grid")).toBe(true);
    expect(isViewerMode("tiles")).toBe(true);
    expect(isViewerMode("list")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isViewerMode("table")).toBe(false);
    expect(isViewerMode("")).toBe(false);
  });
});

describe("savedViewerMode", () => {
  test("restores a valid saved mode", () => {
    expect(savedViewerMode("list")).toBe("list");
  });

  test("falls back to the default mode for missing or invalid values", () => {
    expect(savedViewerMode(null)).toBe("tiles");
    expect(savedViewerMode("table")).toBe("tiles");
  });
});

describe("needsViewModeReload", () => {
  test("reloads when entering or leaving tiles mode", () => {
    expect(needsViewModeReload("grid", "tiles")).toBe(true);
    expect(needsViewModeReload("tiles", "list")).toBe(true);
  });

  test("does not reload when switching between paged modes", () => {
    expect(needsViewModeReload("grid", "list")).toBe(false);
    expect(needsViewModeReload("list", "grid")).toBe(false);
  });
});
