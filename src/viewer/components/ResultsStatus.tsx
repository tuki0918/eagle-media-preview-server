import { useSyncExternalStore } from "react";
import { getResultsStatusState, subscribeResultsStatusState } from "../resultsStatusState";
import { selectViewMode } from "../shellActions";
import type { ViewerMode } from "../types";

interface ResultsStatusProps {
  total?: number;
  viewMode?: ViewerMode;
}

export function ResultsStatus({ total, viewMode }: ResultsStatusProps) {
  const storedStatus = useSyncExternalStore(subscribeResultsStatusState, getResultsStatusState, getResultsStatusState);
  const displayTotal = total ?? storedStatus.total;
  const displayViewMode = viewMode ?? storedStatus.viewMode;

  return (
    <section className="status-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-sm font-[720] text-app-muted max-[540px]:gap-2 max-[540px]:text-xs" aria-live="polite">
      <span id="resultCount" className="justify-self-start whitespace-nowrap">{displayTotal.toLocaleString()} items</span>
      <span className="status-actions ml-auto inline-flex justify-self-end">
        <span className="view-toggle inline-flex justify-self-end rounded-app border border-app-border bg-app-surface p-0.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" aria-label="View mode">
          <ViewModeButton id="tilesViewButton" mode="tiles" selectedMode={displayViewMode} label="Tiles" />
          <ViewModeButton id="gridViewButton" mode="grid" selectedMode={displayViewMode} label="Grid" />
          <ViewModeButton id="tableViewButton" mode="table" selectedMode={displayViewMode} label="Table" />
        </span>
      </span>
    </section>
  );
}

function ViewModeButton({
  id,
  label,
  mode,
  selectedMode,
}: {
  id: string;
  label: string;
  mode: ViewerMode;
  selectedMode: ViewerMode;
}) {
  const pressed = selectedMode === mode;
  const className = [
    "min-h-[30px] rounded-md border-0 px-[9px] text-xs font-[680]",
    pressed
      ? "bg-blue-600 text-white shadow-[0_1px_3px_rgba(37,99,235,0.28)] hover:bg-blue-700 hover:text-white"
      : "bg-transparent text-app-muted hover:bg-app-surface-soft hover:text-app-text",
  ].filter(Boolean).join(" ");
  return (
    <button id={id} className={className} type="button" aria-pressed={pressed} onClick={() => selectViewMode(mode)}>
      {label}
    </button>
  );
}
