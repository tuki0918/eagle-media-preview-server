import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import {
  getResultSurfaceState,
  subscribeResultSurfaceState,
  type ResultSurfaceState,
} from "../resultSurfaceState";
import { DEFAULT_VIEW_MODE } from "../constants";
import { setListAreaWidth } from "../listColumns";
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
  const sectionRef = useRef<HTMLElement>(null);
  useListAreaWidth(sectionRef, surfaceState.viewMode === "list");

  return (
    <section ref={sectionRef} id="grid" className={resultSurfaceClassName(surfaceState.viewMode, isEmpty)} aria-label="Media items">
      {surfaceState.kind === "list" ? (
        <ResultList items={surfaceState.items} viewMode={surfaceState.viewMode} onOpenPreview={surfaceState.onOpenPreview} filters={surfaceState.filters} />
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

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// The list picks its table or compact layout from the results area's width (it shares the row with
// the sidebar), measured before paint so the first frame already has the right layout.
function useListAreaWidth(ref: { current: HTMLElement | null }, active: boolean) {
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    setListAreaWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setListAreaWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);
}
