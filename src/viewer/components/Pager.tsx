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

const pagerButtonClassName =
  "inline-flex min-h-11 w-auto items-center justify-center gap-2 rounded-app border border-app-accent bg-white px-[18px] text-sm font-[720] text-app-accent hover:bg-app-accent-soft hover:text-app-accent-strong disabled:border-app-border disabled:bg-[#f2f5f9] disabled:text-[#9aa7b8] disabled:opacity-[0.72] max-[540px]:w-full max-[540px]:px-3.5 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";

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
      className="pager static mt-[18px] grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 bg-transparent pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 shadow-none backdrop-blur-none max-[540px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-[540px]:gap-2"
      aria-label="Pagination"
      hidden={displayHidden}
    >
      <button id="prevButton" className={`${pagerButtonClassName} max-[540px]:col-[1]`} type="button" disabled={displayPreviousDisabled} onClick={goToPreviousPage}>
        <ChevronLeftIcon />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className="page-buttons inline-flex items-center justify-center gap-2.5 max-[540px]:hidden" aria-label="Page shortcuts">
        <PageButtons current={displayCurrent} pages={displayPages} onSelect={displayOnSelectPage} />
      </div>
      <button id="nextButton" className={`${pagerButtonClassName} max-[540px]:col-[2]`} type="button" disabled={displayNextDisabled} onClick={goToNextPage}>
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
