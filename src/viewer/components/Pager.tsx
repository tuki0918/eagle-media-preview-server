import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
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
  "min-h-10 w-auto rounded-full px-[18px] text-sm font-medium pager-compact:row-start-2 pager-compact:w-full pager-compact:px-3.5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";

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
  const pageSummary = pageSummaryLabel(displayCurrent, displayPages);

  if (displayHidden) {
    return <div className="pager pager-spacer h-[82px] shrink-0" aria-hidden="true" />;
  }

  return (
    <div className="w-full [container:pager/inline-size]">
      <nav
        className="pager static mt-[18px] grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 bg-transparent pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 shadow-none backdrop-blur-none pager-compact:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] pager-compact:gap-2"
        aria-label="Pagination"
      >
        <Button id="prevButton" className={`${pagerButtonClassName} pager-compact:col-[1]`} variant="outline" type="button" disabled={displayPreviousDisabled} onClick={goToPreviousPage}>
          <ChevronLeftIcon data-icon="inline-start" />
          <span>Previous</span>
        </Button>
        <div id="pageButtons" className="page-buttons inline-flex items-center justify-center gap-2.5 pager-compact:hidden" aria-label="Page shortcuts">
          <PageButtons current={displayCurrent} pages={displayPages} onSelect={displayOnSelectPage} />
        </div>
        <div id="pageSummary" className="hidden min-h-6 items-center justify-center text-xs text-muted-foreground [font-variant-numeric:tabular-nums] pager-compact:col-span-2 pager-compact:row-start-1 pager-compact:flex" aria-live="polite">
          {pageSummary}
        </div>
        <Button id="nextButton" className={`${pagerButtonClassName} pager-compact:col-[2]`} variant="outline" type="button" disabled={displayNextDisabled} onClick={goToNextPage}>
          <span>Next</span>
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </nav>
    </div>
  );
}

function pageSummaryLabel(current: number, pages: readonly PageButton[]) {
  const lastPage = [...pages].reverse().find((page): page is number => typeof page === "number");
  if (!lastPage) return `Page ${current.toLocaleString()}`;
  return `Page ${current.toLocaleString()} of ${lastPage.toLocaleString()}`;
}

function ChevronLeftIcon(props: { "data-icon"?: "inline-start" | "inline-end" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: { "data-icon"?: "inline-start" | "inline-end" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
