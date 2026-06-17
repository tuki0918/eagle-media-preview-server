import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaUrl } from "../api";
import {
  formatBytes,
  formatDate,
  formatDateShort,
  formatDimensions,
  formatDuration,
  formatDurationCell,
  isTimedMedia,
  originalFileName,
} from "../format";
import { thumbnailAriaLabel, thumbnailMediaType, thumbnailOverlayIcon } from "../media";
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

const mediaCardClassName = "media-card min-w-0 overflow-hidden rounded-lg border border-border bg-card p-0 py-0 shadow-sm ring-0 transition-shadow hover:border-border hover:shadow-md";
const cardMetaClassName = "card-meta px-2 pb-2 pt-[9px] [&>span]:mt-0.5 [&>span]:block [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&>span]:text-xs [&>span]:text-muted-foreground [&>strong]:block [&>strong]:min-w-0 [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:whitespace-nowrap [&>strong]:text-[13px] [&>strong]:font-[420] [&>strong]:leading-[1.3]";
const tileButtonClassName =
  "tile-item relative block h-full w-full cursor-zoom-in overflow-hidden border-0 bg-muted p-0 shadow-none [border-radius:0] [contain:layout_paint] [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-contain";
const gridThumbButtonClassName =
  "thumb-button relative block aspect-[3/2] w-full touch-manipulation overflow-hidden border-0 bg-muted p-0 shadow-none [border-radius:0] [transition:border-color_150ms_ease,box-shadow_150ms_ease,background-color_150ms_ease] hover:border-border hover:shadow-[inset_0_0_0_1px_var(--border)] focus-visible:border-border focus-visible:shadow-[inset_0_0_0_1px_var(--border)] [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-cover";
const rowThumbButtonClassName =
  "row-thumb relative h-[42px] w-[70px] touch-manipulation overflow-hidden rounded-md border border-border bg-muted p-0 [transition:border-color_150ms_ease,box-shadow_150ms_ease,background-color_150ms_ease] hover:border-border hover:shadow-[inset_0_0_0_1px_var(--border)] focus-visible:border-border focus-visible:shadow-[inset_0_0_0_1px_var(--border)] [&>img]:block [&>img]:h-full [&>img]:w-full [&>img]:object-cover";
const missingThumbClassName = "grid place-items-center bg-muted";
const overlayClassName =
  "thumb-overlay pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-[opacity,background-color] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100";
const overlayIconClassName =
  "thumb-overlay-icon inline-grid h-[42px] w-[42px] place-items-center rounded-full bg-background text-foreground shadow-sm [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";
const fileNameOverlayClassName =
  "thumb-file-name-overlay pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex min-h-12 items-end bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.78))] px-2 pb-2 pt-6 text-left opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100";
const fileNameOverlayTextClassName =
  "block min-w-0 truncate text-xs font-[720] leading-tight text-white drop-shadow-sm";
const durationBadgeClassName =
  "duration-badge absolute bottom-1.5 right-1.5 rounded-md bg-[rgba(15,23,42,0.78)] px-1.5 py-[3px] text-[10px] font-bold leading-[1.2] text-white";
const tableRowClassName =
  "media-row grid min-h-[70px] grid-cols-[78px_minmax(160px,1.8fr)_90px_90px_minmax(120px,1fr)_90px_130px] items-center gap-3 border-b border-border px-3 py-2 text-[13px] text-muted-foreground last:border-b-0 max-[540px]:grid-cols-[56px_minmax(0,1fr)] [&>span:not(.row-name-cell)]:justify-self-center [&>span:not(.row-name-cell)]:text-center";
const tableHeaderClassName =
  `${tableRowClassName} media-row-header !min-h-8 !py-1 bg-muted text-xs font-[760] text-muted-foreground [&>span:nth-child(2)]:justify-self-stretch [&>span:nth-child(2)]:text-left max-[540px]:[&>span:nth-child(2)]:pl-3.5 max-[540px]:[&>span:nth-child(n+3)]:hidden`;
