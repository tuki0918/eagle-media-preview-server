import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { ChevronDown, Expand, Minimize, Scan } from "lucide-react";
import { IMAGE_FIT_MARGIN } from "../../constants";
import { getPreviewDialogState, subscribePreviewDialogState } from "../../previewDialogState";
import type { ImageFullscreenControls } from "../../useImageFullscreen";
import { ChevronLeftIcon, ChevronRightIcon } from "../Icons";
import { dockSurfaceClassName } from "../viewerDockStyles";
import { canFallbackMedia, mediaUrl } from "../../api";
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
import { MEDIA_SERVER_OFFLINE_MESSAGE, PreviewNotice, PreviewOverlayNotice, useMediaServerOffline } from "./shared";

interface ImageState {
  fitScale: number;
  naturalScale: number;
  naturalSize: { width: number; height: number } | null;
  transform: PreviewTransform;
}

const imageViewportClassName = "image-viewport relative grid h-full min-h-0 w-full min-w-0 touch-none place-items-center overflow-hidden";
const previewImageClassName =
  "preview-image absolute left-1/2 top-1/2 block max-h-none max-w-none select-none object-contain [transform-origin:center] [will-change:transform]";
const imageControlSurfaceClassName = dockSurfaceClassName;
const imageToolbarClassName =
  "image-toolbar absolute bottom-[calc(16px+env(safe-area-inset-bottom))] right-[calc(16px+env(safe-area-inset-right))] z-[2] flex max-w-[calc(100%_-_32px_-_env(safe-area-inset-left)_-_env(safe-area-inset-right))] items-center gap-1 min-[720px]:bottom-6 min-[720px]:right-[max(24px,env(safe-area-inset-right))]";
const toolbarButtonClassName =
  "inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";
const imageZoomSelectClassName =
  "h-9 w-[76px] touch-manipulation appearance-none rounded-full border-0 bg-transparent py-0 pl-2 pr-6 text-center text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const imageZoomPresets = [0.25, 0.5, 1, 2, 4, 8];

