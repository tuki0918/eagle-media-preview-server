import { afterEach, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  COMPACT_LIST_MAX_WIDTH,
  DEFAULT_LIST_COLUMNS,
  getListAreaWidth,
  setListAreaWidth,
  subscribeListAreaWidth,
  LIST_COLUMNS,
  LIST_COLUMNS_STORAGE_KEY,
  getListColumns,
  initializeListColumns,
  isDefaultListColumns,
  hasCustomListColumns,
  NARROW_DEFAULT_LIST_COLUMNS,
  listColumnLayout,
  normalizeListColumns,
  resetListColumns,
  setListColumns,
  subscribeListColumns,
  toggleListColumn,
  type ListColumnId,
} from "./listColumns";
import { resetDisplaySettings } from "./displayPreferences";
import * as actions from "./shellActions";

let dom: JSDOM | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom?.window.close();
  dom = undefined;
});

function installDom() {
  dom = new JSDOM("<!doctype html>", { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  return dom.window.localStorage;
}

function style(selected: readonly ListColumnId[]) {
  return listColumnLayout(selected).style as Record<string, string>;
}

test("default columns keep the list's usual columns and widths", () => {
  const layout = listColumnLayout(DEFAULT_LIST_COLUMNS);
  expect(layout.columns).toEqual(["tags", "type", "size", "dimensions", "duration", "modified"]);
  expect(layout).toMatchObject({ showName: true, showRating: true });
  expect(style(DEFAULT_LIST_COLUMNS)).toEqual({
    "--list-cols": "minmax(196px,2.2fr) minmax(120px,2fr) 80px 80px minmax(96px,0.8fr) 72px 104px",
  });
  // 24 padding + 196 lead + 6 columns (120+80+80+96+72+104) + 6 gaps of 12
  expect(layout.minWidth).toBe(844);
});

test("the table needs room for every chosen column, and never less than the compact breakpoint", () => {
  const all = LIST_COLUMNS.map((column) => column.id);
  const layout = listColumnLayout(all);
  expect(layout.columns).toEqual(["tags", "type", "size", "dimensions", "duration", "modified", "created", "annotation", "url"]);
  expect(layout.minWidth).toBe(24 + 196 + 896 + 9 * 12);
  expect(listColumnLayout(["name", "type"]).minWidth).toBe(COMPACT_LIST_MAX_WIDTH);
});

test("the name can be turned off, leaving the rating or just the thumbnail", () => {
  expect(listColumnLayout(["rating", "type"])).toMatchObject({ showName: false, showRating: true });
  expect(style(["rating", "type"])).toEqual({ "--list-cols": "152px 80px" });
  expect(listColumnLayout(["type"])).toMatchObject({ showName: false, showRating: false });
  expect(style(["type"])).toEqual({ "--list-cols": "44px 80px" });
  expect(style([])).toEqual({ "--list-cols": "44px" });
  expect(style(["name"])["--list-cols"]).toBe("minmax(196px,2.2fr)");
});

test("shares the measured list width with subscribers", () => {
  const listener = vi.fn();
  const unsubscribe = subscribeListAreaWidth(listener);
  setListAreaWidth(500);
  setListAreaWidth(500);
  expect(getListAreaWidth()).toBe(500);
  expect(listener).toHaveBeenCalledTimes(1);
  setListAreaWidth(Number.POSITIVE_INFINITY);
  unsubscribe();
});

test("tags are on by default only where the full default table fits", () => {
  const full = listColumnLayout(DEFAULT_LIST_COLUMNS).minWidth;
  const listener = vi.fn();
  const unsubscribe = subscribeListColumns(listener);
  try {
    expect(getListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
    // A phone held sideways: the table without tags fits, so it shows instead of the compact list.
    setListAreaWidth(800);
    expect(getListColumns()).toEqual(NARROW_DEFAULT_LIST_COLUMNS);
    expect(getListColumns()).not.toContain("tags");
    expect(listColumnLayout(getListColumns()).minWidth).toBeLessThanOrEqual(800);
    expect(listener).toHaveBeenCalledTimes(1);
    setListAreaWidth(801);
    expect(listener).toHaveBeenCalledTimes(1);
    setListAreaWidth(full);
    expect(getListColumns()).toContain("tags");
    expect(listener).toHaveBeenCalledTimes(2);
  } finally {
    setListAreaWidth(Number.POSITIVE_INFINITY);
    unsubscribe();
  }
});

test("a saved choice stays put whatever the width", () => {
  const storage = installDom();
  initializeListColumns();
  setListAreaWidth(800);
  try {
    toggleListColumn("tags", true);
    expect(hasCustomListColumns()).toBe(true);
    expect(JSON.parse(storage.getItem(LIST_COLUMNS_STORAGE_KEY) || "[]")).toContain("tags");
    setListAreaWidth(1200);
    expect(getListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
    setListAreaWidth(800);
    expect(getListColumns()).toContain("tags");
    // Turning it back off matches the defaults here, so nothing is kept.
    toggleListColumn("tags", false);
    expect(hasCustomListColumns()).toBe(false);
    expect(storage.getItem(LIST_COLUMNS_STORAGE_KEY)).toBeNull();
  } finally {
    setListAreaWidth(Number.POSITIVE_INFINITY);
  }
});

test("normalizes stored columns into table order and ignores unknown ids", () => {
  expect(normalizeListColumns(["url", "bogus", "type", "type", 3])).toEqual(["type", "url"]);
  expect(normalizeListColumns("nope")).toEqual([...DEFAULT_LIST_COLUMNS]);
  expect(isDefaultListColumns([...DEFAULT_LIST_COLUMNS].reverse())).toBe(true);
  expect(isDefaultListColumns(["type"])).toBe(false);
});

test("keeps the column choice in localStorage and notifies subscribers", () => {
  const storage = installDom();
  initializeListColumns();
  const listener = vi.fn();
  const unsubscribe = subscribeListColumns(listener);

  toggleListColumn("url", true);
  toggleListColumn("tags", false);
  expect(getListColumns()).toEqual(["name", "rating", "type", "size", "dimensions", "duration", "modified", "url"]);
  expect(JSON.parse(storage.getItem(LIST_COLUMNS_STORAGE_KEY) || "[]")).toEqual(getListColumns());
  expect(listener).toHaveBeenCalledTimes(2);

  // A reload reads the saved choice back.
  setListColumns(["annotation"]);
  storage.setItem(LIST_COLUMNS_STORAGE_KEY, JSON.stringify(["created", "type"]));
  initializeListColumns();
  expect(getListColumns()).toEqual(["type", "created"]);

  resetListColumns();
  expect(getListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
  expect(hasCustomListColumns()).toBe(false);
  expect(storage.getItem(LIST_COLUMNS_STORAGE_KEY)).toBeNull();
  unsubscribe();
});

test("falls back to the defaults for unreadable storage", () => {
  const storage = installDom();
  storage.setItem(LIST_COLUMNS_STORAGE_KEY, "{not json");
  initializeListColumns();
  expect(getListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
});

test("resetting display settings restores the default columns", () => {
  const storage = installDom();
  vi.spyOn(actions, "changePageSize").mockImplementation(() => {});
  vi.spyOn(actions, "selectViewMode").mockImplementation(() => {});
  setListColumns(["url"]);
  expect(storage.getItem(LIST_COLUMNS_STORAGE_KEY)).not.toBeNull();

  resetDisplaySettings();

  expect(storage.getItem(LIST_COLUMNS_STORAGE_KEY)).toBeNull();
  expect(getListColumns()).toEqual([...DEFAULT_LIST_COLUMNS]);
});
