export const ZOOM_LEVEL_MIN = 1;
export const ZOOM_LEVEL_MAX = 5;
export const DEFAULT_ZOOM_LEVEL = 2;

const ZOOM_STORAGE_KEY = "eagleViewerZoomLevel";
const TILE_ROW_HEIGHTS = [140, 190, 240, 300, 380];
const GRID_COLUMN_WIDTHS = [132, 168, 210, 260, 320];
const listeners = new Set<() => void>();

let currentZoomLevel = readStoredZoomLevel();

export function getZoomLevel() {
  return currentZoomLevel;
}

export function setZoomLevel(level: number) {
  const nextLevel = clampZoomLevel(level);
  if (nextLevel === currentZoomLevel) return;
  currentZoomLevel = nextLevel;
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(nextLevel));
  } catch {
    // Ignore unavailable storage; the in-memory level still updates.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeZoomLevel(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function tileRowHeight(level: number) {
  return TILE_ROW_HEIGHTS[clampZoomLevel(level) - 1];
}

export function gridColumnWidth(level: number) {
  return GRID_COLUMN_WIDTHS[clampZoomLevel(level) - 1];
}

function clampZoomLevel(level: number) {
  if (!Number.isFinite(level)) return DEFAULT_ZOOM_LEVEL;
  return Math.min(ZOOM_LEVEL_MAX, Math.max(ZOOM_LEVEL_MIN, Math.round(level)));
}

function readStoredZoomLevel() {
  try {
    if (typeof window === "undefined") return DEFAULT_ZOOM_LEVEL;
    const stored = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    return stored === null ? DEFAULT_ZOOM_LEVEL : clampZoomLevel(Number(stored));
  } catch {
    return DEFAULT_ZOOM_LEVEL;
  }
}
