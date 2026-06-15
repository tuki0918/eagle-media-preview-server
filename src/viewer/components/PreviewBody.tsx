import { forwardRef, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode, type TouchEvent, type WheelEvent } from "react";
import { mediaUrl } from "../api";
import { closePreview } from "../shellActions";
import {
  getImageOverlayControlsVisible,
  setImageOverlayControlsVisible,
  subscribeImageOverlayControls,
  toggleImageOverlayControls,
} from "../imageOverlayState";
import {
  dragPreviewTransform,
  initialPreviewScales,
  nextPreviewScales,
  nextZoomScale,
  pointerDistance,
  setPreviewZoom,
} from "../previewTransform";
import { getPreviewBodyState, subscribePreviewBodyState } from "../previewBodyState";
import {
  getVideoOverlayControlsVisible,
  setVideoOverlayControlsVisible,
  subscribeVideoOverlayControls,
  toggleVideoOverlayControls,
} from "../videoOverlayState";
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
  transform: PreviewTransform;
}

const checkerboardClassName =
  "bg-[#f8fafc] bg-[linear-gradient(45deg,rgba(148,163,184,0.24)_25%,transparent_25%),linear-gradient(-45deg,rgba(148,163,184,0.24)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(148,163,184,0.24)_75%),linear-gradient(-45deg,transparent_75%,rgba(148,163,184,0.24)_75%)] [background-position:0_0,0_12px,12px_-12px,-12px_0] [background-size:24px_24px]";
const previewVideoClassName =
  "preview-video h-full w-full max-h-full cursor-pointer bg-[#05070a] object-contain [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:max-h-none [&:fullscreen]:max-w-none [&:fullscreen]:bg-[#05070a] [&:fullscreen]:object-contain";
const mediaPlayerClassName =
  "media-player pointer-events-auto grid w-full gap-3 rounded-none border-0 bg-transparent text-white max-[540px]:gap-2.5";
const videoPlayerClassName =
  "video-player absolute inset-x-0 bottom-0 z-[2] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-10 [background:linear-gradient(180deg,transparent,rgba(5,7,10,0.78))] max-[540px]:px-2.5 max-[540px]:pb-[calc(10px+env(safe-area-inset-bottom))]";
const audioPlayerShellClassName =
  "audio-player-shell grid w-[min(560px,calc(100%_-_28px))] content-center gap-5 rounded-[18px] border border-[rgba(255,255,255,0.12)] bg-[linear-gradient(145deg,rgba(30,41,59,0.92),rgba(2,6,23,0.94))] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.36)] max-[540px]:w-[calc(100%_-_24px)] max-[540px]:gap-4 max-[540px]:rounded-[16px] max-[540px]:p-4";
const audioArtworkClassName =
  "audio-artwork relative mx-auto my-3 aspect-square w-[min(260px,72vw)] overflow-hidden rounded-[16px] border border-[rgba(255,255,255,0.12)] bg-[linear-gradient(135deg,rgba(37,99,235,0.34),rgba(14,165,233,0.16)),rgba(15,23,42,0.82)] shadow-[0_18px_48px_rgba(0,0,0,0.34)] max-[540px]:my-2.5 max-[540px]:w-[min(220px,68vw)] [&>img]:h-full [&>img]:w-full [&>img]:object-cover";
const audioArtworkFallbackClassName =
  "grid h-full w-full place-items-center text-[rgba(255,255,255,0.72)] [&_svg]:h-14 [&_svg]:w-14 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:1.8]";
const mediaTitleClassName =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-[720] leading-tight text-white max-[540px]:text-[13px]";
const mediaSubtleTextClassName = "text-xs font-[620] tabular-nums text-[rgba(255,255,255,0.72)]";
const mediaControlsClassName = "flex min-w-0 items-center gap-2 max-[540px]:gap-1.5";
const mediaButtonClassName =
  "inline-grid h-11 w-11 touch-manipulation select-none place-items-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.12)] text-white backdrop-blur-[12px] hover:bg-[rgba(255,255,255,0.2)] disabled:cursor-default disabled:opacity-40 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";
