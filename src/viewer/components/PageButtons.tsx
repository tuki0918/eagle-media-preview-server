import { Button } from "@/components/ui/button";
import type { PageButton } from "../pagination";

interface PageButtonsProps {
  current: number;
  pages: readonly PageButton[];
  onSelect: (page: number) => void;
}

const pageButtonClassName =
  "h-11 min-w-11 rounded-lg px-3 text-sm font-[720] data-[active=true]:border-app-accent data-[active=true]:bg-app-accent data-[active=true]:text-white data-[active=true]:shadow-[0_8px_18px_rgba(20,99,243,0.22)]";

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
          <Button key={page} className={pageButtonClassName} variant="outline" type="button" data-active={page === current ? "true" : "false"} onClick={() => onSelect(page)}>
            {page}
          </Button>
        );
      })}
    </>
  );
}
