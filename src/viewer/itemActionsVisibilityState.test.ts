import { afterEach, expect, test, vi } from "vitest";
import { getItemActionsVisible, initializeItemActionsVisible, setItemActionsVisible, subscribeItemActionsVisible } from "./itemActionsVisibilityState";

afterEach(() => {
  vi.unstubAllGlobals();
  initializeItemActionsVisible();
});

test("defaults to showing actions and restores a saved off preference", () => {
  const getItem = vi.fn();
  vi.stubGlobal("window", { localStorage: { getItem } });
  for (const value of [null, "true", "invalid", "false"]) {
    getItem.mockReturnValue(value);
    initializeItemActionsVisible();
    expect(getItemActionsVisible()).toBe(value !== "false");
  }
});

test("persists changes and notifies mounted views only when the value changes", () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  initializeItemActionsVisible();
  const listener = vi.fn();
  const unsubscribe = subscribeItemActionsVisible(listener);
  try {
    setItemActionsVisible(false);
    expect(storage.get("eagleShowItemActions")).toBe("false");
    expect(getItemActionsVisible()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    setItemActionsVisible(false);
    expect(listener).toHaveBeenCalledTimes(1);
    setItemActionsVisible(true);
    expect(listener).toHaveBeenCalledTimes(2);
    storage.set("eagleShowItemActions", "false");
    initializeItemActionsVisible();
    expect(getItemActionsVisible()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
  } finally { unsubscribe(); }
});

test("remains usable without browser storage", () => {
  vi.stubGlobal("window", { get localStorage() { throw new Error("Storage disabled"); } });
  expect(() => initializeItemActionsVisible()).not.toThrow();
  expect(getItemActionsVisible()).toBe(true);
  expect(() => setItemActionsVisible(false)).not.toThrow();
  expect(getItemActionsVisible()).toBe(false);
});
