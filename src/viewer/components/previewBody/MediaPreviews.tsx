import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mediaUrl } from "../../api";
import { displayFileName } from "../../format";
import { hasNoPreviewAsset } from "../../media";
import {
  getVideoOverlayControlsVisible,
  setVideoOverlayControlsVisible,
  subscribeVideoOverlayControls,
  toggleVideoOverlayControls,
} from "../../videoOverlayState";
import type { EagleItem } from "../../types";
import { PreviewNotice } from "./shared";

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
const playButtonClassName = `${mediaButtonClassName} h-12 w-12 border-white/30 bg-white/20 text-white shadow-sm hover:border-white/40 hover:bg-white/25`;
const mediaRangeClassName =
  "h-10 w-full min-w-0 touch-manipulation appearance-none bg-transparent accent-white [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[rgba(255,255,255,0.28)] [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_4px_12px_rgba(0,0,0,0.32)]";
const mediaRepeatButtonClassName = mediaButtonClassName;
export function VideoPreview({ item }: { item: EagleItem }) {
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

export function AudioPreview({ item }: { item: EagleItem }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noPreviewAsset = hasNoPreviewAsset(item);
  const [artworkMissing, setArtworkMissing] = useState(noPreviewAsset);

  useEffect(() => {
    setArtworkMissing(hasNoPreviewAsset(item));
    audioRef.current?.play().catch(() => {});
  }, [item.id, item.noPreview, item.noThumbnail]);

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
        <strong className={mediaTitleClassName}>{displayFileName(item) || "Audio preview"}</strong>
        <span className="text-xs font-[620] text-[rgba(255,255,255,0.62)]">{(item.ext || "audio").toUpperCase()}</span>
      </div>
      <audio ref={audioRef} src={mediaUrl(String(item.id || ""), "file")} preload="metadata" />
      <MediaControls mediaRef={audioRef} item={item} variant="audio" />
    </section>
  );
}

export function MediaControls({
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
  const [loop, setLoop] = useState(false);
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
      setLoop(media.loop);
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
    for (const eventName of ["durationchange", "loadedmetadata", "timeupdate", "play", "pause", "volumechange", "ended"]) {
      media.addEventListener(eventName, sync);
    }
    for (const eventName of ["play", "pause", "ended"]) {
      media.addEventListener(eventName, syncVideoOverlayVisibility);
    }
    return () => {
      for (const eventName of ["durationchange", "loadedmetadata", "timeupdate", "play", "pause", "volumechange", "ended"]) {
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
  const toggleLoop = () => {
    const media = mediaRef.current;
    if (!media) return;
    media.loop = !media.loop;
    setLoop(media.loop);
  };
  const toggleMuted = () => {
    const media = mediaRef.current;
    if (!media) return;
    media.muted = !media.muted;
  };

  const timeLabel = `${formatMediaTime(currentTime)} / ${formatMediaTime(duration)}`;
  const title = displayFileName(item) || (variant === "video" ? "Video preview" : "Audio preview");
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
          <button
            type="button"
            className={`${mediaRepeatButtonClassName} ${loop ? "border-white/40 bg-white/20" : ""}`}
            aria-label="Repeat"
            aria-pressed={loop}
            title="Repeat"
            onClick={toggleLoop}
          >
            <RepeatIcon />
          </button>
        </div>
      </div>
    </div>
  );
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

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
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

