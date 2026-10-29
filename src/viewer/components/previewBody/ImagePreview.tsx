import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { mediaUrl } from "../../api";
import { hasNoThumbnail } from "../../media";
import { closePreview, stepPreview } from "../../shellActions";
import {
  getImageOverlayControlsVisible,
  setImageOverlayControlsVisible,
  subscribeImageOverlayControls,
  toggleImageOverlayControls,
} from "../../imageOverlayState";
import {
  dragPreviewTransform,
  initialPreviewScales,
  nextPreviewScales,
  nextZoomScale,
  pointerDistance,
  setPreviewZoom,
} from "../../previewTransform";
import type { EagleItem, PreviewDrag, PreviewPinch, PreviewPoint, PreviewTransform } from "../../types";
import { PreviewNotice } from "./shared";

interface ImageState {
  fitScale: number;
  naturalScale: number;
  naturalSize: { width: number; height: number } | null;
  transform: PreviewTransform;
}

const imageViewportClassName = "image-viewport relative grid h-full min-h-0 w-full min-w-0 cursor-grab touch-none place-items-center overflow-hidden active:cursor-grabbing";
const previewImageClassName =
  "preview-image absolute left-1/2 top-1/2 block max-h-none max-w-none select-none object-contain [transform-origin:center] [will-change:transform] [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:bg-[#05070a] [&:fullscreen]:object-contain";
const imageToolbarClassName =
  "image-toolbar absolute bottom-[calc(14px+env(safe-area-inset-bottom))] right-[calc(14px+env(safe-area-inset-right))] z-[2] inline-flex items-center gap-1 rounded-full border border-border bg-[color-mix(in_srgb,var(--card)_86%,transparent)] p-1.5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl";
const toolbarButtonClassName =
  "inline-grid min-h-9 w-9 touch-manipulation select-none place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";
const imageZoomLabelClassName =
  "min-w-[44px] rounded-md px-1.5 text-center text-[11px] font-[680] tabular-nums text-muted-foreground";

