import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { canFallbackMedia, mediaUrl } from "../api";
import {
  formatBytes,
  normalizeRating,
  formatDate,
  formatDateShort,
  formatDimensions,
  formatDuration,
  formatDurationCell,
  displayFileName,
  isTimedMedia,
  mediaTypeLabel,
  itemTags,
  originalFileName,
} from "../format";
import { COMPACT_LIST_MAX_WIDTH, getListAreaWidth, getListColumns, listColumnLayout, subscribeListAreaWidth, subscribeListColumns, type ListColumnId, type ListColumnLayout } from "../listColumns";
import { hasNoThumbnail, thumbnailAriaLabel, thumbnailMediaType, thumbnailOverlayIcon } from "../media";
import type { EagleItem, ViewerMode } from "../types";
import { RatingStars } from "./RatingStars";

interface ResultListProps {
  items: readonly EagleItem[];
  viewMode: ViewerMode;
  onOpenPreview: (item: EagleItem) => void;
  /** List rows turn their Type and Tags labels into filter toggles when these are set. */
  filters?: ListFilters;
  /** List-view columns; defaults to the user's saved choice. */
  listColumns?: readonly ListColumnId[];
}

export interface ListFilters {
  activeExt: string;
  activeTags: readonly string[];
  onToggleExt: (ext: string) => void;
  onToggleTag: (tag: string) => void;
}

interface ThumbnailButtonProps {
  children?: ReactNode;
  item: EagleItem;
  onOpenPreview: (item: EagleItem) => void;
  style?: CSSProperties;
  variant: "grid" | "row" | "tile";
  withBadges?: boolean;
  withFileBadge?: boolean;
  withFileNameOverlay?: boolean;
  withOverlay?: boolean;
}

const overlayIconPaths = {
  play: <path d="M8 5v14l11-7z" />,
  "move-diagonal": (
    <>
      <polyline points="13 5 19 5 19 11" />
      <polyline points="11 19 5 19 5 13" />
      <line x1="19" x2="5" y1="5" y2="19" />
    </>
  ),
};

const mediaCardClassName = "media-card media-card-enter group/card grid min-w-0 content-start gap-2 border-0 bg-transparent p-0 py-0 shadow-none ring-0";
const cardMetaClassName = "card-meta grid min-w-0 gap-0.5 px-0.5 [&>span]:block [&>span]:min-w-0 [&>span]:truncate [&>span]:text-[11px] [&>span]:uppercase [&>span]:tracking-[0.04em] [&>span]:text-muted-foreground [&>strong]:block [&>strong]:min-w-0 [&>strong]:truncate [&>strong]:text-[13px] [&>strong]:font-medium [&>strong]:leading-[1.3] [&>strong]:text-foreground";
const cardMetaDetailsClassName =
  "flex min-w-0 items-center justify-between gap-2 text-[11px] uppercase tracking-[0.04em] text-muted-foreground [&>span]:min-w-0 [&>span]:truncate [&>span:last-child]:shrink-0";
const tileButtonClassName =
  "tile-item media-card-enter relative block min-w-0 cursor-zoom-in overflow-hidden rounded-md border-0 bg-muted p-0 shadow-none [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-cover [&>img]:transition-[transform,filter] [&>img]:duration-300 hover:[&>img]:scale-[1.02] hover:[&>img]:brightness-[0.97]";
const gridThumbButtonClassName =
  "thumb-button relative block aspect-square w-full touch-manipulation overflow-hidden rounded-lg border-0 bg-muted p-0 shadow-none [transition:box-shadow_150ms_ease,background-color_150ms_ease] hover:shadow-[0_0_0_1px_var(--border),0_12px_28px_-16px_rgba(15,23,42,0.35)] focus-visible:shadow-[0_0_0_2px_var(--ring)] [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-contain [&>img]:p-[6%] [&>img]:transition-opacity [&>img]:duration-300";
const rowThumbButtonClassName =
  "row-thumb relative h-11 w-11 touch-manipulation overflow-hidden rounded-md border-0 bg-muted p-0 [transition:box-shadow_150ms_ease] hover:shadow-[0_0_0_1px_var(--border)] focus-visible:shadow-[0_0_0_2px_var(--ring)] [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-cover";
const missingThumbClassName = "grid place-items-center bg-muted";
const overlayClassName =
  "thumb-overlay pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-[opacity,background-color] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100";
