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
  const displayViewMode = viewMode ?? storedStatus.viewMode;

  void total;

  return (
    <section className="status-line flex justify-end py-1" aria-label="View options">
      <ViewModeTabs viewMode={displayViewMode} />
    </section>
  );
}

export function ViewModeTabs({ viewMode }: { viewMode?: ViewerMode }) {
  const storedStatus = useSyncExternalStore(subscribeResultsStatusState, getResultsStatusState, getResultsStatusState);
  const displayViewMode = viewMode ?? storedStatus.viewMode;

  return (
    <Tabs
      className="view-toggle w-fit"
      value={displayViewMode}
      aria-label="View mode"
      onValueChange={(mode) => {
        if (mode) selectViewMode(mode as ViewerMode);
      }}
    >
      <TabsList className="rounded-lg bg-muted shadow-none" aria-label="View mode">
        <ViewModeButton id="tilesViewButton" mode="tiles" label="Tiles" icon={LayoutDashboard} />
        <ViewModeButton id="gridViewButton" mode="grid" label="Grid" icon={LayoutGrid} />
        <ViewModeButton id="listViewButton" mode="list" label="List" icon={List} />
      </TabsList>
    </Tabs>
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
      title={label}
    >
      <Icon data-icon="inline-start" aria-hidden="true" />
      <span>{label}</span>
    </TabsTrigger>
  );
}
