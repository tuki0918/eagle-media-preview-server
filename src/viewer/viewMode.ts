import { DEFAULT_VIEW_MODE } from "./constants";
import type { ViewerMode } from "./types";

export function isViewerMode(value: string): value is ViewerMode {
  return value === "grid" || value === "tiles" || value === "table";
}

export function savedViewerMode(value: string | null): ViewerMode {
  return value && isViewerMode(value) ? value : DEFAULT_VIEW_MODE;
}

export function needsViewModeReload(previousMode: ViewerMode, nextMode: ViewerMode) {
  return nextMode === "tiles" || previousMode === "tiles";
}
