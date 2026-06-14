import { createRoot, type Root } from "react-dom/client";
import type { ViewerMode } from "../types";

type ResultStateViewProps =
  | { kind: "message"; text: string; className?: string }
  | { kind: "empty"; hasActiveFilters: boolean; onClearFilters: () => void };

type ResultSurfaceStateProps = ResultStateViewProps & {
  viewMode?: ViewerMode;
};

const roots = new WeakMap<HTMLElement, Root>();

export function ResultStateView(props: ResultStateViewProps) {
  if (props.kind === "message") {
    return <div className={props.className || "empty"}>{props.text}</div>;
  }

  return (
    <section className="empty-state">
      <strong>{props.hasActiveFilters ? "No items matched these filters" : "No items found"}</strong>
      <p>
        {props.hasActiveFilters
          ? "Try changing the search text, folder, extension, or rating to widen the results."
          : "This page has no items yet. Refresh or change the current view to load another range."}
      </p>
      {props.hasActiveFilters ? (
        <button type="button" className="text-button empty-state-button" onClick={props.onClearFilters}>
          Clear filters
        </button>
      ) : null}
    </section>
  );
}

function resultSurfaceClassName(viewMode: ViewerMode = "grid", isEmpty = true) {
  const modeClassName = viewMode === "table" ? "media-table" : viewMode === "tiles" ? "media-tiles" : "media-grid";
  return `${modeClassName}${isEmpty ? " is-empty" : ""}`;
}

export function renderResultStateView(container: HTMLElement, props: ResultSurfaceStateProps) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(
    <section id="grid" className={resultSurfaceClassName(props.viewMode, true)} aria-label="Eagle assets">
      <ResultStateView {...props} />
    </section>,
  );
}

export function clearResultStateView(container: HTMLElement) {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
}