const rowNameCellClassName =
  "row-name-cell grid min-w-0 content-center justify-items-start gap-1.5 overflow-hidden text-left justify-self-stretch max-[540px]:grid-cols-[minmax(0,1fr)_auto] max-[540px]:items-center max-[540px]:pl-3.5 [&_.rating-control]:justify-self-start max-[540px]:[&_.rating-control]:col-span-2 max-[540px]:[&_.rating-control]:row-start-2";
const rowFileNameClassName =
  "row-file-name block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap justify-self-start text-left max-[540px]:col-start-1 max-[540px]:row-start-1";
const tableMobileMetaClassName =
  "table-mobile-meta hidden text-[11px] leading-[1.3] text-muted-foreground max-[540px]:col-start-2 max-[540px]:row-start-1 max-[540px]:block max-[540px]:justify-self-end max-[540px]:whitespace-nowrap max-[540px]:text-right";
const tableHiddenOnMobileClassName = "max-[540px]:hidden";
const cardRatingClassName =
  "rating-control absolute bottom-1.5 left-1.5 z-[2] inline-flex items-center gap-0 rounded-md bg-[rgba(15,23,42,0.78)] px-1 py-[3px] leading-[1.2] text-white [&_.rating-star]:h-3 [&_.rating-star]:w-3 [&_.rating-star]:text-[10px] [&_.rating-star]:text-[rgba(255,255,255,0.34)] [&_.rating-star[data-active=true]]:text-yellow-300";
const tableRatingClassName = "rating-control inline-flex items-center justify-self-start gap-px text-left";
const tileMasonryBaseWidth = 168;
const tileMasonryGap = 4;
const tileMasonryRowHeight = 4;

const extensionColorClassNames: Record<string, string> = {
  jpg: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  jpeg: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  png: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
  html: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
  css: "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]",
  js: "border-[#fde68a] bg-[#fefce8] text-[#a16207]",
  mjs: "border-[#fde68a] bg-[#fefce8] text-[#a16207]",
  cjs: "border-[#fde68a] bg-[#fefce8] text-[#a16207]",
  ts: "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]",
  tsx: "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]",
  jsx: "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]",
  md: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
  txt: "border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]",
  log: "border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]",
  json: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
  xml: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
  csv: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
  yml: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
  yaml: "border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]",
  gif: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]",
  webp: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]",
  svg: "border-[#99f6e4] bg-[#f0fdfa] text-[#0f766e]",
  mp4: "border-[#ddd6fe] bg-[#f5f3ff] text-[#7c3aed]",
  mov: "border-[#ddd6fe] bg-[#f5f3ff] text-[#7c3aed]",
  webm: "border-[#ddd6fe] bg-[#f5f3ff] text-[#7c3aed]",
  m4v: "border-[#ddd6fe] bg-[#f5f3ff] text-[#7c3aed]",
  avi: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
  mkv: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
  mp3: "border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d]",
  wav: "border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d]",
  m4a: "border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d]",
  aac: "border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d]",
  ogg: "border-[#fbcfe8] bg-[#fdf2f8] text-[#be185d]",
  pdf: "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]",
};

