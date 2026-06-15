type ResultStateViewProps =
  | { kind: "message"; text: string; className?: string }
  | { kind: "empty"; hasActiveFilters: boolean; onClearFilters: () => void };

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
