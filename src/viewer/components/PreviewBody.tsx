import { forwardRef, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type TouchEvent, type WheelEvent } from "react";
import { mediaUrl } from "../api";
import {
  dragPreviewTransform,
  initialPreviewScales,
  nextPreviewScales,
  nextZoomScale,
  pointerDistance,
  setPreviewZoom,
} from "../previewTransform";
import { getPreviewBodyState, subscribePreviewBodyState } from "../previewBodyState";
import type { EagleItem, PreviewDrag, PreviewPinch, PreviewPoint, PreviewTransform } from "../types";

export type PreviewBodyKind = "video" | "audio" | "text" | "image" | "unsupported";

export interface PreviewBodyProps {
  item: EagleItem;
  kind: PreviewBodyKind;
  srcKind?: "file" | "thumb";
}

interface ImageState {
  fitScale: number;
  naturalScale: number;
  naturalSize: { width: number; height: number } | null;
  statusVisible: boolean;
  transform: PreviewTransform;
}

export function PreviewBody({ item, kind, srcKind = "file" }: PreviewBodyProps) {
  if (kind === "video") return <VideoPreview item={item} />;
  if (kind === "audio") return <AudioPreview item={item} />;
  if (kind === "text") return <TextPreview item={item} />;
  if (kind === "unsupported") return <UnsupportedPreview item={item} />;
  return <ImagePreview item={item} srcKind={srcKind} />;
}

export const PreviewBodyHost = forwardRef<HTMLDivElement>(function PreviewBodyHost(_, ref) {
  const previewBodyState = useSyncExternalStore(subscribePreviewBodyState, getPreviewBodyState, getPreviewBodyState);
  return (
    <div
      ref={ref}
      id="previewBody"
      className="preview-body relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[#f8fafc] p-0"
    >
      {previewBodyState ? <PreviewBody {...previewBodyState} /> : null}
    </div>
  );
});

function VideoPreview({ item }: { item: EagleItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, [item.id]);

  return (
    <>
      <video
        ref={videoRef}
        className="preview-video"
        src={mediaUrl(String(item.id || ""), "file")}
        controls
        playsInline
        preload="metadata"
        onError={(event) => setNotice(videoErrorMessage(event.currentTarget.error))}
      />
      {notice ? <PreviewNotice message={notice} /> : null}
    </>
  );
}

function AudioPreview({ item }: { item: EagleItem }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current?.play().catch(() => {});
  }, [item.id]);

  return <audio ref={audioRef} src={mediaUrl(String(item.id || ""), "file")} controls preload="metadata" />;
}