const fileBadgeColorClassNames: Record<string, string> = {
  jpg: "bg-[rgba(22,163,74,0.92)] text-white",
  jpeg: "bg-[rgba(22,163,74,0.92)] text-white",
  png: "bg-[rgba(20,99,243,0.92)] text-white",
  gif: "bg-[rgba(14,165,233,0.92)] text-white",
  webp: "bg-[rgba(14,165,233,0.92)] text-white",
  svg: "bg-[rgba(15,118,110,0.92)] text-white",
  mp4: "bg-[rgba(124,58,237,0.92)] text-white",
  mov: "bg-[rgba(124,58,237,0.92)] text-white",
  webm: "bg-[rgba(124,58,237,0.92)] text-white",
  m4v: "bg-[rgba(124,58,237,0.92)] text-white",
  avi: "bg-[rgba(217,119,6,0.94)] text-white",
  mkv: "bg-[rgba(217,119,6,0.94)] text-white",
  mp3: "bg-[rgba(219,39,119,0.92)] text-white",
  wav: "bg-[rgba(219,39,119,0.92)] text-white",
  m4a: "bg-[rgba(219,39,119,0.92)] text-white",
  aac: "bg-[rgba(219,39,119,0.92)] text-white",
  ogg: "bg-[rgba(219,39,119,0.92)] text-white",
  html: "bg-[#fff7ed] text-[#c2410c]",
  css: "bg-[#eff6ff] text-[#2563eb]",
  js: "bg-[#fefce8] text-[#a16207]",
  mjs: "bg-[#fefce8] text-[#a16207]",
  cjs: "bg-[#fefce8] text-[#a16207]",
  ts: "bg-[#eef2ff] text-[#4338ca]",
  tsx: "bg-[#eef2ff] text-[#4338ca]",
  jsx: "bg-[#eef2ff] text-[#4338ca]",
  md: "bg-[#f8fafc] text-[#475569]",
  txt: "bg-[#f1f5f9] text-[#334155]",
  log: "bg-[#f1f5f9] text-[#334155]",
  json: "bg-[#ecfdf5] text-[#047857]",
  xml: "bg-[#ecfdf5] text-[#047857]",
  csv: "bg-[#ecfdf5] text-[#047857]",
  yml: "bg-[#ecfdf5] text-[#047857]",
  yaml: "bg-[#ecfdf5] text-[#047857]",
};

export function ResultList({ items, viewMode, onOpenPreview }: ResultListProps) {
  return (
    <>
      {viewMode === "table" && items.length ? <TableHeader /> : null}
      {items.map((item, index) => (
        <ResultItem key={String(item.id || item.name || index)} item={item} viewMode={viewMode} onOpenPreview={onOpenPreview} />
      ))}
    </>
  );
}

function ResultItem({ item, viewMode, onOpenPreview }: { item: EagleItem; viewMode: ViewerMode; onOpenPreview: (item: EagleItem) => void }) {
  if (viewMode === "table") return <TableRow item={item} onOpenPreview={onOpenPreview} />;
  if (viewMode === "tiles") return <TileItem item={item} onOpenPreview={onOpenPreview} />;
  return <GridCard item={item} onOpenPreview={onOpenPreview} />;
}

