import { DEFAULT_PAGE_SIZE, DEFAULT_VIEW_MODE, FOLDER_SECTIONS_OPEN_STORAGE_KEY, SIDEBAR_OPEN_STORAGE_KEY, TAG_SECTIONS_COLLAPSED_STORAGE_KEY } from "./constants";
import { changePageSize, selectViewMode } from "./shellActions";
import { setItemActionsVisible } from "./itemActionsVisibilityState";
import { setSubfoldersVisible } from "./subfolderVisibilityState";
import { setThemePreference, type ThemePreference } from "./themeState";
import { writeSavedViewerMode } from "./viewMode";
import { DEFAULT_ZOOM_LEVEL, setZoomLevel } from "./zoomState";

export interface DisplayPreferences {
  theme: ThemePreference;
  pageSize: number;
  showSubfolders: boolean;
  showItemActions: boolean;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  theme: "system",
  pageSize: DEFAULT_PAGE_SIZE,
  showSubfolders: false,
  showItemActions: true,
};

export const DEFAULT_SIDEBAR_WIDTH = 256;
export const SIDEBAR_WIDTH_STORAGE_KEY = "eagleSidebarWidth";
const resetListeners = new Set<() => void>();

export function readSavedSidebarWidth() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const width = saved?.trim() ? Number(saved) : NaN;
    return Number.isFinite(width) && width > 0 ? normalizeWidth(width) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function writeSavedSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(normalizeWidth(width)));
  } catch {
    // Resizing remains available without browser storage.
  }
}

function normalizeWidth(width: number) {
  return Number.isFinite(width) ? Math.min(352, Math.max(192, Math.round(width / 8) * 8)) : DEFAULT_SIDEBAR_WIDTH;
}

export function subscribeDisplaySettingsReset(listener: () => void) {
  resetListeners.add(listener);
  return () => { resetListeners.delete(listener); };
}

/** Resets browser display preferences while retaining library data and recent metadata. */
export function resetDisplaySettings(preferences: DisplayPreferences = DEFAULT_DISPLAY_PREFERENCES) {
  for (const key of [
    SIDEBAR_WIDTH_STORAGE_KEY, SIDEBAR_OPEN_STORAGE_KEY, FOLDER_SECTIONS_OPEN_STORAGE_KEY,
    TAG_SECTIONS_COLLAPSED_STORAGE_KEY, "eagleSubfoldersCollapsed", "eagleShowSubfolders",
    "eagleSlideshowSettings", "eagleShowItemActions", "eagle-media-preview-theme", "eagleViewerZoomLevel", "eagleViewMode",
  ]) {
    try { window.localStorage.removeItem(key); } catch { /* Storage is optional. */ }
  }
  setThemePreference(preferences.theme);
  setZoomLevel(DEFAULT_ZOOM_LEVEL);
  setSubfoldersVisible(preferences.showSubfolders);
  setItemActionsVisible(preferences.showItemActions);
  writeSavedViewerMode(DEFAULT_VIEW_MODE);
  changePageSize(preferences.pageSize);
  selectViewMode(DEFAULT_VIEW_MODE);
  for (const listener of resetListeners) listener();
}
