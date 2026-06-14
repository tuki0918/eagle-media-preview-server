import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
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

interface ResultListProps {
  items: readonly EagleItem[];
  viewMode: ViewerMode;
  onOpenPreview: (item: EagleItem) => void;
}

interface ThumbnailButtonProps {
  children?: ReactNode;
  className: string;
  item: EagleItem;
  onOpenPreview: (item: EagleItem) => void;
  style?: CSSProperties;
  withBadges?: boolean;
  withOverlay?: boolean;
}

const roots = new WeakMap<HTMLElement, Root>();

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
    <article className="media-card">
      <ThumbnailButton className="thumb-button" item={item} onOpenPreview={onOpenPreview} withBadges withOverlay>
        <RatingStars item={item} className="rating-control" />
      </ThumbnailButton>
      <div className="card-meta">
        <strong title={originalFileName(item)}>{item.name || item.id || ""}</strong>
        <span hidden />
      </div>
    </article>
  );
}

function TileItem({ item, onOpenPreview }: { item: EagleItem; onOpenPreview: (item: EagleItem) => void }) {
  const width = Number(item.width);
  const height = Number(item.height);
  return (
    <ThumbnailButton
      className="tile-item"
      item={item}
      onOpenPreview={onOpenPreview}
      style={{ aspectRatio: width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1" }}
      withBadges
      withOverlay
    >
      <RatingStars item={item} className="rating-control tile-rating" />
    </ThumbnailButton>
  );
}

function TableHeader() {
  return (
    <div className="media-row media-row-header">
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
    <article className="media-row">
      <ThumbnailButton className="row-thumb" item={item} onOpenPreview={onOpenPreview} />
      <TableNameCell item={item} />
      <ExtensionPill item={item} />
      <TableCell value={formatBytes(item.size) || "-"} />
      <TableCell value={formatDimensions(item) || "-"} className="dimensions-cell" />
      <TableCell value={formatDurationCell(item) || "-"} className="duration-cell" />
      <TableCell value={formatDateShort(item.modificationTime) || "-"} className="modified-cell" title={formatDate(item.modificationTime) || ""} />
    </article>
  );
}

function TableNameCell({ item }: { item: EagleItem }) {
  return (
    <span className="row-name-cell">
      <span className="row-file-name" title={originalFileName(item)}>
        {item.name || item.id || ""}
      </span>
      <span className="table-mobile-meta">
        {[((item.ext || "").toUpperCase() || "FILE"), formatBytes(item.size)].filter(Boolean).join(" · ")}
      </span>
      <RatingStars item={item} className="rating-control" />
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
  const ext = item.ext || "file";
  return (
    <span className="ext-pill" data-ext={String(ext).toLowerCase()}>
      {String(ext).toUpperCase()}
    </span>
  );
}

function ThumbnailButton({ children, className, item, onOpenPreview, style, withBadges = false, withOverlay = false }: ThumbnailButtonProps) {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const mediaType = thumbnailMediaType(item);
  const duration = isTimedMedia(item) ? formatDuration(item.duration) : "";
  const trigger = usePreviewTrigger(item, onOpenPreview);
  const buttonClassName = [className, loading ? "thumb-loading" : "", missing ? "thumb-missing" : ""].filter(Boolean).join(" ");

  return (
    <button
      className={buttonClassName}
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
      {withOverlay ? (
        <span className="thumb-overlay" aria-hidden="true">
          <span className="thumb-overlay-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {overlayIconPaths[thumbnailOverlayIcon(mediaType)]}
            </svg>
          </span>
        </span>
      ) : null}
      {withBadges ? (
        <>
          <span className="file-badge" data-ext={String(item.ext || "file").toLowerCase()}>
            {(item.ext || "").toUpperCase()}
          </span>
          <span className="duration-badge" hidden={!duration}>
            {duration}
          </span>
        </>
      ) : null}
      {children}
    </button>
  );
}

function RatingStars({ className, item }: { className: string; item: EagleItem }) {
  const current = Number(item.star || 0);
  return (
    <div className={className} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((value) => (
        <span key={value} className="rating-star rating-star-static" title={`${value}`} data-active={value <= current ? "true" : "false"} aria-hidden="true">
          ★
        </span>
      ))}
    </div>
  );
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

export function renderResultListView(container: HTMLElement, props: ResultListProps) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<ResultList {...props} />);
}

export function clearResultListView(container: HTMLElement) {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
}
