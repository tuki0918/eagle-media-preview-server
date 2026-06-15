import type { EagleItem, ViewerMode } from "./types";

export type ResultSurfaceState =
  | {
    kind: "list";
    items: readonly EagleItem[];
    onOpenPreview: (item: EagleItem) => void;
    viewMode: ViewerMode;
  }
  | {
    className?: string;
    kind: "message";
    text: string;
    viewMode: ViewerMode;
  }
  | {
    hasActiveFilters: boolean;
    kind: "empty";
    onClearFilters: () => void;
    viewMode: ViewerMode;
  };

const noopClear = () => {};
const listeners = new Set<() => void>();
let currentResultSurface: ResultSurfaceState = {
  hasActiveFilters: false,
  kind: "empty",
  onClearFilters: noopClear,
  viewMode: "grid",
};

export function getResultSurfaceState() {
  return currentResultSurface;
}

export function setResultSurfaceState(nextState: ResultSurfaceState) {
  currentResultSurface = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeResultSurfaceState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
