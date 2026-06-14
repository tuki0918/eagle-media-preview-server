import { createRoot, type Root } from "react-dom/client";
import { selectViewMode } from "../shellActions";
import type { ViewerMode } from "../types";

interface ResultsStatusProps {
  total?: number;
  viewMode?: ViewerMode;
}

const roots = new WeakMap<HTMLElement, Root>();

export function ResultsStatus({ total = 0, viewMode = "tiles" }: ResultsStatusProps) {
  return (
    <section className="status-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-sm font-[720] text-app-muted" aria-live="polite">
      <span id="resultCount">{total.toLocaleString()} items</span>
      <span className="status-actions ml-auto inline-flex justify-self-end">
        <span className="view-toggle inline-flex rounded-app border border-app-border bg-app-surface p-0.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" aria-label="View mode">
          <button id="tilesViewButton" type="button" aria-pressed={viewMode === "tiles"} onClick={() => selectViewMode("tiles")}>
            Tiles
          </button>
          <button id="gridViewButton" type="button" aria-pressed={viewMode === "grid"} onClick={() => selectViewMode("grid")}>
            Grid
          </button>
          <button id="tableViewButton" type="button" aria-pressed={viewMode === "table"} onClick={() => selectViewMode("table")}>
            Table
          </button>
        </span>
      </span>
    </section>
  );
}

export function renderResultsStatusView(container: HTMLElement, props: Required<ResultsStatusProps>) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<ResultsStatus {...props} />);
}