const overlayIconClassName =
  "thumb-overlay-icon inline-grid h-10 w-10 place-items-center rounded-full bg-[color-mix(in_srgb,var(--background)_88%,transparent)] text-foreground shadow-sm backdrop-blur [&_svg]:h-4 [&_svg]:w-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";
const fileNameOverlayClassName =
  "thumb-file-name-overlay pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex min-h-12 items-end bg-[linear-gradient(180deg,transparent,rgba(10,10,12,0.62))] px-2.5 pb-2 pt-6 text-left opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100";
const fileNameOverlayTextClassName =
  "block min-w-0 truncate text-xs font-medium leading-tight text-white";
const durationBadgeClassName =
  "duration-badge absolute bottom-1.5 right-1.5 rounded-full bg-[rgba(10,10,12,0.62)] px-2 py-[3px] text-[10px] font-semibold leading-[1.2] text-white backdrop-blur";
// Rows share one grid template (--list-cols, see listColumns.ts and styles.css). A results area too
// narrow for every chosen column gets the compact list instead, so the table never overflows.
const listTableRowClassName =
  "media-row grid min-h-[60px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors last:border-b-0 hover:bg-muted/40 [&>span:not(.list-lead):not(.row-tags-cell):not(.row-text-cell)]:justify-self-center [&>span:not(.list-lead):not(.row-tags-cell):not(.row-text-cell)]:text-center";
const listTableHeaderClassName =
  `${listTableRowClassName} media-row-header !min-h-9 !py-1 bg-transparent text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground hover:bg-transparent [&>.row-text-cell]:text-left`;
// The thumbnail and the name and/or rating share the first cell.
const listLeadClassName = "list-lead flex min-w-0 items-center gap-3 justify-self-stretch";
// Narrow results areas: thumbnail, then the name with its rating and one line of details. Fixed;
// the column choice only applies to the table.
const compactRowClassName =
  "media-row media-row-compact grid min-h-[60px] grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors last:border-b-0 hover:bg-muted/40";
// Compact rows: name with its rating stars underneath on the left, details in two short lines on the right.
const compactBodyClassName = "list-compact-body grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-left";
const compactNameClassName = "row-file-name block min-w-0 max-w-full truncate text-left font-medium text-foreground";
const compactDetailsClassName =
  "list-compact-details col-start-2 row-start-1 grid justify-items-end gap-0.5 whitespace-nowrap text-right text-[11px] leading-[1.3] text-muted-foreground [font-variant-numeric:tabular-nums]";
const compactExtraClassName = "list-compact-extra col-span-2 min-w-0";
const compactTextClassName = "block min-w-0 truncate text-[11px] leading-[1.3] text-muted-foreground";
const rowNameCellClassName =
  "row-name-cell grid min-w-0 flex-1 content-center justify-items-start gap-1 overflow-hidden text-left text-foreground [&_.rating-control]:justify-self-start";
const rowFileNameClassName =
  "row-file-name block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left font-medium";
const listTextCellClassName = "row-text-cell block min-w-0 justify-self-stretch truncate text-left";
const listUrlLinkClassName = "text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";
const listTagsCellClassName = "row-tags-cell flex min-w-0 flex-wrap items-center gap-1 justify-self-stretch py-0.5";
const pillClassName =
  "inline-flex h-auto min-h-[22px] max-w-full items-center rounded-full border px-2 py-[2px] text-[11px] font-medium leading-[1.3]";
