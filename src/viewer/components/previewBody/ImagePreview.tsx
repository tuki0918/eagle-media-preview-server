import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Expand, Minimize, Scan } from "lucide-react";
import { IMAGE_FIT_MARGIN } from "../../constants";
import { getPreviewDialogState, subscribePreviewDialogState } from "../../previewDialogState";
import type { ImageFullscreenControls } from "../../useImageFullscreen";
import { dockSurfaceClassName } from "../viewerDockStyles";
import { canFallbackMedia, mediaUrl } from "../../api";
import { displayFileName } from "../../format";
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
  MAX_PREVIEW_SCALE,
  minimumPreviewScale,
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
// Fullscreen borrows the slideshow player's look: black stage, gradient bars, white glass controls.
const stageButtonClassName =
  "inline-grid size-10 shrink-0 touch-manipulation select-none place-items-center rounded-full border-0 bg-transparent p-0 text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";
const stageNavButtonClassName =
  "pointer-events-auto inline-grid size-12 shrink-0 touch-manipulation place-items-center rounded-full border-0 bg-black/35 text-white/85 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-0 [&_svg]:size-6";
const stageZoomSelectClassName =
  "h-10 w-[72px] touch-manipulation appearance-none rounded-full border-0 bg-transparent py-0 pl-2 pr-6 text-center text-xs font-medium tabular-nums text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";
const stageRangeClassName =
  "media-range h-4 w-[clamp(96px,22vw,220px)] cursor-pointer touch-manipulation appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white";
