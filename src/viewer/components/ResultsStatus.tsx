import { useSyncExternalStore } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <section className="status-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-sm font-[720] text-muted-foreground max-[540px]:gap-2 max-[540px]:text-xs" aria-live="polite">
      <span id="resultCount" className="justify-self-start whitespace-nowrap">{displayTotal.toLocaleString()} items</span>
      <span className="status-actions ml-auto inline-flex justify-self-end">
        <Tabs
          className="view-toggle justify-self-end"
          value={displayViewMode}
          aria-label="View mode"
          onValueChange={(mode) => {
            if (mode) selectViewMode(mode as ViewerMode);
          }}
        >
          <TabsList className="rounded-lg border border-input bg-card shadow-sm">
            <ViewModeButton id="tilesViewButton" mode="tiles" label="Tiles" />
            <ViewModeButton id="gridViewButton" mode="grid" label="Grid" />
            <ViewModeButton id="tableViewButton" mode="table" label="Table" />
          </TabsList>
        </Tabs>
      </span>
    </section>
  );
}

function ViewModeButton({
  id,
  label,
  mode,
}: {
  id: string;
  label: string;
  mode: ViewerMode;
}) {
  return (
    <TabsTrigger
      id={id}
      className="min-h-[30px] rounded-md px-[9px] text-xs font-[680] data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm data-active:hover:bg-primary data-active:hover:text-primary-foreground"
      value={mode}
    >
      {label}
    </TabsTrigger>
  );
}
