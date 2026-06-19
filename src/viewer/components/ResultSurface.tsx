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
      ) : (
        <ResultStateView {...surfaceState} />
      )}
    </section>
  );
}

function resultSurfaceClassName(viewMode: ViewerMode = DEFAULT_VIEW_MODE, isEmpty = true) {
  const modeClassName = viewMode === "list"
    ? "media-list grid content-start gap-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
    : viewMode === "tiles"
      ? "media-tiles grid content-start gap-1 [grid-auto-flow:dense] [grid-auto-rows:4px] [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] max-[540px]:grid-cols-3 max-[540px]:gap-[3px]"
      : "media-grid grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))] min-[720px]:gap-3.5 min-[720px]:[grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]";
  return `${modeClassName}${isEmpty ? " is-empty block overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none" : ""}`;
}