export function ImagePreview({ item, srcKind: requestedSrcKind, fullscreen }: { item: EagleItem; srcKind: "file" | "thumb"; fullscreen?: ImageFullscreenControls }) {
  // Fall back to the Eagle thumbnail when the browser cannot decode the original file.
  const [srcKind, setSrcKind] = useState(requestedSrcKind);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const offline = useMediaServerOffline();
  const wasOffline = useRef(offline);
  const thumbnailUnavailable = srcKind === "thumb" && hasNoThumbnail(item);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const layoutModeRef = useRef<"initial" | "fit" | "manual">("initial");
  const previousFullscreen = useRef(false);
  const fullscreenActive = useRef(false);
  fullscreenActive.current = Boolean(fullscreen?.active);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
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
    if (previousFullscreen.current !== Boolean(fullscreen?.active)) {
      layoutModeRef.current = "manual";
      previousFullscreen.current = Boolean(fullscreen?.active);
    }
  }, [fullscreen?.active]);

  useEffect(() => {
    setSrcKind(requestedSrcKind);
    setLoadFailed(false);
  }, [item.id, requestedSrcKind]);

  // Load the image again once the server is back, since the failed or stalled request won't recover.
  useEffect(() => {
    if (wasOffline.current && !offline && !imageState.naturalSize) {
      setSrcKind(requestedSrcKind);
      setLoadFailed(false);
      setLoadAttempt((attempt) => attempt + 1);
    }
    wasOffline.current = offline;
  }, [offline]);

  useEffect(() => {
    layoutModeRef.current = "initial";
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
      setImageState((current) => {
        const scales = nextPreviewScales({
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          viewportWidth: viewport.clientWidth,
          viewportHeight: viewport.clientHeight,
          previousFitScale: current.fitScale,
          previousTransform: current.transform,
        });
        const preserve = fullscreenActive.current || document.fullscreenElement || layoutModeRef.current === "manual";
        return {
          ...current,
          ...scales,
          transform: preserve ? current.transform : layoutModeRef.current === "fit"
            ? setPreviewZoom(scales.fitScale / IMAGE_FIT_MARGIN, { x: 0, y: 0 })
            : scales.transform,
        };
      });
    };
    window.addEventListener("resize", refreshLayout);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refreshLayout);
    if (viewportRef.current) observer?.observe(viewportRef.current);
    return () => {
      window.removeEventListener("resize", refreshLayout);
      observer?.disconnect();
    };
  }, []);

  const imageStyle = imageState.naturalSize
    ? {
        height: `${imageState.naturalSize.height}px`,
        transform: `translate(-50%, -50%) translate3d(${imageState.transform.x}px, ${imageState.transform.y}px, 0) scale(${imageState.transform.scale})`,
        width: `${imageState.naturalSize.width}px`,
      }
    : undefined;

  const setImageZoom = (scale: number, position: Pick<PreviewTransform, "x" | "y"> = imageState.transform) => {
    layoutModeRef.current = "manual";
    setImageState((current) => ({
      ...current,
      transform: imageZoomTransform(scale, position, current.naturalSize, viewportRef.current),
    }));
  };

  const zoomImage = useCallback((multiplier: number) => {
    layoutModeRef.current = "manual";
    setImageState((current) => ({
      ...current,
      transform: imageZoomTransform(
        nextZoomScale(current.transform.scale, multiplier, current.fitScale, current.naturalScale),
        current.transform,
        current.naturalSize,
        viewportRef.current,
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

  const canPanImage = () => {
    const viewport = viewportRef.current;
    const size = imageState.naturalSize;
    if (!viewport || !size) return false;
    const edgeScale = Math.min(viewport.clientWidth / size.width, viewport.clientHeight / size.height);
    return imageState.transform.scale > edgeScale * 1.001;
  };

  const pointerDistanceFromState = () => pointerDistance(pointersRef.current.values());

  const startImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || event.button !== 0) return;
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
    dragRef.current = canPanImage() ? {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: imageState.transform.x,
      originY: imageState.transform.y,
    } : null;
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
    layoutModeRef.current = "manual";
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
        && !canPanImage();
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
        className={`${imageViewportClassName} ${canPanImage() ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        onPointerDown={startImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={endImageDrag}
        onPointerCancel={(event) => {
          tapRef.current = null;
          endImageDrag(event);
        }}
        onTouchMove={(event: TouchEvent<HTMLDivElement>) => {
          if (event.touches.length > 1) event.preventDefault();
        }}
      >
        <img
          key={loadAttempt}
          ref={imageRef}
          className={`${previewImageClassName}${imageState.naturalSize ? "" : " opacity-0"}`}
          src={mediaUrl(String(item.id || ""), srcKind)}
          alt={item.name || item.id || ""}
          draggable={false}
          style={imageStyle}
          onError={async (event) => {
            const image = event.currentTarget;
            const failedSrc = image.src;
            const fallback = srcKind === "file" && await canFallbackMedia();
            // The fallback check waits on the network; ignore its answer if the image was
            // reloaded or switched source meanwhile, such as by the back-online retry.
            if (imageRef.current !== image || image.src !== failedSrc) return;
            if (fallback) setSrcKind("thumb");
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
      {!imageState.naturalSize && !loadFailed && !offline ? (
        <span className="pointer-events-none absolute inset-0 z-[1] grid place-items-center" aria-hidden="true">
          <span className="loading-spinner block size-8 animate-spin rounded-full border-[3px] border-[color-mix(in_srgb,var(--muted-foreground)_25%,transparent)] border-t-muted-foreground" />
        </span>
      ) : null}
      {offline && !imageState.naturalSize ? <PreviewOverlayNotice message={MEDIA_SERVER_OFFLINE_MESSAGE} /> : null}
      {loadFailed && !offline ? <PreviewOverlayNotice message="Preview is unavailable" /> : null}
      <ImageToolbar
        visible={imageOverlayControlsVisible}
        fullscreen={fullscreen}
        onFullscreen={() => {
          layoutModeRef.current = "manual";
          fullscreen?.toggle();
        }}
        hasPrevious={Boolean(previewDialogState.hasPrevious)}
        hasNext={Boolean(previewDialogState.hasNext)}
        onZoomChange={(scale) => setImageZoom(scale, { x: 0, y: 0 })}
        onFit={() => {
          const image = imageRef.current;
          const viewport = viewportRef.current;
          if (!image?.naturalWidth || !image.naturalHeight || !viewport) return;
          // Initial layout keeps its margin; Fit fills the viewport along the limiting axis.
          const scale = Math.min(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
          setImageZoom(scale, { x: 0, y: 0 });
          layoutModeRef.current = "fit";
        }}
        onZoomIn={() => zoomImage(1.18)}
        onZoomOut={() => zoomImage(0.85)}
        zoomScale={imageState.transform.scale}
      />
    </>
  );
}

function ImageToolbar({
  fullscreen,
  onFullscreen,
  hasPrevious,
  hasNext,
  onZoomChange,
  onFit,
  onZoomIn,
  onZoomOut,
  visible,
  zoomScale,
}: {
  fullscreen?: ImageFullscreenControls;
  onFullscreen: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onZoomChange: (scale: number) => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  visible: boolean;
  zoomScale: number;
}) {
  const visibility = `${visible ? "visible opacity-100" : "invisible pointer-events-none opacity-0"} transition-opacity duration-150`;
  return (
    <>
      <div className={`${imageToolbarClassName} ${imageControlSurfaceClassName} ${visibility}`}>
        <div role="group" aria-label="Image zoom" className="flex items-center">
          <span className="inline-flex touch:hidden">
            <ToolbarButton label="Zoom out" icon={<MinusIcon />} onClick={onZoomOut} />
          </span>
          <span className="relative inline-flex items-center">
            <select
              className={imageZoomSelectClassName}
              aria-label="Image zoom percentage"
              title="Image zoom percentage (100% = actual size)"
              value={String(zoomScale)}
              onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
            >
              {!imageZoomPresets.includes(zoomScale) ? <option value={String(zoomScale)} hidden>{formatImageZoomLabel(zoomScale)}</option> : null}
              {imageZoomPresets.map((scale) => <option key={scale} value={String(scale)} className="bg-popover text-popover-foreground">{formatImageZoomLabel(scale)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="inline-flex touch:hidden">
            <ToolbarButton label="Zoom in" icon={<PlusIcon />} onClick={onZoomIn} />
          </span>
        </div>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <div role="group" aria-label="Image size" className="flex items-center gap-1">
          <ToolbarButton label="Fit" icon={<Scan aria-hidden="true" />} onClick={onFit} />
        </div>
      </div>
      {fullscreen ? (
        <div className={`image-fullscreen-control absolute right-[calc(14px+env(safe-area-inset-right))] top-[calc(14px+env(safe-area-inset-top))] z-[2] ${fullscreen.active ? "" : "touch:hidden"} ${imageControlSurfaceClassName} ${visibility}`}>
          <ToolbarButton
            label={fullscreen.active ? "Exit full screen" : "Full screen"}
            icon={fullscreen.active ? <Minimize aria-hidden="true" /> : <Expand aria-hidden="true" />}
            onClick={onFullscreen}
          />
        </div>
      ) : null}
      {fullscreen?.active ? (
        <div role="group" aria-label="Image navigation" className={`image-navigation pointer-events-none absolute inset-x-0 top-1/2 z-[2] flex -translate-y-1/2 justify-between pl-[calc(14px+env(safe-area-inset-left))] pr-[calc(14px+env(safe-area-inset-right))] ${visibility}`}>
          <div className={`pointer-events-auto ${imageControlSurfaceClassName}`}>
            <ToolbarButton label="Previous item" icon={<ChevronLeftIcon />} onClick={() => stepPreview(-1)} disabled={!hasPrevious} />
          </div>
          <div className={`pointer-events-auto ${imageControlSurfaceClassName}`}>
            <ToolbarButton label="Next item" icon={<ChevronRightIcon />} onClick={() => stepPreview(1)} disabled={!hasNext} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ToolbarButton({ icon, label, title = label, onClick, disabled }: {
  icon: ReactNode;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`${toolbarButtonClassName} disabled:pointer-events-none disabled:opacity-35`} disabled={disabled} title={title} aria-label={label} onClick={onClick}>
      {icon}
    </button>
  );
}

function imageZoomTransform(
  scale: number,
  position: Pick<PreviewTransform, "x" | "y">,
  size: ImageState["naturalSize"],
  viewport: HTMLDivElement | null,
) {
  const fits = size && viewport
    && size.width * scale <= viewport.clientWidth + 0.5
    && size.height * scale <= viewport.clientHeight + 0.5;
  return setPreviewZoom(scale, fits ? { x: 0, y: 0 } : position);
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