function TextPreview({ item }: { item: EagleItem }) {
  const [text, setText] = useState("Loading...");

  useEffect(() => {
    let cancelled = false;
    setText("Loading...");
    (async () => {
      try {
        const response = await fetch(mediaUrl(String(item.id || ""), "file"));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const nextText = await response.text();
        if (!cancelled) setText(nextText);
      } catch (error) {
        if (!cancelled) setText(`Unable to load preview: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  return (
    <pre className="text-preview">
      <code>{text}</code>
    </pre>
  );
}

function UnsupportedPreview({ item }: { item: EagleItem }) {
  return (
    <>
      <img className="unsupported-thumb" src={mediaUrl(String(item.id || ""), "thumb")} alt={item.name || item.id || ""} />
      <PreviewNotice message={`${(item.ext || "This format").toUpperCase()} is not supported in this browser.`} />
    </>
  );
}

function ImagePreview({ item, srcKind }: { item: EagleItem; srcKind: "file" | "thumb" }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<PreviewDrag | null>(null);
  const pointersRef = useRef<Map<number, PreviewPoint>>(new Map());
  const pinchRef = useRef<PreviewPinch | null>(null);
  const [imageState, setImageState] = useState<ImageState>(() => ({
    ...initialPreviewScales(),
    naturalSize: null,
    statusVisible: false,
  }));

  useEffect(() => {
    dragRef.current = null;
    pointersRef.current = new Map();
    pinchRef.current = null;
    setImageState({
      ...initialPreviewScales(),
      naturalSize: null,
      statusVisible: false,
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

  const statusText = imageState.naturalSize
    ? `${imageState.naturalSize.width} × ${imageState.naturalSize.height} · ${Math.round((imageState.transform.scale / imageState.naturalScale) * 100)}%`
    : "";
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

  const zoomImage = (multiplier: number) => {
    setImageState((current) => ({
      ...current,
      transform: setPreviewZoom(
        nextZoomScale(current.transform.scale, multiplier, current.fitScale, current.naturalScale),
        current.transform,
      ),
    }));
  };

  const pointerDistanceFromState = () => pointerDistance(pointersRef.current.values());

  const startImageDrag = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) return;
    if (event.pointerType === "touch") {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointersRef.current.size === 2) {
        pinchRef.current = {
          distance: pointerDistanceFromState(),
          scale: imageState.transform.scale,
        };
        dragRef.current = null;
        return;
      }
      if (pointersRef.current.size > 1) return;
    }
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

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setImageState((current) => ({
      ...current,
      transform: dragPreviewTransform(current.transform, drag, { x: event.clientX, y: event.clientY }),
    }));
  };

  const endImageDrag = (event?: PointerEvent<HTMLDivElement>) => {
    if (event?.pointerType === "touch") {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
    }
    if (!event || !dragRef.current || dragRef.current.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <>
      <div
        ref={viewportRef}
        className="image-viewport"
        onPointerDown={startImageDrag}
        onPointerMove={moveImageDrag}
        onPointerUp={endImageDrag}
        onPointerCancel={endImageDrag}
        onTouchMove={(event: TouchEvent<HTMLDivElement>) => {
          if (event.touches.length > 1) event.preventDefault();
        }}
        onWheel={(event: WheelEvent<HTMLDivElement>) => {
          event.preventDefault();
          zoomImage(event.deltaY > 0 ? 0.9 : 1.1);
        }}
      >
        <img
          ref={imageRef}
          className="preview-image"
          src={mediaUrl(String(item.id || ""), srcKind)}
          alt={item.name || item.id || ""}
          draggable={false}
          style={imageStyle}
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
              statusVisible: true,
              transform: setPreviewZoom(scales.fitScale, { x: 0, y: 0 }),
            });
          }}
          onError={() => {
            setImageState((current) => ({ ...current, statusVisible: false }));
          }}
        />
        <div className="image-status" hidden={!imageState.statusVisible}>
          {statusText}
        </div>
      </div>
      <ImageToolbar
        onActualSize={() => setImageZoom(imageState.naturalScale, { x: 0, y: 0 })}
        onFit={() => setImageZoom(imageState.fitScale, { x: 0, y: 0 })}
        onZoomIn={() => zoomImage(1.18)}
        onZoomOut={() => zoomImage(0.85)}
      />
    </>
  );
}

function ImageToolbar({
  onActualSize,
  onFit,
  onZoomIn,
  onZoomOut,
}: {
  onActualSize: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div className="image-toolbar">
      <ToolbarButton label="Zoom out" icon={<MinusIcon />} onClick={onZoomOut} />
      <ToolbarButton label="Fit" icon={<MaximizeIcon />} onClick={onFit} />
      <ToolbarButton label="Actual size" icon={<Maximize2Icon />} onClick={onActualSize} />
      <ToolbarButton label="Zoom in" icon={<PlusIcon />} onClick={onZoomIn} />
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick}>
      {icon}
    </button>
  );
}

function PreviewNotice({ message }: { message: string }) {
  return <p className="preview-notice">{message}</p>;
}

function videoErrorMessage(error: MediaError | null) {
  if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This video could not be played on this device. iPhone requires Safari-compatible video such as H.264 video with AAC audio.";
  }
  return "This video could not be played on this device.";
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
