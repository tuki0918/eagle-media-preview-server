import { FolderOpenIcon, InboxIcon, SearchXIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ViewerMode } from "../types";

export type ResultStateViewProps =
  | { kind: "message"; text: string; className?: string; detail?: string; title?: string }
  | {
    kind: "empty";
    /** Labels of the clearable filters (search text, tags, type, rating), shown so the user sees what narrowed the results. */
    filterLabels?: readonly string[];
    hasActiveFilters: boolean;
    hasClearableFilters?: boolean;
    onClearFilters: () => void;
    /** Leaves the current folder or smart folder; offered when the folder itself has no items. */
    onShowAllItems?: () => void;
    viewMode?: ViewerMode;
  };

const emptyMessageClassName = "rounded-md border border-dashed border-border bg-card px-3.5 py-11 text-center text-muted-foreground";
const loadingMessageClassName = "result-loading grid min-h-[clamp(280px,calc(100dvh-220px),460px)] content-center justify-items-center gap-3 text-[13px] text-muted-foreground";
const errorMessageClassName = `${emptyMessageClassName} text-destructive`;
const messageTitleClassName = "block text-[17px] font-[760] text-foreground";
const errorTitleClassName = `${messageTitleClassName} text-destructive`;
const messageDetailClassName = "mx-auto mt-2 max-w-[460px] text-sm leading-[1.55] text-muted-foreground";
const emptyStateClassName =
  "col-span-full grid content-center justify-items-center gap-3 px-5 py-12 text-center";
const emptyStateHeightClassName = "min-h-[clamp(280px,calc(100dvh-220px),460px)]";
const emptyStateIconWrapClassName = "mb-1 grid size-16 place-items-center rounded-full bg-muted shadow-[0_0_0_8px_color-mix(in_srgb,var(--muted)_45%,transparent)]";
const emptyStateIconClassName = "size-7 text-muted-foreground";
const emptyStateButtonClassName = "mt-1 min-h-[38px] rounded-lg text-[13px] font-[680]";

export function ResultStateView(props: ResultStateViewProps) {
  if (props.kind === "message" && props.className === "loading") {
    return (
      <div className={loadingMessageClassName} role="status" aria-live="polite">
        <span className="loading-spinner block size-6 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--muted-foreground)_25%,transparent)] border-t-muted-foreground" aria-hidden="true" />
        <span>{props.text}</span>
      </div>
    );
  }

  if (props.kind === "message") {
    return (
      <div className={messageClassName(props.className)}>
        {props.title ? (
          <>
            <strong className={props.className === "error" ? errorTitleClassName : messageTitleClassName}>{props.title}</strong>
            <p className={messageDetailClassName}>{props.text}</p>
          </>
        ) : props.text}
        {props.detail ? <p className={messageDetailClassName}>{props.detail}</p> : null}
      </div>
    );
  }

  const content = emptyStateContent(props);
  const EmptyIcon = content.icon;
  const filterLabels = content.showFilters ? props.filterLabels ?? [] : [];

  return (
    <div className={`${emptyStateClassName} ${emptyStateHeightClassName}`} role="status">
      <span className={emptyStateIconWrapClassName} aria-hidden="true">
        <EmptyIcon className={emptyStateIconClassName} strokeWidth={1.5} />
      </span>
      <strong className="text-[17px] font-[760] text-foreground">{content.title}</strong>
      <p className="m-0 max-w-[420px] text-sm leading-[1.55] text-muted-foreground">{content.text}</p>
      {filterLabels.length ? (
        <ul className="m-0 flex max-w-[460px] list-none flex-wrap justify-center gap-1.5 p-0" aria-label="Active filters">
          {filterLabels.map((label) => (
            <li key={label} className="max-w-full">
              <Badge variant="secondary" className="h-6 max-w-full rounded-md px-2 text-xs font-[680]">
                <span className="min-w-0 overflow-hidden text-ellipsis">{label}</span>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {content.action === "clear" ? (
        <Button type="button" variant="outline" className={emptyStateButtonClassName} onClick={props.onClearFilters}>
          Clear filters
        </Button>
      ) : content.action === "showAll" && props.onShowAllItems ? (
        <Button type="button" variant="outline" className={emptyStateButtonClassName} onClick={props.onShowAllItems}>
          Show all items
        </Button>
      ) : null}
    </div>
  );
}

function emptyStateContent(props: Extract<ResultStateViewProps, { kind: "empty" }>) {
  const hasClearableFilters = props.hasClearableFilters ?? props.hasActiveFilters;
  if (hasClearableFilters) {
    return {
      action: "clear",
      icon: SearchXIcon,
      showFilters: true,
      text: "Nothing matches the current filters. Try removing some of them or changing the search text.",
      title: "No matching items",
    } as const;
  }
  // Only a folder or smart folder is selected, so the folder itself has no items.
  if (props.hasActiveFilters) {
    return {
      action: "showAll",
      icon: FolderOpenIcon,
      showFilters: false,
      text: "There are no items in this folder yet.",
      title: "This folder is empty",
    } as const;
  }
  return {
    action: "none",
    icon: InboxIcon,
    showFilters: false,
    text: "Items you add to this library in Eagle will appear here.",
    title: "Library is empty",
  } as const;
}

function messageClassName(className?: string) {
  if (className === "error") return errorMessageClassName;
  if (!className || className === "empty") return emptyMessageClassName;
  return className;
}
