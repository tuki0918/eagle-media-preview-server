import { useSyncExternalStore } from "react";
import { LayoutDashboard, LayoutGrid, List, ZoomIn, type LucideIcon } from "lucide-react";
import { getResultsStatusState, subscribeResultsStatusState } from "../resultsStatusState";
import { selectViewMode } from "../shellActions";
import type { ViewerMode } from "../types";
import { getZoomLevel, setZoomLevel, subscribeZoomLevel, ZOOM_LEVEL_MAX, ZOOM_LEVEL_MIN } from "../zoomState";

const dockSurfaceClassName =
  "pointer-events-auto flex h-12 items-center gap-1 rounded-full border border-border bg-[color-mix(in_srgb,var(--card)_86%,transparent)] px-1.5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl";

export function ViewerDock({ viewMode }: { viewMode?: ViewerMode }) {
  const storedStatus = useSyncExternalStore(subscribeResultsStatusState, getResultsStatusState, getResultsStatusState);
  const displayViewMode = viewMode ?? storedStatus.viewMode;

  return (
    <div className="viewer-dock pointer-events-none fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-[calc(16px+env(safe-area-inset-right))] z-20 flex items-center gap-2 min-[720px]:bottom-6 min-[720px]:right-6">
      {displayViewMode === "list" ? null : <ZoomControl />}
      <div className={dockSurfaceClassName} role="radiogroup" aria-label="View mode">
        <ViewModeButton id="tilesViewButton" mode="tiles" label="Tiles" icon={LayoutDashboard} active={displayViewMode === "tiles"} />
        <ViewModeButton id="gridViewButton" mode="grid" label="Grid" icon={LayoutGrid} active={displayViewMode === "grid"} />
        <ViewModeButton id="listViewButton" mode="list" label="List" icon={List} active={displayViewMode === "list"} />
      </div>
    </div>
  );
}

function ZoomControl() {
  const level = useSyncExternalStore(subscribeZoomLevel, getZoomLevel, getZoomLevel);
  return (
    <label className={`${dockSurfaceClassName} gap-2.5 pl-3.5 pr-4 max-[540px]:hidden`} title="Thumbnail size">
      <ZoomIn className="size-[18px] shrink-0 text-foreground" aria-hidden="true" />
      <input
        id="zoomSlider"
        className="zoom-slider h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
        type="range"
        min={ZOOM_LEVEL_MIN}
        max={ZOOM_LEVEL_MAX}
        step={1}
        value={level}
        aria-label="Thumbnail size"
        onChange={(event) => setZoomLevel(Number(event.currentTarget.value))}
      />
      <span className="w-6 text-right text-xs font-medium tabular-nums text-muted-foreground" aria-hidden="true">
        ×{level}
      </span>
    </label>
  );
}

function ViewModeButton({
  active,
  icon: Icon,
  id,
  label,
  mode,
}: {
  active: boolean;
  icon: LucideIcon;
  id: string;
  label: string;
  mode: ViewerMode;
}) {
  return (
    <button
      id={id}
      className={`inline-grid size-9 place-items-center rounded-full border-0 transition-colors ${active ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      data-state={active ? "active" : "inactive"}
      title={label}
      onClick={() => selectViewMode(mode)}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
