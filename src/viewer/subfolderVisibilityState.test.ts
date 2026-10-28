import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getSubfoldersVisible,
  initializeSubfoldersVisible,
  setSubfoldersVisible,
  subscribeSubfoldersVisible,
} from "./subfolderVisibilityState";

afterEach(() => {
  vi.unstubAllGlobals();
  initializeSubfoldersVisible();
});

function mockStorage(saved: string | null = null) {
  const storage = {
    getItem: vi.fn(() => saved),
    setItem: vi.fn(),
  };
  vi.stubGlobal("window", { localStorage: storage });
  return storage;
}

describe("subfolder visibility preference", () => {
  test("starts enabled and only restores an explicit false value as disabled", () => {
    expect(getSubfoldersVisible()).toBe(true);
    for (const saved of [null, "true", "invalid", "0"]) {
      mockStorage(saved);
      initializeSubfoldersVisible();
      expect(getSubfoldersVisible()).toBe(true);
    }
    mockStorage("false");
    initializeSubfoldersVisible();
    expect(getSubfoldersVisible()).toBe(false);
  });

  test("persists changes, updates subscribers, and restores the choice", () => {
    const storage = mockStorage();
    initializeSubfoldersVisible();
    const listener = vi.fn();
    const unsubscribe = subscribeSubfoldersVisible(listener);
    try {
      setSubfoldersVisible(false);
      expect(getSubfoldersVisible()).toBe(false);
      expect(storage.setItem).toHaveBeenCalledWith("eagleShowSubfolders", "false");
      expect(listener).toHaveBeenCalledTimes(1);

      setSubfoldersVisible(false);
      expect(listener).toHaveBeenCalledTimes(1);
      setSubfoldersVisible(true);
      expect(storage.setItem).toHaveBeenLastCalledWith("eagleShowSubfolders", "true");
      expect(listener).toHaveBeenCalledTimes(2);

      storage.getItem.mockReturnValue("false");
      initializeSubfoldersVisible();
      expect(getSubfoldersVisible()).toBe(false);
      expect(listener).toHaveBeenCalledTimes(3);
    } finally {
      unsubscribe();
    }
    setSubfoldersVisible(true);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("remains usable when reading or writing browser storage fails", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Storage is unavailable");
      },
    });
    expect(() => initializeSubfoldersVisible()).not.toThrow();
    expect(getSubfoldersVisible()).toBe(true);
    expect(() => setSubfoldersVisible(false)).not.toThrow();
    expect(getSubfoldersVisible()).toBe(false);
    expect(() => setSubfoldersVisible(true)).not.toThrow();
    expect(getSubfoldersVisible()).toBe(true);
  });
});
