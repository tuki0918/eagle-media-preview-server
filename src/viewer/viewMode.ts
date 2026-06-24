import { DEFAULT_VIEW_MODE } from "./constants";
import type { ViewerMode } from "./types";

const VIEW_MODE_STORAGE_KEY = "eagleViewMode";

export function isViewerMode(value: string): value is ViewerMode {
  return value === "grid" || value === "tiles" || value === "list";
}

export function savedViewerMode(value: string | null): ViewerMode {
  return value && isViewerMode(value) ? value : DEFAULT_VIEW_MODE;
}

export function readSavedViewerMode(storage: Storage | undefined = browserStorage()): ViewerMode {
  try {
    return savedViewerMode(storage?.getItem(VIEW_MODE_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_VIEW_MODE;
  }
}

export function writeSavedViewerMode(mode: ViewerMode, storage: Storage | undefined = browserStorage()) {
  try {
    storage?.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // View mode persistence is a convenience; the in-memory mode still updates.
  }
}

export function needsViewModeReload(previousMode: ViewerMode, nextMode: ViewerMode) {
  return nextMode === "tiles" || previousMode === "tiles";
}

function browserStorage() {
  return typeof window === "undefined" ? undefined : window.localStorage;
}
