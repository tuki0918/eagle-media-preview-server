import { Button } from "@/components/ui/button";
import type { PageButton } from "../pagination";

interface PageButtonsProps {
  current: number;
  pages: readonly PageButton[];
  onSelect: (page: number) => void;
}

const pageButtonClassName =
  "h-11 min-w-11 rounded-lg px-3 text-sm font-[720] data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-sm";

export function PageButtons({ current, pages, onSelect }: PageButtonsProps) {
  return (
    <>
      {pages.map((page, index) => {
        if (page === "...") {
          return (
            <span key={`ellipsis-${index}`} className="page-ellipsis inline-grid h-11 min-w-11 place-items-center rounded-md border border-border bg-background text-sm font-[720] text-muted-foreground">
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
