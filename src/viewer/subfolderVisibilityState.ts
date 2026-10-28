const SUBFOLDERS_VISIBLE_STORAGE_KEY = "eagleShowSubfolders";
const listeners = new Set<() => void>();
let subfoldersVisible = readStoredVisibility();

export function getSubfoldersVisible() {
  return subfoldersVisible;
}

export function initializeSubfoldersVisible() {
  updateVisibility(readStoredVisibility());
}

export function setSubfoldersVisible(visible: boolean) {
  try {
    window.localStorage.setItem(SUBFOLDERS_VISIBLE_STORAGE_KEY, String(visible));
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  updateVisibility(visible);
}

export function subscribeSubfoldersVisible(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateVisibility(visible: boolean) {
  if (subfoldersVisible === visible) return;
  subfoldersVisible = visible;
  for (const listener of listeners) listener();
}

function readStoredVisibility() {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SUBFOLDERS_VISIBLE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}