const playButtonClassName = `${mediaButtonClassName} h-12 w-12 border-[#60a5fa] bg-[#2563eb] text-white shadow-[0_10px_26px_rgba(37,99,235,0.42)] hover:border-[#93c5fd] hover:bg-[#1d4ed8]`;
const mediaRangeClassName =
  "h-10 w-full min-w-0 touch-manipulation appearance-none bg-transparent accent-white [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[rgba(255,255,255,0.28)] [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_4px_12px_rgba(0,0,0,0.32)]";
const mediaSpeedButtonClassName =
  "inline-flex h-9 min-w-14 touch-manipulation select-none items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.1)] px-3 text-xs font-[760] text-white hover:bg-[rgba(255,255,255,0.18)]";
const textPreviewClassName =
  "text-preview m-0 min-w-0 overflow-auto rounded-app border border-app-border bg-white p-[18px] font-mono text-[13px] leading-[1.55] text-app-text shadow-app-soft [overflow-wrap:anywhere] [white-space:pre-wrap]";
const unsupportedThumbClassName = "unsupported-thumb max-h-[min(62dvh,640px)] w-[min(640px,calc(100vw_-_48px))] max-w-full object-contain";
const previewNoticeClassName = "preview-notice m-0 max-w-[560px] text-center text-[13px] leading-normal text-app-muted";
const imageViewportClassName = "image-viewport relative grid h-full min-h-0 w-full min-w-0 cursor-grab touch-none place-items-center overflow-hidden active:cursor-grabbing";
const previewImageClassName =
  "preview-image absolute left-1/2 top-1/2 block max-h-none max-w-none select-none object-contain [transform-origin:center] [will-change:transform] [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:bg-[#05070a] [&:fullscreen]:object-contain";
const imageToolbarClassName =
  "image-toolbar absolute bottom-[calc(14px+env(safe-area-inset-bottom))] left-1/2 z-[2] inline-flex -translate-x-1/2 items-center gap-1.5 rounded-[10px] border border-[rgba(203,213,225,0.86)] bg-[rgba(255,255,255,0.92)] p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.16)] backdrop-blur-[16px]";
const toolbarButtonClassName =
  "inline-grid min-h-[38px] w-[38px] touch-manipulation select-none place-items-center rounded-app border-0 bg-transparent text-app-text-soft hover:bg-app-accent-soft hover:text-app-accent [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round] [&_svg]:[stroke-width:2]";

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
      className={previewBodyClassName(previewBodyState?.kind)}
    >
      {previewBodyState ? <PreviewBody {...previewBodyState} /> : null}
    </div>
  );
});

function VideoPreview({ item }: { item: EagleItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setVideoOverlayControlsVisible(true);
    videoRef.current?.play().catch(() => {});
  }, [item.id]);

  return (
    <>
      <video
        ref={videoRef}
        className={previewVideoClassName}
        src={mediaUrl(String(item.id || ""), "file")}
        aria-label="Toggle video controls"
        playsInline
        preload="metadata"
        onClick={toggleVideoOverlayControls}
        onError={(event) => setNotice(videoErrorMessage(event.currentTarget.error))}
      />
      <MediaControls mediaRef={videoRef} item={item} variant="video" />
      {notice ? <PreviewNotice message={notice} /> : null}
    </>
  );
}

function AudioPreview({ item }: { item: EagleItem }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [artworkMissing, setArtworkMissing] = useState(false);

  useEffect(() => {
    setArtworkMissing(false);
    audioRef.current?.play().catch(() => {});
  }, [item.id]);

  return (
    <section className={audioPlayerShellClassName} aria-label="Audio player">
      <div className={audioArtworkClassName} aria-label="Audio thumbnail">
        {artworkMissing ? (
          <span className={audioArtworkFallbackClassName}>
            <MusicIcon />
          </span>
        ) : (
          <img
            src={mediaUrl(String(item.id || ""), "thumb")}
            alt=""
            decoding="async"
            onError={() => setArtworkMissing(true)}
          />
        )}
      </div>
      <div className="grid min-w-0 gap-1">
        <strong className={mediaTitleClassName}>{item.name || item.id || "Audio preview"}</strong>
        <span className="text-xs font-[620] text-[rgba(255,255,255,0.62)]">{(item.ext || "audio").toUpperCase()}</span>
      </div>
      <audio ref={audioRef} src={mediaUrl(String(item.id || ""), "file")} preload="metadata" />
      <MediaControls mediaRef={audioRef} item={item} variant="audio" />
    </section>
  );
}

