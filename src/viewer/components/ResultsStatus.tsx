import { useSyncExternalStore } from "react";
import { LayoutDashboard, LayoutGrid, List, type LucideIcon } from "lucide-react";
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
          <TabsList className="rounded-lg bg-muted shadow-none">
            <ViewModeButton id="tilesViewButton" mode="tiles" label="Tiles" icon={LayoutDashboard} />
            <ViewModeButton id="gridViewButton" mode="grid" label="Grid" icon={LayoutGrid} />
            <ViewModeButton id="tableViewButton" mode="table" label="Table" icon={List} />
          </TabsList>
        </Tabs>
      </span>
    </section>
  );
}

function ViewModeButton({
  icon: Icon,
  id,
  label,
  mode,
}: {
  icon: LucideIcon;
  id: string;
  label: string;
  mode: ViewerMode;
}) {
  return (
    <TabsTrigger
      id={id}
      className="min-h-[30px] rounded-md px-[9px] text-xs font-[680] text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:hover:text-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm data-active:hover:text-foreground"
      value={mode}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      {label}
    </TabsTrigger>
  );
}
