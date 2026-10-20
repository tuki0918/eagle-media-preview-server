import { useSyncExternalStore } from "react";
import {
  getResultSurfaceState,
  subscribeResultSurfaceState,
  type ResultSurfaceState,
} from "../resultSurfaceState";
import { DEFAULT_VIEW_MODE } from "../constants";
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
      ) : surfaceState.kind === "empty" ? (
        <ResultStateView {...surfaceState} viewMode={surfaceState.viewMode} />
      ) : (
        <ResultStateView {...surfaceState} />
      )}
    </section>
  );
}

function resultSurfaceClassName(viewMode: ViewerMode = DEFAULT_VIEW_MODE, isEmpty = true) {
  const modeClassName = viewMode === "list"
    ? "media-list grid content-start gap-0 overflow-hidden rounded-2xl border border-border bg-card"
    : viewMode === "tiles"
      ? "media-tiles flex flex-wrap content-start gap-3 min-[720px]:gap-4 max-[540px]:gap-1.5 max-[540px]:[--tile-scale:0.6]"
      : "media-grid grid content-start gap-x-4 gap-y-6 [grid-template-columns:repeat(auto-fill,minmax(min(var(--grid-col-w,168px),42vw),1fr))] max-[540px]:gap-x-3 max-[540px]:gap-y-4";
  return `${modeClassName}${isEmpty ? " is-empty !block overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none" : ""}`;
}