export function ImagePreview({ item, srcKind: requestedSrcKind }: { item: EagleItem; srcKind: "file" | "thumb" }) {
  // Fall back to the Eagle thumbnail when the browser cannot decode the original file.
  const [srcKind, setSrcKind] = useState(requestedSrcKind);
  const [loadFailed, setLoadFailed] = useState(false);
  const thumbnailUnavailable = srcKind === "thumb" && hasNoThumbnail(item);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<PreviewDrag | null>(null);
  const tapRef = useRef<{ pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const pointersRef = useRef<Map<number, PreviewPoint>>(new Map());
  const pinchRef = useRef<PreviewPinch | null>(null);
  const imageOverlayControlsVisible = useSyncExternalStore(
    subscribeImageOverlayControls,
    getImageOverlayControlsVisible,
    getImageOverlayControlsVisible,
  );
  const [imageState, setImageState] = useState<ImageState>(() => ({
    ...initialPreviewScales(),
    naturalSize: null,
  }));

  useEffect(() => {
    setSrcKind(requestedSrcKind);
    setLoadFailed(false);
  }, [item.id, requestedSrcKind]);

  useEffect(() => {
    dragRef.current = null;
    tapRef.current = null;
    pointersRef.current = new Map();
    pinchRef.current = null;
    setImageOverlayControlsVisible(true);
    setImageState({
      ...initialPreviewScales(),
      naturalSize: null,
    });
  }, [item.id, srcKind]);

  useEffect(() => {
    const refreshLayout = () => {
      const image = imageRef.current;
      const viewport = viewportRef.current;
      if (!image || !viewport || !image.naturalWidth || !image.naturalHeight) return;
      setImageState((current) => ({
        ...current,
        ...nextPreviewScales({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          viewportWidth: viewport.clientWidth,
          viewportHeight: viewport.clientHeight,
          previousFitScale: current.fitScale,
          previousTransform: current.transform,
        }),
      }));
    };
    window.addEventListener("resize", refreshLayout);
    return () => window.removeEventListener("resize", refreshLayout);
  }, []);

  const imageStyle = imageState.naturalSize
    ? {
        height: `${imageState.naturalSize.height}px`,
        transform: `translate(-50%, -50%) translate3d(${imageState.transform.x}px, ${imageState.transform.y}px, 0) scale(${imageState.transform.scale})`,
        width: `${imageState.naturalSize.width}px`,
      }
    : undefined;

  const setImageZoom = (scale: number, position: Pick<PreviewTransform, "x" | "y"> = imageState.transform) => {
    setImageState((current) => ({
      ...current,
      transform: setPreviewZoom(scale, position),
    }));
  };

  const zoomImage = useCallback((multiplier: number) => {
    setImageState((current) => ({
      ...current,
      transform: setPreviewZoom(
        nextZoomScale(current.transform.scale, multiplier, current.fitScale, current.naturalScale),
        current.transform,
      ),
    }));
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      zoomImage(event.deltaY > 0 ? 0.9 : 1.1);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [zoomImage]);

  const pointerDistanceFromState = () => pointerDistance(pointersRef.current.values());

  const startImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) return;
    if (event.pointerType === "touch") {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size === 2) {
        tapRef.current = null;
        pinchRef.current = {
          distance: pointerDistanceFromState(),
          scale: imageState.transform.scale,
        };
        dragRef.current = null;
        return;
      }
      if (pointersRef.current.size > 1) return;
    }
    tapRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: imageState.transform.x,
      originY: imageState.transform.y,
    };
  };

  const moveImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size === 2 && pinchRef.current) {
        const distance = pointerDistanceFromState();
        if (distance > 0 && pinchRef.current.distance > 0) {
          const nextScale = nextZoomScale(
            pinchRef.current.scale * (distance / pinchRef.current.distance),
            1,
            imageState.fitScale,
            imageState.naturalScale,
          );
          setImageZoom(nextScale);
        }
        return;
      }
    }

    if (tapRef.current?.pointerId === event.pointerId) {
      const deltaX = Math.abs(event.clientX - tapRef.current.startX);
      const deltaY = Math.abs(event.clientY - tapRef.current.startY);
      if (deltaX > 8 || deltaY > 8) {
        tapRef.current.moved = true;
      }
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setImageState((current) => ({
      ...current,
      transform: dragPreviewTransform(current.transform, drag, { x: event.clientX, y: event.clientY }),
    }));
  };

  const endImageDrag = (event?: PointerEvent<HTMLDivElement>) => {
    const tap = tapRef.current;
    if (event?.pointerType === "touch") {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
    }
    if (event && tap?.pointerId === event.pointerId) {
      const signedDeltaX = event.clientX - tap.startX;
      const deltaX = Math.abs(signedDeltaX);
      const deltaY = event.clientY - tap.startY;
      const canSwipe = event.pointerType === "touch"
        && pointersRef.current.size <= 1
        && imageState.transform.scale <= imageState.fitScale * 1.05;
      const canCloseFromSwipe = canSwipe && deltaY > 80 && deltaY > deltaX * 1.6;
      const canStepFromSwipe = canSwipe && deltaX > 64 && deltaX > Math.abs(deltaY) * 1.6;
      if (canCloseFromSwipe) {
        closePreview();
      } else if (canStepFromSwipe) {
        stepPreview(signedDeltaX < 0 ? 1 : -1);
      } else if (!tap.moved && pointersRef.current.size <= 1) {
        toggleImageOverlayControls();
      }
      tapRef.current = null;
    }
    if (!event || !dragRef.current || dragRef.current.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  if (thumbnailUnavailable) {
    return <PreviewNotice message="Thumbnail is unavailable" />;
  }

  return (
    <>
      <div
        ref={viewportRef}
        className={imageViewportClassName}
        onPointerDown={startImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={endImageDrag}
        onPointerCancel={endImageDrag}
        onTouchMove={(event: TouchEvent<HTMLDivElement>) => {
          if (event.touches.length > 1) event.preventDefault();
        }}
      >
        <img
          ref={imageRef}
          className={`${previewImageClassName}${imageState.naturalSize ? "" : " opacity-0"}`}
          src={mediaUrl(String(item.id || ""), srcKind)}
          alt={item.name || item.id || ""}
          draggable={false}
          style={imageStyle}
          onError={() => {
            if (srcKind === "file") setSrcKind("thumb");
            else setLoadFailed(true);
          }}
          onLoad={(event) => {
            const image = event.currentTarget;
            const viewport = viewportRef.current;
            if (!viewport) return;
            const scales = nextPreviewScales({
              imageWidth: image.naturalWidth,
              imageHeight: image.naturalHeight,
              viewportWidth: viewport.clientWidth,
              viewportHeight: viewport.clientHeight,
              previousFitScale: imageState.fitScale,
              previousTransform: imageState.transform,
            });
            setImageState({
              fitScale: scales.fitScale,
              naturalScale: scales.naturalScale,
              naturalSize: { width: image.naturalWidth, height: image.naturalHeight },
              transform: setPreviewZoom(scales.fitScale, { x: 0, y: 0 }),
            });
          }}
        />
      </div>
      {!imageState.naturalSize && !loadFailed ? (
        <span className="pointer-events-none absolute inset-0 z-[1] grid place-items-center" aria-hidden="true">
          <span className="loading-spinner block size-8 animate-spin rounded-full border-[3px] border-[color-mix(in_srgb,var(--muted-foreground)_25%,transparent)] border-t-muted-foreground" />
        </span>
      ) : null}
      {loadFailed ? <PreviewNotice message="Preview is unavailable" /> : null}
      <ImageToolbar
        visible={imageOverlayControlsVisible}
        onActualSize={() => setImageZoom(imageState.naturalScale, { x: 0, y: 0 })}
        onFit={() => {
          const image = imageRef.current;
          const viewport = viewportRef.current;
          if (!image?.naturalWidth || !image.naturalHeight || !viewport) return;
          // Initial layout keeps its margin; Fit fills the viewport along the limiting axis.
          const scale = Math.min(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
          setImageZoom(scale, { x: 0, y: 0 });
        }}
        onZoomIn={() => zoomImage(1.18)}
        onZoomOut={() => zoomImage(0.85)}
        zoomLabel={formatImageZoomLabel(imageState.transform.scale)}
      />
    </>
  );
}

function ImageToolbar({
  onActualSize,
  onFit,
  onZoomIn,
  onZoomOut,
  visible,
  zoomLabel,
}: {
  onActualSize: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  visible: boolean;
  zoomLabel: string;
}) {
  return (
    <div className={`${imageToolbarClassName} ${visible ? "opacity-100" : "pointer-events-none opacity-0"} transition-opacity duration-150`}>
      <ToolbarButton label="Zoom out" icon={<MinusIcon />} onClick={onZoomOut} />
      <span className={imageZoomLabelClassName} aria-live="polite">{zoomLabel}</span>
      <ToolbarButton label="Zoom in" icon={<PlusIcon />} onClick={onZoomIn} />
      <ToolbarButton label="Fit" icon={<MaximizeIcon />} onClick={onFit} />
      <ToolbarButton label="Actual size" icon={<Maximize2Icon />} onClick={onActualSize} />
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={toolbarButtonClassName} title={label} aria-label={label} onClick={onClick}>
      {icon}
    </button>
  );
}

function formatImageZoomLabel(scale: number) {
  if (!Number.isFinite(scale) || scale <= 0) return "100%";
  return `${Math.round(scale * 100)}%`;
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function Maximize2Icon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" x2="14" y1="3" y2="10" />
      <line x1="3" x2="10" y1="21" y2="14" />
    </svg>
  );
}
