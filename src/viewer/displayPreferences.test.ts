import { afterEach, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readSavedSidebarWidth, writeSavedSidebarWidth, resetDisplaySettings, subscribeDisplaySettingsReset } from "./displayPreferences";
import { getThemeState, setThemePreference } from "./themeState";
import { getZoomLevel, setZoomLevel } from "./zoomState";
import { getSubfoldersVisible, setSubfoldersVisible } from "./subfolderVisibilityState";
import { getItemActionsVisible, setItemActionsVisible } from "./itemActionsVisibilityState";
import * as actions from "./shellActions";

let dom: JSDOM | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom?.window.close();
});

function installDom() {
  dom = new JSDOM("<!doctype html>", { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  return dom.window.localStorage;
}

test("restores sidebar widths within supported bounds and tolerates unavailable storage", () => {
  const storage = installDom();
  for (const value of ["", "invalid", "Infinity", "-1"]) {
    storage.setItem("eagleSidebarWidth", value);
    expect(readSavedSidebarWidth()).toBe(256);
  }
  for (const [value, expected] of [["280", 280], ["285", 288], ["999", 352], ["100", 192]] as const) {
    storage.setItem("eagleSidebarWidth", value);
    expect(readSavedSidebarWidth()).toBe(expected);
  }
  writeSavedSidebarWidth(312);
  expect(readSavedSidebarWidth()).toBe(312);
  vi.stubGlobal("window", { get localStorage() { throw new Error("Storage disabled"); } });
  expect(readSavedSidebarWidth()).toBe(256);
  expect(() => writeSavedSidebarWidth(280)).not.toThrow();
});

test("resets display preferences and mounted views while preserving unrelated browser data", () => {
  const storage = installDom();
  const pageSize = vi.spyOn(actions, "changePageSize").mockImplementation(() => {});
  const viewMode = vi.spyOn(actions, "selectViewMode").mockImplementation(() => {});
  storage.setItem("eagleRecentTags", '["keep"]');
  storage.setItem("other-app-setting", "keep");
  for (const key of ["eagleSidebarWidth", "eagleSidebarOpen", "eagleFolderSectionsOpen", "eagleTagSectionsCollapsed", "eagleSubfoldersCollapsed"]) storage.setItem(key, "custom");
  setThemePreference("dark");
  setZoomLevel(5);
  setSubfoldersVisible(true);
  setItemActionsVisible(false);
  const listener = vi.fn();
  const unsubscribe = subscribeDisplaySettingsReset(listener);
  try {
    resetDisplaySettings();
    expect(getThemeState().preference).toBe("system");
    expect(getZoomLevel()).toBe(2);
    expect(getSubfoldersVisible()).toBe(false);
    expect(getItemActionsVisible()).toBe(true);
    expect(storage.getItem("eagleShowItemActions")).toBe("true");
    expect(readSavedSidebarWidth()).toBe(256);
    expect(storage.getItem("eagleTagSectionsCollapsed")).toBeNull();
    expect(storage.getItem("eagleSubfoldersCollapsed")).toBeNull();
    expect(storage.getItem("eagleRecentTags")).toBe('["keep"]');
    expect(storage.getItem("other-app-setting")).toBe("keep");
    expect(pageSize).toHaveBeenCalledWith(30);
    expect(viewMode).toHaveBeenCalledWith("tiles");
    expect(listener).toHaveBeenCalledOnce();
  } finally { unsubscribe(); }
  resetDisplaySettings();
  expect(listener).toHaveBeenCalledOnce();
});

test("reset still notifies mounted views when browser storage is disabled", () => {
  installDom();
  vi.spyOn(actions, "changePageSize").mockImplementation(() => {});
  vi.spyOn(actions, "selectViewMode").mockImplementation(() => {});
  vi.stubGlobal("window", {
    get localStorage() { throw new Error("Storage disabled"); },
  });
  const listener = vi.fn();
  const unsubscribe = subscribeDisplaySettingsReset(listener);
  try {
    expect(() => resetDisplaySettings()).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
  } finally { unsubscribe(); }
});
