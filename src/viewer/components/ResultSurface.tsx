import { useSyncExternalStore } from "react";
import {
  getResultSurfaceState,
  subscribeResultSurfaceState,
  type ResultSurfaceState,
} from "../resultSurfaceState";
import type { ViewerMode } from "../types";
import { ResultList } from "./ResultList";
import { ResultStateView } from "./ResultState";

interface ResultSurfaceProps {
  state?: ResultSurfaceState;
}

export function ResultSurface({ state }: ResultSurfaceProps) {
  const storedState = useSyncExternalStore(subscribeResultSurfaceState, getResultSurfaceState, getResultSurfaceState);
  const surfaceState = state ?? storedState;
  const isEmpty = surfaceState.kind !== "list" || !surfaceState.items.length;

  return (
    <section id="grid" className={resultSurfaceClassName(surfaceState.viewMode, isEmpty)} aria-label="Eagle assets">
      {surfaceState.kind === "list" ? (
        <ResultList items={surfaceState.items} viewMode={surfaceState.viewMode} onOpenPreview={surfaceState.onOpenPreview} />
      ) : (
        <ResultStateView {...surfaceState} />
      )}
    </section>
  );
}

function resultSurfaceClassName(viewMode: ViewerMode = "grid", isEmpty = true) {
  const modeClassName = viewMode === "table" ? "media-table" : viewMode === "tiles" ? "media-tiles" : "media-grid";
  return `${modeClassName}${isEmpty ? " is-empty" : ""}`;
}
