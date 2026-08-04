import type { EagleItem } from "./types";

export interface SelectionState {
  ids: ReadonlySet<string>;
  items: readonly EagleItem[];
}

const listeners = new Set<() => void>();
let currentSelection: SelectionState = {
  ids: new Set<string>(),
  items: [],
};

export function getSelectionState() {
  return currentSelection;
}

export function subscribeSelectionState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isSelected(itemId: string) {
  return currentSelection.ids.has(itemId);
}

export function toggleSelection(item: EagleItem) {
  const itemId = selectionItemId(item);
  if (!itemId) return;

  const items = [...currentSelection.items];
  const selectedIndex = items.findIndex((entry) => selectionItemId(entry) === itemId);
  if (selectedIndex >= 0) {
    items.splice(selectedIndex, 1);
  } else {
    items.push(item);
  }
  setSelection(items);
}

export function setItemsSelected(items: readonly EagleItem[], selected: boolean) {
  const nextItems = [...currentSelection.items];
  const selectedIds = new Set(items.map(selectionItemId).filter(Boolean));

  if (selected) {
    for (const item of items) {
      const itemId = selectionItemId(item);
      if (!itemId || nextItems.some((entry) => selectionItemId(entry) === itemId)) continue;
      nextItems.push(item);
    }
  } else {
    for (let index = nextItems.length - 1; index >= 0; index -= 1) {
      if (selectedIds.has(selectionItemId(nextItems[index]))) nextItems.splice(index, 1);
    }
  }

  setSelection(nextItems);
}

export function clearSelection() {
  if (!currentSelection.items.length) return;
  setSelection([]);
}

export function selectionItemId(item: EagleItem) {
  return String(item.id || "").trim();
}

function setSelection(items: EagleItem[]) {
  const ids = new Set(items.map(selectionItemId).filter(Boolean));
  currentSelection = { ids, items };
  for (const listener of listeners) listener();
}