function GridCard({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  return (
    <Card className={mediaCardClassName}>
      <ThumbnailButton variant="grid" item={item} onOpenPreview={onOpenPreview} withBadges withOverlay>
        <RatingStars item={item} className={cardRatingClassName} />
      </ThumbnailButton>
      <div className={cardMetaClassName}>
        <strong title={originalFileName(item)}>{item.name || item.id || ""}</strong>
        <span hidden />
      </div>
    </Card>
  );
}

function TileItem({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  const width = Number(item.width);
  const height = Number(item.height);
  return (
    <ThumbnailButton
      variant="tile"
      item={item}
      onOpenPreview={onOpenPreview}
      style={{
        aspectRatio: width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1",
        gridRowEnd: `span ${tileMasonrySpan(width, height)}`,
      }}
      withBadges
      withFileBadge={false}
      withFileNameOverlay
    />
  );
}

function tileMasonrySpan(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return 22;
  const targetHeight = tileMasonryBaseWidth * (height / width);
  const span = Math.ceil((targetHeight + tileMasonryGap) / (tileMasonryRowHeight + tileMasonryGap));
  return Math.min(96, Math.max(12, span));
}

function TableHeader() {
  return (
    <div className={tableHeaderClassName}>
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

function TableRow({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  return (
    <article className={tableRowClassName}>
      <ThumbnailButton variant="row" item={item} onOpenPreview={onOpenPreview} />
      <TableNameCell item={item} />
      <ExtensionPill item={item} />
      <TableCell value={formatBytes(item.size) || "-"} className={tableHiddenOnMobileClassName} />
      <TableCell value={formatDimensions(item) || "-"} className={`dimensions-cell ${tableHiddenOnMobileClassName}`} />
      <TableCell value={formatDurationCell(item) || "-"} className={`duration-cell ${tableHiddenOnMobileClassName}`} />
      <TableCell value={formatDateShort(item.modificationTime) || "-"} className={`modified-cell ${tableHiddenOnMobileClassName}`} title={formatDate(item.modificationTime) || ""} />
    </article>
  );
}

function TableNameCell({ item }: { item: EagleItem }) {
  return (
    <span className={rowNameCellClassName}>
      <span className={rowFileNameClassName} title={originalFileName(item)}>
        {item.name || item.id || ""}
      </span>
      <span className={tableMobileMetaClassName}>
        {[((item.ext || "").toUpperCase() || "FILE"), formatBytes(item.size)].filter(Boolean).join(" · ")}
      </span>
      <RatingStars item={item} className={tableRatingClassName} />
    </span>
  );
}

function TableCell({ className = "", title = "", value }: { className?: string; title?: string; value: string }) {
  return (
    <span className={className} title={title || undefined}>
      {value}
    </span>
  );
}

function ExtensionPill({ item }: { item: EagleItem }) {
  const ext = normalizeExt(item.ext || "file");
  return (
    <Badge variant="outline" className={`ext-pill inline-flex h-auto w-fit min-w-11 justify-center rounded-md px-[7px] py-[3px] text-[11px] font-[760] max-[540px]:hidden ${extensionColorClassNames[ext] || "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"}`} data-ext={ext}>
      {String(ext).toUpperCase()}
    </Badge>
  );
}

function ThumbnailButton({ children, item, onOpenPreview, style, variant, withBadges = false, withFileBadge = true, withFileNameOverlay = false, withOverlay = false }: ThumbnailButtonProps) {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const mediaType = thumbnailMediaType(item);
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
      <img
        className={loading || missing ? "opacity-0" : undefined}
        alt={item.name || item.id || ""}
        decoding="async"
        hidden={missing}
        loading="lazy"
        src={mediaUrl(String(item.id || ""), "thumb")}
        onError={() => {
          setLoading(false);
          setMissing(true);
        }}
        onLoad={() => {
          setLoading(false);
          setMissing(false);
        }}
      />
      {loading ? <LoadingIndicator variant={variant} /> : null}
      {missing ? <span className="pointer-events-none absolute inset-0 z-[1] grid place-items-center text-[11px] font-[760] tracking-[0] text-muted-foreground">NO PREVIEW</span> : null}
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
          <span className={fileNameOverlayTextClassName}>{originalFileName(item) || item.name || item.id || ""}</span>
        </span>
      ) : null}
      {withBadges ? (
        <>
          {withFileBadge ? (
            <Badge className={`file-badge absolute left-1.5 top-1.5 h-auto max-w-[calc(100%_-_12px)] overflow-hidden text-ellipsis whitespace-nowrap rounded-md border-0 px-1.5 py-[3px] text-[10px] font-[720] leading-[1.2] ${fileBadgeColorClassName(item.ext)}`} data-ext={normalizeExt(item.ext || "file")}>
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
    <Skeleton
      className="pointer-events-none absolute left-1/2 top-1/2 z-[2] size-[22px] -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-ring"
      aria-hidden="true"
    />
  );
}

function normalizeExt(value: unknown) {
  return String(value || "file").toLowerCase();
}

function fileBadgeColorClassName(ext: unknown) {
  return fileBadgeColorClassNames[normalizeExt(ext)] || "bg-[rgba(20,99,243,0.92)] text-white";
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
