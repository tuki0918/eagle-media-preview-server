const ITEM_ACTIONS_VISIBLE_STORAGE_KEY = "eagleShowItemActions";
const listeners = new Set<() => void>();
let itemActionsVisible = readStoredVisibility();

export function getItemActionsVisible() {
  return itemActionsVisible;
}

export function initializeItemActionsVisible() {
  updateVisibility(readStoredVisibility());
}

export function setItemActionsVisible(visible: boolean) {
  try {
    window.localStorage.setItem(ITEM_ACTIONS_VISIBLE_STORAGE_KEY, String(visible));
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
  updateVisibility(visible);
}

export function subscribeItemActionsVisible(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateVisibility(visible: boolean) {
  if (itemActionsVisible === visible) return;
  itemActionsVisible = visible;
  for (const listener of listeners) listener();
}

function readStoredVisibility() {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(ITEM_ACTIONS_VISIBLE_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}