function MediaControls({
  item,
  mediaRef,
  variant,
}: {
  item: EagleItem;
  mediaRef: { current: HTMLMediaElement | null };
  variant: "audio" | "video";
}) {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const firstVideoPlayRef = useRef(true);
  const videoOverlayControlsVisible = useSyncExternalStore(
    subscribeVideoOverlayControls,
    getVideoOverlayControlsVisible,
    getVideoOverlayControlsVisible,
  );

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    firstVideoPlayRef.current = true;
    const sync = () => {
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0);
      setPaused(media.paused);
      setMuted(media.muted);
      setPlaybackRate(media.playbackRate || 1);
    };
    const syncVideoOverlayVisibility = () => {
      if (variant !== "video") return;
      if (!media.paused && firstVideoPlayRef.current) {
        firstVideoPlayRef.current = false;
        setVideoOverlayControlsVisible(true);
        return;
      }
      if (media.paused || media.ended) {
        firstVideoPlayRef.current = true;
      }
      setVideoOverlayControlsVisible(media.paused || media.ended);
    };
    sync();
    syncVideoOverlayVisibility();
    for (const eventName of ["durationchange", "loadedmetadata", "timeupdate", "play", "pause", "volumechange", "ratechange", "ended"]) {
      media.addEventListener(eventName, sync);
    }
    for (const eventName of ["play", "pause", "ended"]) {
      media.addEventListener(eventName, syncVideoOverlayVisibility);
    }
    return () => {
      for (const eventName of ["durationchange", "loadedmetadata", "timeupdate", "play", "pause", "volumechange", "ratechange", "ended"]) {
        media.removeEventListener(eventName, sync);
      }
      for (const eventName of ["play", "pause", "ended"]) {
        media.removeEventListener(eventName, syncVideoOverlayVisibility);
      }
    };
  }, [item.id, mediaRef, variant]);

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  };
  const seekBy = (seconds: number) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.min(media.duration, Math.max(0, media.currentTime + seconds));
  };
  const seekTo = (value: string) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = Number(value);
  };
  const cycleSpeed = () => {
    const media = mediaRef.current;
    if (!media) return;
    const speeds = [1, 1.25, 1.5, 2];
    const currentIndex = speeds.findIndex((speed) => speed === media.playbackRate);
    media.playbackRate = speeds[(currentIndex + 1) % speeds.length];
  };
  const toggleMuted = () => {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = !media.muted;
  };

  const timeLabel = `${formatMediaTime(currentTime)} / ${formatMediaTime(duration)}`;
  const title = item.name || item.id || (variant === "video" ? "Video preview" : "Audio preview");
  const mediaControlsVisibilityClassName = variant === "video" && !videoOverlayControlsVisible
    ? "pointer-events-none opacity-0"
    : "opacity-100";

  return (
    <div className={`${mediaPlayerClassName} ${variant === "video" ? videoPlayerClassName : ""} ${mediaControlsVisibilityClassName} transition-opacity duration-150`} aria-label={`${variant === "video" ? "Video" : "Audio"} controls`}>
      {variant === "video" ? <strong className={mediaTitleClassName}>{title}</strong> : null}
      <div className="grid gap-1.5">
        <input
          className={mediaRangeClassName}
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || currentTime)}
          aria-label="Playback position"
          onChange={(event) => seekTo(event.currentTarget.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className={mediaSubtleTextClassName}>{timeLabel}</span>
          <span className={mediaSubtleTextClassName}>{paused ? "Paused" : "Playing"}</span>
        </div>
      </div>
      <div className={mediaControlsClassName}>
        <button type="button" className={mediaButtonClassName} aria-label="Back 10 seconds" title="Back 10 seconds" disabled={!duration} onClick={() => seekBy(-10)}>
          <SkipBackIcon />
        </button>
        <button type="button" className={playButtonClassName} aria-label={paused ? "Play" : "Pause"} title={paused ? "Play" : "Pause"} onClick={togglePlay}>
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button type="button" className={mediaButtonClassName} aria-label="Forward 10 seconds" title="Forward 10 seconds" disabled={!duration} onClick={() => seekBy(10)}>
          <SkipForwardIcon />
        </button>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2 max-[540px]:gap-1.5">
          <button type="button" className={mediaButtonClassName} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} onClick={toggleMuted}>
            {muted ? <VolumeXIcon /> : <Volume2Icon />}
          </button>
          <button type="button" className={mediaSpeedButtonClassName} aria-label="Playback speed" title="Playback speed" onClick={cycleSpeed}>
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
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
    <pre className={textPreviewClassName}>
      <code>{text}</code>
    </pre>
  );
}

