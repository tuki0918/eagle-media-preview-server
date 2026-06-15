import type { PageButton } from "../pagination";

interface PageButtonsProps {
  current: number;
  pages: readonly PageButton[];
  onSelect: (page: number) => void;
}

const pageButtonClassName =
  "inline-grid h-11 min-w-11 place-items-center rounded-app border border-app-border bg-white text-sm font-[720] text-app-text hover:border-[rgba(37,99,235,0.22)] hover:bg-app-accent-soft hover:text-app-accent-strong data-[active=true]:border-app-accent data-[active=true]:bg-app-accent data-[active=true]:text-white data-[active=true]:shadow-[0_8px_18px_rgba(20,99,243,0.22)]";

export function PageButtons({ current, pages, onSelect }: PageButtonsProps) {
  return (
    <>
      {pages.map((page, index) => {
        if (page === "...") {
          return (
            <span key={`ellipsis-${index}`} className="page-ellipsis inline-grid h-11 min-w-11 place-items-center rounded-app border border-app-border bg-white text-sm font-[720] text-app-muted">
              ...
            </span>
          );
        }
        return (
          <button key={page} className={pageButtonClassName} type="button" data-active={page === current ? "true" : "false"} onClick={() => onSelect(page)}>
            {page}
          </button>
        );
      })}
    </>
  );
}
