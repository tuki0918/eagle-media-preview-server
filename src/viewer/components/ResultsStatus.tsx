export function ResultsStatus() {
  return (
    <section className="status-line grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 text-sm font-[720] text-app-muted" aria-live="polite">
      <span id="resultCount">0 items</span>
      <span className="status-actions ml-auto inline-flex justify-self-end">
        <span className="view-toggle inline-flex rounded-app border border-app-border bg-app-surface p-0.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]" aria-label="View mode">
          <button id="tilesViewButton" type="button" aria-pressed="true">
            Tiles
          </button>
          <button id="gridViewButton" type="button" aria-pressed="false">
            Grid
          </button>
          <button id="tableViewButton" type="button" aria-pressed="false">
            Table
          </button>
        </span>
      </span>
    </section>
  );
}
