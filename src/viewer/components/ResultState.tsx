import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type ResultStateViewProps =
  | { kind: "message"; text: string; className?: string }
  | { kind: "empty"; hasActiveFilters: boolean; onClearFilters: () => void };

const emptyMessageClassName = "rounded-md border border-dashed border-border bg-card px-3.5 py-11 text-center text-muted-foreground";
const errorMessageClassName = `${emptyMessageClassName} text-destructive`;
const emptyStateClassName =
  "col-span-full grid min-h-[320px] content-center justify-items-center gap-2.5 rounded-xl border border-dashed border-border bg-card px-5 py-14 text-center shadow-sm ring-0";
const emptyStateButtonClassName = "mt-1 min-h-[38px] rounded-lg text-[13px] font-[680]";

export function ResultStateView(props: ResultStateViewProps) {
  if (props.kind === "message") {
    return <div className={messageClassName(props.className)}>{props.text}</div>;
  }

  return (
    <Card className={emptyStateClassName}>
      <strong className="text-[17px] font-[760] text-foreground">{props.hasActiveFilters ? "No items matched these filters" : "No items found"}</strong>
      <p className="m-0 max-w-[420px] text-sm leading-[1.55] text-muted-foreground">
        {props.hasActiveFilters
          ? "Try changing the search text, folder, extension, or rating to widen the results."
          : "This page has no items yet. Refresh or change the current view to load another range."}
      </p>
      {props.hasActiveFilters ? (
        <Button type="button" variant="outline" className={emptyStateButtonClassName} onClick={props.onClearFilters}>
          Clear filters
        </Button>
      ) : null}
    </Card>
  );
}

function messageClassName(className?: string) {
  if (className === "error") return errorMessageClassName;
  if (!className || className === "empty") return emptyMessageClassName;
  return className;
}