function UnsupportedPreview({ item }: { item: EagleItem }) {
  return (
    <>
      <img className={unsupportedThumbClassName} src={mediaUrl(String(item.id || ""), "thumb")} alt={item.name || item.id || ""} />
      <PreviewNotice message={`${(item.ext || "This format").toUpperCase()} is not supported in this browser.`} />
    </>
  );
}

function ImagePreview({ item, srcKind }: { item: EagleItem; srcKind: "file" | "thumb" }) {
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
      const deltaX = Math.abs(event.clientX - tap.startX);
      const deltaY = event.clientY - tap.startY;
      const canCloseFromSwipe = event.pointerType === "touch"
        && pointersRef.current.size <= 1
        && imageState.transform.scale <= imageState.fitScale * 1.05
        && deltaY > 80
        && deltaY > deltaX * 1.6;
      if (canCloseFromSwipe) {
        closePreview();
      } else if (!tap.moved && pointersRef.current.size <= 1) {
        toggleImageOverlayControls();
      }
      tapRef.current = null;
    }
    if (!event || !dragRef.current || dragRef.current.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

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
        onWheel={(event: WheelEvent<HTMLDivElement>) => {
          event.preventDefault();
          zoomImage(event.deltaY > 0 ? 0.9 : 1.1);
        }}
      >
        <img
          ref={imageRef}
          className={previewImageClassName}
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
              transform: setPreviewZoom(scales.fitScale, { x: 0, y: 0 }),
            });
          }}
        />
      </div>
      <ImageToolbar
        visible={imageOverlayControlsVisible}
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
  visible,
}: {
  onActualSize: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  visible: boolean;
}) {
  return (
    <div className={`${imageToolbarClassName} ${visible ? "opacity-100" : "pointer-events-none opacity-0"} transition-opacity duration-150`}>
      <ToolbarButton label="Zoom out" icon={<MinusIcon />} onClick={onZoomOut} />
      <ToolbarButton label="Fit" icon={<MaximizeIcon />} onClick={onFit} />
      <ToolbarButton label="Actual size" icon={<Maximize2Icon />} onClick={onActualSize} />
      <ToolbarButton label="Zoom in" icon={<PlusIcon />} onClick={onZoomIn} />
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

function PreviewNotice({ message }: { message: string }) {
  return <p className={previewNoticeClassName}>{message}</p>;
}

function previewBodyClassName(kind?: PreviewBodyKind) {
  const base = "preview-body relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden p-0";
  if (kind === "video") return `${base} bg-[#05070a] max-h-full`;
  if (kind === "audio") return `${base} place-items-center bg-[#05070a]`;
  if (kind === "text") return `${base} overflow-auto bg-[#f8fafc] p-[18px]`;
  if (kind === "unsupported") return `${base} content-center justify-items-center gap-4 bg-[#05070a] p-8 [&_.preview-notice]:text-white`;
  return `${base} ${checkerboardClassName}`;
}

function videoErrorMessage(error: MediaError | null) {
  if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This video could not be played on this device. iPhone requires Safari-compatible video such as H.264 video with AAC audio.";
  }
  return "This video could not be played on this device.";
}

function formatMediaTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const rounded = Math.floor(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5v14" />
      <path d="M14 5v14" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m11 17-5-5 5-5" />
      <path d="M18 18V6" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13 7 5 5-5 5" />
      <path d="M6 6v12" />
    </svg>
  );
}

function Volume2Icon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

function VolumeXIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
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
