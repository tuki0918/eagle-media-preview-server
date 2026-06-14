import { createRoot, type Root } from "react-dom/client";
import type { PageButton } from "../pagination";
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

const roots = new WeakMap<HTMLElement, Root>();

export function Pager({
  current = 1,
  hidden = false,
  nextDisabled = false,
  onSelectPage = () => {},
  pages = [],
  previousDisabled = false,
}: PagerProps) {
  return (
    <nav
      className="pager static grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 bg-transparent pt-2.5 shadow-none backdrop-blur-none"
      aria-label="Pagination"
      hidden={hidden}
    >
      <button id="prevButton" type="button" disabled={previousDisabled} onClick={goToPreviousPage}>
        <ChevronLeftIcon />
        <span>Previous</span>
      </button>
      <div id="pageButtons" className="page-buttons inline-flex items-center justify-center gap-2.5" aria-label="Page shortcuts">
        <PageButtons current={current} pages={pages} onSelect={onSelectPage} />
      </div>
      <button id="nextButton" type="button" disabled={nextDisabled} onClick={goToNextPage}>
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

export function renderPagerView(container: HTMLElement, props: Required<PagerProps>) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<Pager {...props} />);
}
