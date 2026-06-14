import { shellClasses } from "../shellClasses";

export function Pager() {
  return (
    <nav className={shellClasses.pager} aria-label="Pagination">
      <button id="prevButton" type="button">
        <span data-lucide="chevron-left" />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className={shellClasses.pageButtons} aria-label="Page shortcuts" />
      <button id="nextButton" type="button">
        <span>Next</span>
        <span data-lucide="chevron-right" />
      </button>
    </nav>
  );
}
