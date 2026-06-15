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
  const modeClassName = viewMode === "table"
    ? "media-table grid content-start gap-0 overflow-hidden rounded-app border border-app-border bg-app-surface shadow-app-soft"
    : viewMode === "tiles"
      ? "media-tiles content-start [column-width:180px] [column-gap:4px] max-[540px]:[column-count:3] max-[540px]:[column-width:auto] max-[540px]:[column-gap:3px]"
      : "media-grid grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))] min-[720px]:gap-3.5 min-[720px]:[grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]";
  return `${modeClassName}${isEmpty ? " is-empty block overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none [column-width:auto] [column-gap:normal]" : ""}`;
}
