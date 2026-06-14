import { goToNextPage, goToPreviousPage } from "../shellActions";

export function Pager() {
  return (
    <nav className="pager static grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 bg-transparent pt-2.5 shadow-none backdrop-blur-none" aria-label="Pagination">
      <button id="prevButton" type="button" onClick={goToPreviousPage}>
        <span data-lucide="chevron-left" />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className="page-buttons inline-flex items-center justify-center gap-2.5" aria-label="Page shortcuts" />
      <button id="nextButton" type="button" onClick={goToNextPage}>
        <span>Next</span>
        <span data-lucide="chevron-right" />
      </button>
    </nav>
  );
}
