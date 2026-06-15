import { useSyncExternalStore } from "react";
import type { PageButton } from "../pagination";
import { getPagerState, subscribePagerState } from "../pagerState";
import { goToNextPage, goToPreviousPage } from "../shellActions";
import { PageButtons } from "./PageButtons";

interface PagerProps {
  current?: number;
  hidden?: boolean;
  nextDisabled?: boolean;
  onSelectPage?: (page: number) => void;
  pages?: readonly PageButton[];
  previousDisabled?: boolean;
}

export function Pager({
  current,
  hidden,
  nextDisabled,
  onSelectPage,
  pages,
  previousDisabled,
}: PagerProps) {
  const state = useSyncExternalStore(subscribePagerState, getPagerState, getPagerState);
  const displayCurrent = current ?? state.current;
  const displayHidden = hidden ?? state.hidden;
  const displayNextDisabled = nextDisabled ?? state.nextDisabled;
  const displayOnSelectPage = onSelectPage ?? state.onSelectPage;
  const displayPages = pages ?? state.pages;
  const displayPreviousDisabled = previousDisabled ?? state.previousDisabled;

  return (
    <nav
      className="pager static grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 bg-transparent pt-2.5 shadow-none backdrop-blur-none"
      aria-label="Pagination"
      hidden={displayHidden}
    >
      <button id="prevButton" type="button" disabled={displayPreviousDisabled} onClick={goToPreviousPage}>
        <ChevronLeftIcon />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className="page-buttons inline-flex items-center justify-center gap-2.5" aria-label="Page shortcuts">
        <PageButtons current={displayCurrent} pages={displayPages} onSelect={displayOnSelectPage} />
      </div>
      <button id="nextButton" type="button" disabled={displayNextDisabled} onClick={goToNextPage}>
        <span>Next</span>
        <ChevronRightIcon />
      </button>
    </nav>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
