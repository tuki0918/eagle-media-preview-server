import type { PageButton } from "../pagination";

interface PageButtonsProps {
  current: number;
  pages: readonly PageButton[];
  onSelect: (page: number) => void;
}

export function PageButtons({ current, pages, onSelect }: PageButtonsProps) {
  return (
    <>
      {pages.map((page, index) => {
        if (page === "...") {
          return (
            <span key={`ellipsis-${index}`} className="page-ellipsis">
              ...
            </span>
          );
        }
        return (
          <button key={page} type="button" data-active={page === current ? "true" : "false"} onClick={() => onSelect(page)}>
            {page}
          </button>
        );
      })}
    </>
  );
}