const filterPillClassName =
  `${pillClassName} filter-pill cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;
// Static pills (smart folders, where filters don't apply) keep the look but drop the pointer and hover.
const staticTagPillClassName = `${pillClassName} tag-pill border-border bg-secondary text-secondary-foreground`;
const tagPillClassName =
  `${filterPillClassName} tag-pill border-border bg-secondary text-secondary-foreground hover:border-foreground/30 hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground`;
const tagOverflowButtonClassName =
  `${filterPillClassName} tag-overflow-button border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground`;
const extPillClassName =
  "ext-pill inline-flex h-auto w-fit min-w-11 justify-center justify-self-center rounded-full border border-border bg-muted px-2 py-[3px] text-[10px] font-semibold tracking-[0.04em] text-muted-foreground";
const LIST_VISIBLE_TAGS = 6;
const cardRatingClassName =
  "rating-control absolute bottom-2 left-2 z-[2] inline-flex items-center gap-0 rounded-full bg-[rgba(10,10,12,0.55)] px-1.5 py-[3px] leading-[1.2] text-white backdrop-blur [&_.rating-star]:h-3 [&_.rating-star]:w-3 [&_.rating-star]:text-[10px] [&_.rating-star]:text-[rgba(255,255,255,0.34)] [&_.rating-star[data-active=true]]:text-yellow-300";
const listTableRatingClassName = "rating-control inline-flex items-center justify-self-start gap-px text-left [&_.rating-star]:h-4 [&_.rating-star]:w-4 [&_.rating-star]:text-[13px]";
const fileBadgeClassName = "bg-[rgba(10,10,12,0.55)] text-white backdrop-blur";
const TILE_MIN_RATIO = 0.4;
const TILE_MAX_RATIO = 3;
// Cards and tiles sweep left to right within each row; rows barely wait for the ones above.
const ENTER_COLUMN_DELAY_MS = 90;
const ENTER_ROW_DELAY_MS = 50;
const ENTER_MAX_ROWS = 6;
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ResultList({ items, viewMode, onOpenPreview, filters, listColumns }: ResultListProps) {
  const tileFillerRef = useRef<HTMLSpanElement>(null);
  const gridAnchorRef = useRef<HTMLSpanElement>(null);
  useLastTileRowFit(tileFillerRef, viewMode === "tiles" ? items : null);
  useEnterStagger(gridAnchorRef, ":scope > .media-card", viewMode === "grid" ? items : null);
  useEnterStagger(tileFillerRef, ":scope > .tile-item", viewMode === "tiles" ? items : null);
  const storedColumns = useSyncExternalStore(subscribeListColumns, getListColumns, getListColumns);
  const selectedColumns = listColumns ?? storedColumns;
  const listLayout = useMemo(() => listColumnLayout(selectedColumns), [selectedColumns]);
  const areaWidth = useSyncExternalStore(subscribeListAreaWidth, getListAreaWidth, getListAreaWidth);
  // Two compact patterns: narrow areas get a fixed one; wider areas without room for the table get
  // one built from the chosen columns, so the column picker still has an effect there.
  const listMode: ListRowMode = viewMode !== "list" || areaWidth >= listLayout.minWidth ? listLayout
    : areaWidth < COMPACT_LIST_MAX_WIDTH ? "compact" : { compact: listLayout };
  const compact = listMode !== listLayout;
  return (
    <>
      {viewMode === "list" && !compact && items.length ? <ListTableHeader layout={listLayout} /> : null}
      {items.map((item, index) => (
        <ResultItem key={String(item.id || item.name || index)} item={item} viewMode={viewMode} onOpenPreview={onOpenPreview} filters={filters} listLayout={listMode} />
      ))}
      {viewMode === "grid" && items.length ? <span ref={gridAnchorRef} className="grid-enter-anchor hidden" aria-hidden="true" /> : null}
      {viewMode === "tiles" && items.length ? <span ref={tileFillerRef} className="tile-filler h-0 grow-[999999]" aria-hidden="true" /> : null}
    </>
  );
}

/** Table layout, the fixed compact pattern, or the compact pattern built from the chosen columns. */
type ListRowMode = ListColumnLayout | "compact" | { compact: ListColumnLayout };

function ResultItem({ filters, item, listLayout, viewMode, onOpenPreview }: { filters?: ListFilters; item: EagleItem; listLayout: ListRowMode; viewMode: ViewerMode; onOpenPreview: (item: EagleItem) => void }) {
  if (viewMode === "list") {
    if (listLayout === "compact") return <CompactListRow item={item} onOpenPreview={onOpenPreview} />;
    if ("compact" in listLayout) return <ColumnCompactListRow item={item} layout={listLayout.compact} filters={filters} onOpenPreview={onOpenPreview} />;
    return <ListTableRow item={item} layout={listLayout} onOpenPreview={onOpenPreview} filters={filters} />;
  }
  if (viewMode === "tiles") return <TileItem item={item} onOpenPreview={onOpenPreview} />;
  return <GridCard item={item} onOpenPreview={onOpenPreview} />;
}

function GridCard({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  return (
    <Card className={mediaCardClassName}>
      <ThumbnailButton variant="grid" item={item} onOpenPreview={onOpenPreview} withBadges withFileBadge={false} withOverlay>
        {normalizeRating(item.star) > 0 ? <RatingStars item={item} className={cardRatingClassName} /> : null}
      </ThumbnailButton>
      <div className={cardMetaClassName}>
        <strong title={originalFileName(item)}>{item.name || item.id || ""}</strong>
        <div className={cardMetaDetailsClassName}>
          <span>{(item.ext || "").toUpperCase()}</span>
          <span>{formatBytes(item.size)}</span>
        </div>
      </div>
    </Card>
  );
}

function TileItem({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  const ratio = tileAspectRatio(Number(item.width), Number(item.height));
  return (
    <ThumbnailButton
      variant="tile"
      item={item}
      onOpenPreview={onOpenPreview}
      style={{
        aspectRatio: String(ratio),
        flexBasis: `calc(var(--tile-h, 190px) * var(--tile-scale, 1) * var(--tile-fit, 1) * ${ratio})`,
        flexGrow: ratio,
      }}
      withBadges
      withFileBadge={false}
      withFileNameOverlay
    />
  );
}

// Runs after useLastTileRowFit so rows are read from the final layout. Only items that
// haven't animated yet are staggered, and their rows count from the first new one, so
// appended tiles sweep in the same way as the first batch.
function useEnterStagger(anchorRef: { current: HTMLSpanElement | null }, selector: string, items: readonly EagleItem[] | null) {
  useIsomorphicLayoutEffect(() => {
    const container = anchorRef.current?.parentElement;
    if (!items || !container) return;
    const fresh = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((item) => !item.dataset.entered);
    let row = -1;
    let column = 0;
    let rowTop = Number.NaN;
    for (const item of fresh) {
      if (item.offsetTop !== rowTop) {
        rowTop = item.offsetTop;
        row += 1;
        column = 0;
      }
      const delay = column * ENTER_COLUMN_DELAY_MS + Math.min(row, ENTER_MAX_ROWS) * ENTER_ROW_DELAY_MS;
      item.style.setProperty("--enter-delay", `${delay}ms`);
      item.dataset.entered = "true";
      column += 1;
    }
  }, [anchorRef, items]);
}

// The filler keeps the last row from stretching, which leaves it smaller than the
// justified rows above. Scale it up to the previous row's height while it still fits.
function useLastTileRowFit(fillerRef: { current: HTMLSpanElement | null }, items: readonly EagleItem[] | null) {
  useIsomorphicLayoutEffect(() => {
    const filler = fillerRef.current;
    const container = filler?.parentElement;
    if (!items || !filler || !container) return;
    const fit = () => fitLastTileRow(container, filler);
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => {
      observer.disconnect();
      resetTileRowFit(container, filler);
    };
  }, [fillerRef, items]);
}

function resetTileRowFit(container: HTMLElement, filler: HTMLElement) {
  const tiles = Array.from(container.querySelectorAll<HTMLElement>(":scope > .tile-item"));
  for (const tile of tiles) tile.style.removeProperty("--tile-fit");
  filler.style.removeProperty("display");
  return tiles;
}

function fitLastTileRow(container: HTMLElement, filler: HTMLElement) {
  const tiles = resetTileRowFit(container, filler);
  if (tiles.length < 2) return;
  const lastTop = tiles[tiles.length - 1].offsetTop;
  const lastRow = tiles.filter((tile) => tile.offsetTop === lastTop);
  const previousTile = tiles[tiles.length - lastRow.length - 1];
  if (!previousTile) return;
  const lastHeight = lastRow[0].getBoundingClientRect().height;
  const previousHeight = previousTile.getBoundingClientRect().height;
  if (!(lastHeight > 0) || !(previousHeight > lastHeight)) return;
  const gap = Number.parseFloat(getComputedStyle(container).columnGap) || 0;
  const rowWidth = lastRow.reduce((sum, tile) => sum + tile.getBoundingClientRect().width, 0);
  // The filler sits after the last tile, so it takes one more gap.
  const maxScale = (container.clientWidth - gap * lastRow.length - 1) / rowWidth;
  const scale = previousHeight / lastHeight;
  if (scale > maxScale) {
    // The row is effectively full: drop the filler and let it justify like the rows above.
    filler.style.display = "none";
    return;
  }
  for (const tile of lastRow) tile.style.setProperty("--tile-fit", String(scale));
}

function tileAspectRatio(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return 1;
  const ratio = width / height;
  return Math.round(Math.min(TILE_MAX_RATIO, Math.max(TILE_MIN_RATIO, ratio)) * 1000) / 1000;
}

const listColumnHeaders: Record<ListColumnId, { label: string; className?: string }> = {
  name: { label: "Name" },
  rating: { label: "Rating" },
  tags: { label: "Tags", className: "row-tags-cell text-left" },
  type: { label: "Type" },
  size: { label: "Size" },
  dimensions: { label: "Dimensions" },
  duration: { label: "Duration" },
  modified: { label: "Modified" },
  created: { label: "Created" },
  annotation: { label: "Annotation", className: "row-text-cell text-left" },
  url: { label: "URL", className: "row-text-cell text-left" },
};

function ListTableHeader({ layout }: { layout: ListColumnLayout }) {
  const leadLabel = layout.showName ? "Name" : layout.showRating ? "Rating" : "";
  return (
    <div className={listTableHeaderClassName} style={layout.style}>
      <span className={listLeadClassName}>
        <span className="w-11 shrink-0 text-center">Item</span>
        {leadLabel ? <span className="row-name-cell min-w-0 flex-1 truncate text-left">{leadLabel}</span> : null}
      </span>
      {layout.columns.map((id) => (
        <span key={id} className={listColumnHeaders[id].className} data-list-col={id}>
          {listColumnHeaders[id].label}
        </span>
      ))}
    </div>
  );
}

function ListTableRow({ filters, item, layout, onOpenPreview }: { filters?: ListFilters; item: EagleItem; layout: ListColumnLayout; onOpenPreview: (item: EagleItem) => void }) {
  return (
    <article className={listTableRowClassName} style={layout.style}>
      <span className={listLeadClassName}>
        <ThumbnailButton variant="row" item={item} onOpenPreview={onOpenPreview} />
        {layout.showName || layout.showRating ? <ListTableNameCell item={item} layout={layout} /> : null}
      </span>
      {layout.columns.map((id) => (
        <ListColumnCell key={id} id={id} item={item} filters={filters} />
      ))}
    </article>
  );
}

// Fixed compact pattern for narrow areas. Resolution or length only shows when there is room (styles.css).
function CompactListRow({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  const media = isTimedMedia(item) ? formatDuration(item.duration) : formatDimensions(item);
  const facts = [mediaTypeLabel(item), formatBytes(item.size)].filter(Boolean).join(" · ");
  const date = formatDateShort(item.modificationTime);
  return (
    <article className={compactRowClassName}>
      <ThumbnailButton variant="row" item={item} onOpenPreview={onOpenPreview} />
      <span className={compactBodyClassName}>
        <CompactNameBlock item={item} showName showRating />
        <span className={compactDetailsClassName}>
          <span>
            {facts}
            {media ? <span className="list-compact-wide-only">{` · ${media}`}</span> : null}
          </span>
          {date ? <span title={formatDate(item.modificationTime) || undefined}>{date}</span> : null}
        </span>
      </span>
    </article>
  );
}

// Compact pattern built from the chosen columns: name and rating on the left; the short values on the
// right, file details on one line and dates on the next; tags, annotation, and URL below.
const compactFactColumns: readonly ListColumnId[] = ["type", "size", "dimensions", "duration"];

function ColumnCompactListRow({ filters, item, layout, onOpenPreview }: { filters?: ListFilters; item: EagleItem; layout: ListColumnLayout; onOpenPreview: (item: EagleItem) => void }) {
  const chosen = (id: ListColumnId) => layout.columns.includes(id);
  const facts = compactFactColumns.filter(chosen).map((id) => compactColumnText(id, item)).filter(Boolean).join(" · ");
  const modified = formatDateShort(item.modificationTime);
  const created = formatDateShort(firstDate(item, CREATED_DATE_KEYS));
  const dates = [
    chosen("modified") && modified ? `Modified ${modified}` : "",
    chosen("created") && created ? `Created ${created}` : "",
  ].filter(Boolean).join(" · ");
  const annotation = chosen("annotation") && typeof item.annotation === "string" ? item.annotation.replace(/\s+/g, " ").trim() : "";
  const url = chosen("url") && typeof item.url === "string" ? item.url.trim() : "";
  const tags = chosen("tags") && itemTags(item).length > 0;
  return (
    <article className={`${compactRowClassName} media-row-compact-columns`}>
      <ThumbnailButton variant="row" item={item} onOpenPreview={onOpenPreview} />
      <span className={compactBodyClassName}>
        <CompactNameBlock item={item} showName={layout.showName} showRating={layout.showRating} />
        {facts || dates ? (
          <span className={compactDetailsClassName}>
            {facts ? <span>{facts}</span> : null}
            {dates ? <span>{dates}</span> : null}
          </span>
        ) : null}
        {tags ? <span className={compactExtraClassName}><ListTagsCell item={item} filters={filters} cellProps={{ "data-list-col": "tags" }} /></span> : null}
        {annotation ? <span className={`${compactExtraClassName} annotation-cell ${compactTextClassName}`} title={annotation}>{annotation}</span> : null}
        {url ? <span className={`${compactExtraClassName} [&_.url-cell]:text-[11px]`}><ListUrlCell item={item} cellProps={{ "data-list-col": "url" }} /></span> : null}
      </span>
    </article>
  );
}

function CompactNameBlock({ item, showName, showRating }: { item: EagleItem; showName: boolean; showRating: boolean }) {
  return (
    <span className="row-name-cell col-start-1 row-start-1 grid min-w-0 justify-items-start gap-1">
      {showName ? (
        <span className={compactNameClassName} title={originalFileName(item)}>
          {item.name || item.id || ""}
        </span>
      ) : null}
      {showRating ? <RatingStars item={item} className={listTableRatingClassName} /> : null}
    </span>
  );
}

function compactColumnText(id: ListColumnId, item: EagleItem) {
  switch (id) {
    case "type":
      return mediaTypeLabel(item);
    case "size":
      return formatBytes(item.size);
    case "dimensions":
      return formatDimensions(item);
    case "duration":
      return isTimedMedia(item) ? formatDuration(item.duration) : "";
    default:
      return "";
  }
}

function ListColumnCell({ filters, id, item }: { filters?: ListFilters; id: ListColumnId; item: EagleItem }) {
  const cellProps = { "data-list-col": id };
  switch (id) {
    case "tags":
      return <ListTagsCell item={item} filters={filters} cellProps={cellProps} />;
    case "type":
      return <ExtensionPill item={item} filters={filters} cellProps={cellProps} />;
    case "size":
      return <ListTableCell value={formatBytes(item.size) || "-"} cellProps={cellProps} />;
    case "dimensions":
      return <ListTableCell value={formatDimensions(item) || "-"} className="dimensions-cell" cellProps={cellProps} />;
    case "duration":
      return <ListTableCell value={formatDurationCell(item) || "-"} className="duration-cell" cellProps={cellProps} />;
    case "modified":
      return <ListTableCell value={formatDateShort(item.modificationTime) || "-"} className="modified-cell" title={formatDate(item.modificationTime) || ""} cellProps={cellProps} />;
    case "created": {
      const value = firstDate(item, CREATED_DATE_KEYS);
      return <ListTableCell value={formatDateShort(value) || "-"} className="created-cell" title={formatDate(value) || ""} cellProps={cellProps} />;
    }
    case "annotation": {
      const text = typeof item.annotation === "string" ? item.annotation.replace(/\s+/g, " ").trim() : "";
      return <ListTableCell value={text || "-"} className={`annotation-cell ${listTextCellClassName}`} title={text} cellProps={cellProps} />;
    }
    case "url":
      return <ListUrlCell item={item} cellProps={cellProps} />;
    default:
      return null;
  }
}

type ListCellProps = { "data-list-col": ListColumnId };
const CREATED_DATE_KEYS = ["btime", "createdAt", "createdTime", "creationTime", "birthTime"] as const;

function firstDate(item: EagleItem, keys: readonly string[]) {
  for (const key of keys) {
    const value = Number(item[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function ListUrlCell({ cellProps, item }: { cellProps: ListCellProps; item: EagleItem }) {
  const url = typeof item.url === "string" ? item.url.trim() : "";
  if (!url) return <ListTableCell value="-" className={`url-cell ${listTextCellClassName}`} cellProps={cellProps} />;
  const linkable = /^https?:\/\//i.test(url);
  return (
    <span className={`url-cell ${listTextCellClassName}`} title={url} {...cellProps}>
      {linkable ? <a className={listUrlLinkClassName} href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\/(www\.)?/i, "")}</a> : url}
    </span>
  );
}

function ListTableNameCell({ item, layout }: { item: EagleItem; layout: ListColumnLayout }) {
  return (
    <span className={rowNameCellClassName}>
      {layout.showName ? (
        <span className={rowFileNameClassName} title={originalFileName(item)}>
          {item.name || item.id || ""}
        </span>
      ) : null}
      {layout.showRating ? <RatingStars item={item} className={listTableRatingClassName} /> : null}
    </span>
  );
}

function ListTableCell({ cellProps, className = "", title = "", value }: { cellProps: ListCellProps; className?: string; title?: string; value: string }) {
  return (
    <span className={className || undefined} title={title || undefined} {...cellProps}>
      {value}
    </span>
  );
}

// Long tag lists stop after a few pills; the "+N" button expands the row in place.
function ListTagsCell({ cellProps, filters, item }: { cellProps: ListCellProps; filters?: ListFilters; item: EagleItem }) {
  const [expanded, setExpanded] = useState(false);
  const tags = itemTags(item);
  if (!tags.length) return <span className={`${listTagsCellClassName} text-muted-foreground`} {...cellProps}>-</span>;
  const visibleTags = expanded ? tags : tags.slice(0, LIST_VISIBLE_TAGS);
  const hiddenCount = tags.length - LIST_VISIBLE_TAGS;
  const itemLabel = item.name || item.id || "this item";
  return (
    <span className={listTagsCellClassName} {...cellProps}>
      {visibleTags.map((tag) => {
        if (!filters) {
          return <span key={tag} className={staticTagPillClassName}><span className="truncate">{tag}</span></span>;
        }
        const active = filters.activeTags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            className={tagPillClassName}
            aria-pressed={active}
            title={active ? `Remove tag filter: ${tag}` : `Filter by tag: ${tag}`}
            onClick={() => filters.onToggleTag(tag)}
          >
            <span className="truncate">{tag}</span>
          </button>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className={tagOverflowButtonClassName}
          aria-expanded={expanded}
          aria-label={expanded ? `Show fewer tags for ${itemLabel}` : `Show ${hiddenCount} more tags for ${itemLabel}`}
          title={expanded ? undefined : tags.slice(LIST_VISIBLE_TAGS).join(", ")}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "−" : `+${hiddenCount}`}
        </button>
      ) : null}
    </span>
  );
}

function ExtensionPill({ cellProps, filters, item }: { cellProps: ListCellProps; filters?: ListFilters; item: EagleItem }) {
  const ext = normalizeExt(item.ext || "file");
  const label = String(ext).toUpperCase();
  if (filters && item.ext) {
    const active = filters.activeExt === ext;
    return (
      <button
        type="button"
        className={`${extPillClassName} cursor-pointer transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground`}
        data-ext={ext}
        {...cellProps}
        aria-pressed={active}
        title={active ? `Remove type filter: ${label}` : `Filter by type: ${label}`}
        onClick={() => filters.onToggleExt(ext)}
      >
        {label}
      </button>
    );
  }
  return (
    <Badge variant="outline" className={extPillClassName} data-ext={ext} {...cellProps}>
      {label}
    </Badge>
  );
}

function ThumbnailButton({ children, item, onOpenPreview, style, variant, withBadges = false, withFileBadge = true, withFileNameOverlay = false, withOverlay = false }: ThumbnailButtonProps) {
  const noThumbnail = hasNoThumbnail(item);
  const mediaType = thumbnailMediaType(item);
  const canUseOriginalImage = mediaType === "image";
  const hasInitialSource = !noThumbnail || canUseOriginalImage;
  const [sourceKind, setSourceKind] = useState<"file" | "thumb">(
    noThumbnail && canUseOriginalImage ? "file" : "thumb",
  );
  const [loading, setLoading] = useState(hasInitialSource);
  const [missing, setMissing] = useState(!hasInitialSource);
  const duration = isTimedMedia(item) ? formatDuration(item.duration) : "";
  const trigger = usePreviewTrigger(item, onOpenPreview);
  const baseClassName = thumbnailButtonBaseClassName(variant);
  const isTimedOverlay = mediaType === "video" || mediaType === "audio";

  return (
    <button
      className={`group ${baseClassName}${loading ? " thumb-loading" : ""}${missing ? ` thumb-missing ${missingThumbClassName}` : ""}`}
      data-media-type={mediaType}
      type="button"
      aria-label={thumbnailAriaLabel(item, mediaType)}
      style={style}
      onClick={trigger.onClick}
      onPointerCancel={trigger.onPointerCancel}
      onPointerDown={trigger.onPointerDown}
      onPointerMove={trigger.onPointerMove}
      onPointerUp={trigger.onPointerUp}
    >
      {missing ? null : (
        <img
          className={loading || missing ? "opacity-0" : undefined}
          alt={item.name || item.id || ""}
          decoding="async"
          hidden={missing}
          loading="lazy"
          src={mediaUrl(String(item.id || ""), sourceKind)}
          onError={async () => {
            if (sourceKind === "thumb" && canUseOriginalImage && await canFallbackMedia()) {
              setSourceKind("file");
              setLoading(true);
              setMissing(false);
              return;
            }
            setLoading(false);
            setMissing(true);
          }}
          onLoad={() => {
            setLoading(false);
            setMissing(false);
          }}
        />
      )}
      {loading ? <LoadingIndicator variant={variant} /> : null}
      {missing ? <span className="pointer-events-none absolute inset-0 z-[1] grid place-items-center text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">NO PREVIEW</span> : null}
      {withOverlay ? (
        <span className={`${overlayClassName} ${isTimedOverlay ? "bg-[rgba(15,23,42,0.16)]" : "bg-[rgba(15,23,42,0.08)]"}`} aria-hidden="true">
          <span className={overlayIconClassName}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {overlayIconPaths[thumbnailOverlayIcon(mediaType)]}
            </svg>
          </span>
        </span>
      ) : null}
      {withFileNameOverlay ? (
        <span className={fileNameOverlayClassName} aria-hidden="true">
          <span className={fileNameOverlayTextClassName}>{displayFileName(item)}</span>
        </span>
      ) : null}
      {withBadges ? (
        <>
          {withFileBadge ? (
            <Badge className={`file-badge absolute left-1.5 top-1.5 h-auto max-w-[calc(100%_-_12px)] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border-0 px-2 py-[3px] text-[10px] font-semibold leading-[1.2] ${fileBadgeClassName}`} data-ext={normalizeExt(item.ext || "file")}>
              {(item.ext || "").toUpperCase()}
            </Badge>
          ) : null}
          <span className={durationBadgeClassName} hidden={!duration}>
            {duration}
          </span>
        </>
      ) : null}
      {children}
    </button>
  );
}

function thumbnailButtonBaseClassName(variant: ThumbnailButtonProps["variant"]) {
  if (variant === "tile") return tileButtonClassName;
  if (variant === "row") return rowThumbButtonClassName;
  return gridThumbButtonClassName;
}

function LoadingIndicator({ variant }: { variant: ThumbnailButtonProps["variant"] }) {
  if (variant === "tile") {
    return (
      <Skeleton
        className="pointer-events-none absolute inset-0 z-[4] animate-pulse rounded-none bg-muted"
        aria-hidden="true"
      />
    );
  }
  return (
    <span className="pointer-events-none absolute inset-0 z-[2] grid place-items-center" aria-hidden="true">
      <span className="loading-spinner block size-5 animate-spin rounded-full border-2 border-[color-mix(in_srgb,var(--muted-foreground)_25%,transparent)] border-t-muted-foreground" />
    </span>
  );
}

function normalizeExt(value: unknown) {
  return String(value || "file").toLowerCase();
}

function usePreviewTrigger(item: EagleItem, onOpenPreview: (item: EagleItem) => void) {
  const lastTriggerAt = useRef(0);
  const touchSession = useRef<{ pointerId: number; startX: number; startY: number; startedAt: number; moved: boolean } | null>(null);

  const openFromPointer = (event?: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
    if (Date.now() - lastTriggerAt.current < 700) return;
    if (event?.type === "touchend") {
      event.preventDefault();
    }
    lastTriggerAt.current = Date.now();
    onOpenPreview(item);
  };

  return {
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (Date.now() - lastTriggerAt.current < 700) {
        event.preventDefault();
        return;
      }
      onOpenPreview(item);
    },
    onPointerCancel: () => {
      touchSession.current = null;
    },
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      touchSession.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: Date.now(),
        moved: false,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (!touchSession.current || touchSession.current.pointerId !== event.pointerId) return;
      const deltaX = Math.abs(event.clientX - touchSession.current.startX);
      const deltaY = Math.abs(event.clientY - touchSession.current.startY);
      if (deltaX > 10 || deltaY > 10) {
        touchSession.current.moved = true;
      }
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType !== "touch") return;
      if (!touchSession.current || touchSession.current.pointerId !== event.pointerId) return;
      const heldFor = Date.now() - touchSession.current.startedAt;
      const shouldOpen = !touchSession.current.moved && heldFor <= 300;
      touchSession.current = null;
      if (shouldOpen) {
        openFromPointer(event);
      }
    },
  };
}
