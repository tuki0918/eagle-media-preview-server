import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
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
  originalFileName,
} from "../format";
import { hasNoThumbnail, thumbnailAriaLabel, thumbnailMediaType, thumbnailOverlayIcon } from "../media";
import type { EagleItem, ViewerMode } from "../types";
import { RatingStars } from "./RatingStars";

interface ResultListProps {
  items: readonly EagleItem[];
  viewMode: ViewerMode;
  onOpenPreview: (item: EagleItem) => void;
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
const listTableRowClassName =
  "media-row grid min-h-[60px] grid-cols-[52px_minmax(160px,1.8fr)_80px_90px_minmax(110px,1fr)_80px_120px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors last:border-b-0 hover:bg-muted/40 max-[540px]:grid-cols-[48px_minmax(0,1fr)] [&>span:not(.row-name-cell)]:justify-self-center [&>span:not(.row-name-cell)]:text-center";
const listTableHeaderClassName =
  `${listTableRowClassName} media-row-header !min-h-9 !py-1 bg-transparent text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground hover:bg-transparent [&>span:nth-child(2)]:justify-self-stretch [&>span:nth-child(2)]:text-left max-[540px]:[&>span:nth-child(2)]:pl-3.5 max-[540px]:[&>span:nth-child(n+3)]:hidden`;
const rowNameCellClassName =
  "row-name-cell grid min-w-0 content-center justify-items-start gap-1 overflow-hidden text-left justify-self-stretch text-foreground max-[540px]:grid-cols-[minmax(0,1fr)_auto] max-[540px]:items-center max-[540px]:pl-3.5 [&_.rating-control]:justify-self-start max-[540px]:[&_.rating-control]:col-span-2 max-[540px]:[&_.rating-control]:row-start-2";
const rowFileNameClassName =
  "row-file-name block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap justify-self-start text-left font-medium max-[540px]:col-start-1 max-[540px]:row-start-1";
const listTableMobileMetaClassName =
  "list-table-mobile-meta hidden text-[11px] leading-[1.3] text-muted-foreground max-[540px]:col-start-2 max-[540px]:row-start-1 max-[540px]:block max-[540px]:justify-self-end max-[540px]:whitespace-nowrap max-[540px]:text-right";
const listTableHiddenOnMobileClassName = "max-[540px]:hidden";
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

export function ResultList({ items, viewMode, onOpenPreview }: ResultListProps) {
  const tileFillerRef = useRef<HTMLSpanElement>(null);
  const gridAnchorRef = useRef<HTMLSpanElement>(null);
  useLastTileRowFit(tileFillerRef, viewMode === "tiles" ? items : null);
  useEnterStagger(gridAnchorRef, ":scope > .media-card", viewMode === "grid" ? items : null);
  useEnterStagger(tileFillerRef, ":scope > .tile-item", viewMode === "tiles" ? items : null);
  return (
    <>
      {viewMode === "list" && items.length ? <ListTableHeader /> : null}
      {items.map((item, index) => (
        <ResultItem key={String(item.id || item.name || index)} item={item} viewMode={viewMode} onOpenPreview={onOpenPreview} />
      ))}
      {viewMode === "grid" && items.length ? <span ref={gridAnchorRef} className="grid-enter-anchor hidden" aria-hidden="true" /> : null}
      {viewMode === "tiles" && items.length ? <span ref={tileFillerRef} className="tile-filler h-0 grow-[999999]" aria-hidden="true" /> : null}
    </>
  );
}

function ResultItem({ item, viewMode, onOpenPreview }: { item: EagleItem; viewMode: ViewerMode; onOpenPreview: (item: EagleItem) => void }) {
  if (viewMode === "list") return <ListTableRow item={item} onOpenPreview={onOpenPreview} />;
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

function ListTableHeader() {
  return (
    <div className={listTableHeaderClassName}>
      <span>Item</span>
      <span>Name</span>
      <span>Type</span>
      <span>Size</span>
      <span>Dimensions</span>
      <span>Duration</span>
      <span>Modified</span>
    </div>
  );
}

function ListTableRow({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  return (
    <article className={listTableRowClassName}>
      <ThumbnailButton variant="row" item={item} onOpenPreview={onOpenPreview} />
      <ListTableNameCell item={item} />
      <ExtensionPill item={item} />
      <ListTableCell value={formatBytes(item.size) || "-"} className={listTableHiddenOnMobileClassName} />
      <ListTableCell value={formatDimensions(item) || "-"} className={`dimensions-cell ${listTableHiddenOnMobileClassName}`} />
      <ListTableCell value={formatDurationCell(item) || "-"} className={`duration-cell ${listTableHiddenOnMobileClassName}`} />
      <ListTableCell value={formatDateShort(item.modificationTime) || "-"} className={`modified-cell ${listTableHiddenOnMobileClassName}`} title={formatDate(item.modificationTime) || ""} />
    </article>
  );
}

function ListTableNameCell({ item }: { item: EagleItem }) {
  return (
    <span className={rowNameCellClassName}>
      <span className={rowFileNameClassName} title={originalFileName(item)}>
        {item.name || item.id || ""}
      </span>
      <span className={listTableMobileMetaClassName}>
        {[((item.ext || "").toUpperCase() || "FILE"), formatBytes(item.size)].filter(Boolean).join(" · ")}
      </span>
      <RatingStars item={item} className={listTableRatingClassName} />
    </span>
  );
}

function ListTableCell({ className = "", title = "", value }: { className?: string; title?: string; value: string }) {
  return (
    <span className={className} title={title || undefined}>
      {value}
    </span>
  );
}

function ExtensionPill({ item }: { item: EagleItem }) {
  const ext = normalizeExt(item.ext || "file");
  return (
    <Badge variant="outline" className="ext-pill inline-flex h-auto w-fit min-w-11 justify-center rounded-full border-border bg-muted px-2 py-[3px] text-[10px] font-semibold tracking-[0.04em] text-muted-foreground max-[540px]:hidden" data-ext={ext}>
      {String(ext).toUpperCase()}
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
