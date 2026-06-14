import { shellClasses } from "../shellClasses";

export function ResultsStatus() {
  return (
    <section className={shellClasses.statusLine} aria-live="polite">
      <span id="resultCount">0 items</span>
      <span className={shellClasses.statusActions}>
        <span className={shellClasses.viewToggle} aria-label="View mode">
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