const STAGE_CONTROLS_IDLE_MS = 2500;

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

  // Like the slideshow player, mouse users get controls on movement and a clean stage when idle.
  useEffect(() => {
    if (!fullscreen?.active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const surface = viewportRef.current?.parentElement;
        if (surface?.querySelector(".image-stage-controls:hover, .image-stage-controls :focus-visible")) schedule();
        else setImageOverlayControlsVisible(false);
      }, STAGE_CONTROLS_IDLE_MS);
    };
    const moved = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== "mouse" || (!event.movementX && !event.movementY)) return;
      setImageOverlayControlsVisible(true);
      schedule();
    };
    setImageOverlayControlsVisible(true);
    schedule();
    document.addEventListener("pointermove", moved);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointermove", moved);
      setImageOverlayControlsVisible(true);
    };
  }, [fullscreen?.active]);

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
          <span className={`loading-spinner block size-8 animate-spin rounded-full border-[3px] ${fullscreen?.active ? "border-white/25 border-t-white" : "border-[color-mix(in_srgb,var(--muted-foreground)_25%,transparent)] border-t-muted-foreground"}`} />
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
        minZoomScale={minimumPreviewScale(imageState.fitScale, imageState.naturalScale)}
        onZoomSlide={(scale) => setImageZoom(scale)}
        title={displayFileName(item) || item.name || "Untitled"}
        naturalSize={imageState.naturalSize}
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
  minZoomScale,
  onZoomSlide,
  title,
  naturalSize,
}: {
  minZoomScale: number;
  onZoomSlide: (scale: number) => void;
  title: string;
  naturalSize: ImageState["naturalSize"];
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
  if (fullscreen?.active) {
    const stageVisibility = `${visible ? "visible opacity-100" : "invisible pointer-events-none opacity-0"} transition-opacity duration-200`;
    // The slider works in log2 space so each step feels the same at 25% and at 800%.
    const minLog = Math.log2(minZoomScale);
    const maxLog = Math.log2(MAX_PREVIEW_SCALE);
    const zoomLog = Math.min(maxLog, Math.max(minLog, Math.log2(zoomScale || 1)));
    const zoomProgress = maxLog > minLog ? (zoomLog - minLog) / (maxLog - minLog) * 100 : 0;
    return (
      <>
        <header className={`image-stage-controls pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent pb-12 pl-[max(16px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[max(12px,env(safe-area-inset-top))] text-white ${stageVisibility}`}>
          <div className="min-w-0 pt-1">
            <p className="truncate text-sm font-medium" title={title}>{title}</p>
            {naturalSize ? <p className="mt-1 text-xs tabular-nums text-white/60">{naturalSize.width} × {naturalSize.height}</p> : null}
          </div>
          <div className="image-fullscreen-control pointer-events-auto shrink-0">
            <button type="button" className={stageButtonClassName} title="Exit full screen (Esc)" aria-label="Exit full screen" onClick={onFullscreen}>
              <Minimize aria-hidden="true" />
            </button>
          </div>
        </header>
        <div role="group" aria-label="Image navigation" className={`image-navigation image-stage-controls pointer-events-none absolute inset-x-0 top-1/2 z-[2] flex -translate-y-1/2 justify-between pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] ${stageVisibility}`}>
          <button type="button" className={stageNavButtonClassName} title="Previous item" aria-label="Previous item" disabled={!hasPrevious} onClick={() => stepPreview(-1)}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className={stageNavButtonClassName} title="Next item" aria-label="Next item" disabled={!hasNext} onClick={() => stepPreview(1)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <footer className={`image-stage-controls pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex justify-center bg-gradient-to-t from-black/75 to-transparent pb-[max(16px,env(safe-area-inset-bottom))] pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-14 text-white ${stageVisibility}`}>
          <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-black/45 px-1.5 py-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
            <div role="group" aria-label="Image zoom" className="flex items-center gap-1">
              <button type="button" className={stageButtonClassName} title="Zoom out" aria-label="Zoom out" onClick={onZoomOut}><MinusIcon /></button>
              <input
                type="range"
                className={`${stageRangeClassName} max-[480px]:hidden`}
                aria-label="Image zoom level"
                aria-valuetext={formatImageZoomLabel(zoomScale)}
                min={minLog}
                max={maxLog}
                step={0.01}
                value={zoomLog}
                style={{ ["--media-progress" as string]: `${zoomProgress}%` }}
                onInput={(event) => onZoomSlide(2 ** Number(event.currentTarget.value))}
                onChange={() => {}}
              />
              <button type="button" className={stageButtonClassName} title="Zoom in" aria-label="Zoom in" onClick={onZoomIn}><PlusIcon /></button>
              <span className="relative inline-flex items-center">
                <select
                  className={stageZoomSelectClassName}
                  aria-label="Image zoom percentage"
                  title="Image zoom percentage (100% = actual size)"
                  value={String(zoomScale)}
                  onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
                >
                  {!imageZoomPresets.includes(zoomScale) ? <option value={String(zoomScale)} hidden>{formatImageZoomLabel(zoomScale)}</option> : null}
                  {imageZoomPresets.map((scale) => <option key={scale} value={String(scale)} className="bg-popover text-popover-foreground">{formatImageZoomLabel(scale)}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 size-3.5 text-white/60" aria-hidden="true" />
              </span>
            </div>
            <span className="mx-1 h-5 w-px shrink-0 bg-white/25" aria-hidden="true" />
            <div role="group" aria-label="Image size" className="flex items-center gap-1">
              <button type="button" className={stageButtonClassName} title="Fit" aria-label="Fit" onClick={onFit}><Scan aria-hidden="true" /></button>
              <button type="button" className={`${stageButtonClassName} w-auto px-2.5 text-xs font-semibold tabular-nums`} title="Actual size (100%)" aria-label="Actual size" onClick={() => onZoomChange(1)}>1:1</button>
            </div>
          </div>
        </footer>
      </>
    );
  }
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
        <div className={`image-fullscreen-control absolute right-[calc(14px+env(safe-area-inset-right))] top-[calc(14px+env(safe-area-inset-top))] z-[2] touch:hidden ${imageControlSurfaceClassName} ${visibility}`}>
          <ToolbarButton label="Full screen" icon={<Expand aria-hidden="true" />} onClick={onFullscreen} />
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
