import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Minimize, Music, Pause, Play, Repeat, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react";
import { mediaUrl } from "../../api";
import { displayFileName } from "../../format";
import { hasNoThumbnail } from "../../media";
import { bindMediaSession } from "../../mediaSession";
import {
  getVideoOverlayControlsVisible,
  setVideoOverlayControlsVisible,
  subscribeVideoOverlayControls,
} from "../../videoOverlayState";
import type { EagleItem } from "../../types";
import { PreviewNotice } from "./shared";

const previewVideoClassName =
  "preview-video h-full w-full max-h-full cursor-pointer bg-[#05070a] object-contain [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:max-h-none [&:fullscreen]:max-w-none [&:fullscreen]:bg-[#05070a] [&:fullscreen]:object-contain";
const mediaPlayerClassName =
  "media-player pointer-events-auto grid w-full gap-1 rounded-none border-0 bg-transparent text-white";
const videoPlayerClassName =
  "video-player absolute inset-x-0 bottom-0 z-[2] px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-12 [background:linear-gradient(180deg,transparent,rgba(5,7,10,0.82))] min-[720px]:px-4";
const audioPlayerShellClassName =
  "audio-player-shell grid min-w-0 w-[min(520px,calc(100%_-_28px))] grid-cols-[minmax(0,1fr)] content-center gap-5 rounded-[24px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(160deg,rgba(38,38,44,0.94),rgba(10,10,14,0.96))] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.45)] max-[540px]:w-[calc(100%_-_24px)] max-[540px]:gap-4 max-[540px]:p-5";
const audioArtworkClassName =
  "audio-artwork relative mx-auto aspect-square w-[min(240px,64vw)] overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.1)] bg-[linear-gradient(135deg,rgba(99,102,241,0.35),rgba(14,165,233,0.18)),rgba(24,24,27,0.9)] shadow-[0_18px_48px_rgba(0,0,0,0.4)] [&>img]:h-full [&>img]:w-full [&>img]:object-cover";
const audioArtworkFallbackClassName =
  "grid h-full w-full place-items-center text-[rgba(255,255,255,0.72)] [&_svg]:h-14 [&_svg]:w-14";
const mediaTitleClassName =
  "block w-full min-w-0 max-w-full truncate text-base font-semibold leading-tight text-white";
const mediaTimeClassName = "whitespace-nowrap text-xs font-medium tabular-nums text-[rgba(255,255,255,0.78)]";
const mediaButtonClassName =
  "relative inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-full border-0 bg-transparent text-white transition-colors hover:bg-[rgba(255,255,255,0.14)] disabled:cursor-default disabled:opacity-40 [&_svg]:size-5";
const playButtonClassName = `${mediaButtonClassName} size-10 [&_svg]:size-[22px]`;
const audioPlayButtonClassName = "relative inline-grid size-14 shrink-0 touch-manipulation select-none place-items-center rounded-full border-0 bg-white text-[#0a0a0e] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 [&_svg]:size-6";
const mediaRangeClassName =
  "media-range h-4 w-full min-w-0 cursor-pointer touch-manipulation appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.4)] [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white";
const centerSeekButtonClassName =
  "relative inline-grid size-12 touch-manipulation select-none place-items-center rounded-full border-0 bg-black/35 text-white backdrop-blur-md disabled:opacity-40 [&_svg]:size-6";
const centerPlayButtonClassName =
  "relative inline-grid size-[72px] touch-manipulation select-none place-items-center rounded-full border-0 bg-black/45 text-white backdrop-blur-md [&_svg]:size-8";
const volumeRangeClassName = `${mediaRangeClassName} w-20 max-[720px]:hidden`;
const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.5, 0.75] as const;
const VIDEO_CONTROLS_HIDE_DELAY_MS = 2500;
const CENTER_CONTROLS_AUTOPLAY_GRACE_MS = 1500;

export function VideoPreview({ item }: { item: EagleItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [notice, setNotice] = useState("");
  const [buffering, setBuffering] = useState(true);

  useEffect(() => {
    setVideoOverlayControlsVisible(true);
    setBuffering(true);
    const video = videoRef.current;
    // Autoplay; browsers that block audible autoplay still allow muted playback.
    video?.play().catch(() => {
      if (!video) return;
      video.muted = true;
      video.play().catch(() => {});
    });
  }, [item.id]);

  return (
    <>
      <video
        ref={videoRef}
        className={previewVideoClassName}
        src={mediaUrl(String(item.id || ""), "file")}
        aria-label="Video player"
        playsInline
        preload="metadata"
        onPointerUp={(event) => {
          if (event.pointerType !== "mouse") return;
          const video = event.currentTarget;
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }}
        onWaiting={() => setBuffering(true)}
        onLoadStart={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onError={(event) => {
          setBuffering(false);
          setNotice(videoErrorMessage(event.currentTarget.error));
        }}
      />
      {buffering ? (
        <span className="pointer-events-none absolute inset-0 z-[1] grid place-items-center" aria-hidden="true">
          <span className="loading-spinner block size-10 animate-spin rounded-full border-[3px] border-[rgba(255,255,255,0.22)] border-t-white" />
        </span>
      ) : null}
      <MediaControls mediaRef={videoRef} item={item} variant="video" />
      {notice ? <PreviewNotice message={notice} /> : null}
    </>
  );
}

export function AudioPreview({ item }: { item: EagleItem }) {
  const title = displayFileName(item) || "Audio preview";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noThumbnail = hasNoThumbnail(item);
  const [artworkMissing, setArtworkMissing] = useState(noThumbnail);

  useEffect(() => {
    setArtworkMissing(hasNoThumbnail(item));
    audioRef.current?.play().catch(() => {});
  }, [item.id, item.noThumbnail]);

  return (
    <section className={audioPlayerShellClassName} aria-label="Audio player">
      <div className={audioArtworkClassName} aria-label="Audio thumbnail">
        {artworkMissing ? (
          <span className={audioArtworkFallbackClassName}>
            <Music aria-hidden="true" strokeWidth={1.6} />
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
      <div className="min-w-0 text-center">
        <strong className={mediaTitleClassName} title={title}>{title}</strong>
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
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  // Phones: keep the centre transport buttons out of the way during the initial autoplay.
  const [centerControlsReady, setCenterControlsReady] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const videoOverlayControlsVisible = useSyncExternalStore(
    subscribeVideoOverlayControls,
    getVideoOverlayControlsVisible,
    getVideoOverlayControlsVisible,
  );

  const clearHideTimer = () => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  };

  // Show the video controls, then hide them again while playback continues.
  const revealVideoControls = () => {
    if (variant !== "video") return;
    setVideoOverlayControlsVisible(true);
    clearHideTimer();
    const media = mediaRef.current;
    if (!media || media.paused || media.ended) return;
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      const current = mediaRef.current;
      if (current && !current.paused && !current.ended) setVideoOverlayControlsVisible(false);
    }, VIDEO_CONTROLS_HIDE_DELAY_MS);
  };

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const sync = () => {
      setDuration(Number.isFinite(media.duration) ? media.duration : 0);
      setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0);
      setPaused(media.paused);
      setMuted(media.muted);
      setVolume(media.volume);
      setLoop(media.loop);
      setPlaybackRate(media.playbackRate);
    };
    setCenterControlsReady(false);
    const readyTimer = window.setTimeout(() => {
      // Autoplay never started (e.g. blocked), so the centre play button is needed.
      if (media.paused) setCenterControlsReady(true);
    }, CENTER_CONTROLS_AUTOPLAY_GRACE_MS);
    const syncVideoOverlayVisibility = () => {
      if (variant !== "video") return;
      if (media.paused || media.ended) {
        setCenterControlsReady(true);
        clearHideTimer();
        setVideoOverlayControlsVisible(true);
        return;
      }
      revealVideoControls();
    };
    const mediaEvents = ["durationchange", "loadedmetadata", "timeupdate", "play", "pause", "volumechange", "ended", "ratechange"];
    sync();
    for (const eventName of mediaEvents) media.addEventListener(eventName, sync);
    for (const eventName of ["play", "pause", "ended"]) media.addEventListener(eventName, syncVideoOverlayVisibility);

    const surface = variant === "video" ? media.parentElement : null;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse") revealVideoControls();
    };
    // Tapping the video (or the empty overlay around the buttons) toggles the controls on touch devices.
    const handleTap = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target;
      if (target instanceof Element && target.closest("button,input")) return;
      setCenterControlsReady(true);
      if (getVideoOverlayControlsVisible()) {
        clearHideTimer();
        setVideoOverlayControlsVisible(false);
      } else {
        revealVideoControls();
      }
    };
    surface?.addEventListener("pointermove", handlePointerMove);
    surface?.addEventListener("pointerup", handleTap);
    return () => {
      clearHideTimer();
      window.clearTimeout(readyTimer);
      for (const eventName of mediaEvents) media.removeEventListener(eventName, sync);
      for (const eventName of ["play", "pause", "ended"]) media.removeEventListener(eventName, syncVideoOverlayVisibility);
      surface?.removeEventListener("pointermove", handlePointerMove);
      surface?.removeEventListener("pointerup", handleTap);
    };
  }, [item.id, mediaRef, variant]);

  // Rebind only when what the lock screen shows changes; edits like rating replace `item` too.
  const { id, name, ext, noThumbnail } = item;
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    return bindMediaSession(media, { id, name, ext, noThumbnail });
  }, [id, name, ext, noThumbnail, mediaRef]);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) media.play().catch(() => {});
    else media.pause();
  };
  const seekBy = (seconds: number) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.min(media.duration, Math.max(0, media.currentTime + seconds));
    revealVideoControls();
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
    if (media.muted || media.volume === 0) {
      media.muted = false;
      if (media.volume === 0) media.volume = 1;
    } else {
      media.muted = true;
    }
  };
  const changeVolume = (value: string) => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = Number(value);
    media.muted = Number(value) === 0;
  };
  const cyclePlaybackRate = () => {
    const media = mediaRef.current;
    if (!media) return;
    const index = PLAYBACK_RATES.findIndex((rate) => rate === media.playbackRate);
    media.playbackRate = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
  };
  const toggleFullscreen = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const surface = media.parentElement;
    if (surface?.requestFullscreen) {
      surface.requestFullscreen().catch(() => {});
      return;
    }
    // iOS Safari only supports native fullscreen on the video element itself.
    (media as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  };

  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input:not([type=range]),select,textarea,[contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    // Space on a focused button already activates it.
    if (key === " " && target instanceof Element && target.closest("button")) return;
    if (key === " " || key === "k") togglePlay();
    else if (key === "j") seekBy(-10);
    else if (key === "l") seekBy(10);
    else if (key === "m") toggleMuted();
    else if (key === "f" && variant === "video") toggleFullscreen();
    else return;
    event.preventDefault();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => shortcutRef.current(event);
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumeLevel = muted ? 0 : volume;
  const mediaControlsVisibilityClassName = variant === "video" && !videoOverlayControlsVisible
    ? "pointer-events-none opacity-0"
    : "opacity-100";
  const VolumeIcon = volumeLevel === 0 ? VolumeX : volumeLevel < 0.5 ? Volume1 : Volume2;
  const rateLabel = `${playbackRate}x`;

  const progressBar = (
    <input
      className={mediaRangeClassName}
      style={{ ["--media-progress" as string]: `${progress}%` }}
      type="range"
      min="0"
      max={duration || 0}
      step="0.1"
      value={Math.min(currentTime, duration || currentTime)}
      aria-label="Playback position"
      onChange={(event) => seekTo(event.currentTarget.value)}
    />
  );
  const timeLabel = <span className={mediaTimeClassName}>{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>;
  const seekButton = (direction: -1 | 1, className = mediaButtonClassName, labelClassName = "text-[7px]") => (
    <button
      type="button"
      className={className}
      aria-label={direction < 0 ? "Back 10 seconds" : "Forward 10 seconds"}
      title={direction < 0 ? "Back 10 seconds (J)" : "Forward 10 seconds (L)"}
      disabled={!duration}
      onClick={() => seekBy(direction * 10)}
    >
      {direction < 0 ? <RotateCcw aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
      <span className={`pointer-events-none absolute font-bold leading-none ${labelClassName}`} aria-hidden="true">10</span>
    </button>
  );
  const seekBackButton = seekButton(-1);
  const seekForwardButton = seekButton(1);
  const volumeControls = (
    <div className="group/volume flex items-center">
      <button type="button" className={mediaButtonClassName} aria-label={volumeLevel === 0 ? "Unmute" : "Mute"} title={`${volumeLevel === 0 ? "Unmute" : "Mute"} (M)`} onClick={toggleMuted}>
        <VolumeIcon aria-hidden="true" />
      </button>
      <input
        className={volumeRangeClassName}
        style={{ ["--media-progress" as string]: `${volumeLevel * 100}%` }}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volumeLevel}
        aria-label="Volume"
        onChange={(event) => changeVolume(event.currentTarget.value)}
      />
    </div>
  );
  const rateButton = (
    <button type="button" className={`${mediaButtonClassName} w-auto min-w-9 px-2 text-xs font-semibold tabular-nums`} aria-label={`Playback speed ${rateLabel}`} title="Playback speed" onClick={cyclePlaybackRate}>
      {rateLabel}
    </button>
  );
  const repeatButton = (
    <button
      type="button"
      className={`${mediaButtonClassName} ${loop ? "bg-[rgba(255,255,255,0.18)]" : "text-[rgba(255,255,255,0.7)]"}`}
      aria-label="Repeat"
      aria-pressed={loop}
      title="Repeat"
      onClick={toggleLoop}
    >
      <Repeat aria-hidden="true" />
    </button>
  );

  if (variant === "audio") {
    return (
      <div className={mediaPlayerClassName} aria-label="Audio controls">
        <div className="grid gap-1">
          {progressBar}
          <div className="flex items-center justify-between gap-3">
            <span className={mediaTimeClassName}>{formatMediaTime(currentTime)}</span>
            <span className={mediaTimeClassName}>-{formatMediaTime(Math.max(0, duration - currentTime))}</span>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-start">{volumeControls}</div>
          <div className="flex items-center gap-3">
            {seekBackButton}
            <button type="button" className={audioPlayButtonClassName} aria-label={paused ? "Play" : "Pause"} title={`${paused ? "Play" : "Pause"} (Space)`} onClick={togglePlay}>
              {paused ? <Play aria-hidden="true" fill="currentColor" /> : <Pause aria-hidden="true" fill="currentColor" />}
            </button>
            {seekForwardButton}
          </div>
          <div className="flex items-center justify-end gap-1">
            {rateButton}
            {repeatButton}
          </div>
        </div>
      </div>
    );
  }

  const playIcon = paused ? <Play aria-hidden="true" fill="currentColor" /> : <Pause aria-hidden="true" fill="currentColor" />;

  return (
    <>
      {/* Phones: large transport controls in the middle of the video. */}
      <div
        className={`video-center-controls pointer-events-none absolute inset-0 z-[2] flex items-center justify-center gap-10 transition-opacity duration-200 min-[720px]:hidden ${centerControlsReady ? mediaControlsVisibilityClassName : "invisible opacity-0"}`}
        aria-label="Playback controls"
      >
        {seekButton(-1, `${centerSeekButtonClassName} pointer-events-auto`, "text-[8px]")}
        <button type="button" className={`${centerPlayButtonClassName} pointer-events-auto`} aria-label={paused ? "Play" : "Pause"} onClick={togglePlay}>
          {playIcon}
        </button>
        {seekButton(1, `${centerSeekButtonClassName} pointer-events-auto`, "text-[8px]")}
      </div>
      <div
        className={`${mediaPlayerClassName} ${videoPlayerClassName} ${mediaControlsVisibilityClassName} transition-opacity duration-200`}
        aria-label="Video controls"
        onPointerMove={revealVideoControls}
      >
        {progressBar}
        <div className="flex min-w-0 items-center gap-1">
          <span className="contents max-[719px]:hidden">
            <button type="button" className={playButtonClassName} aria-label={paused ? "Play" : "Pause"} title={`${paused ? "Play" : "Pause"} (Space)`} onClick={togglePlay}>
              {playIcon}
            </button>
            {seekBackButton}
            {seekForwardButton}
          </span>
          {volumeControls}
          <span className="ml-2 max-[719px]:ml-1">{timeLabel}</span>
          <div className="ml-auto flex items-center gap-1">
            {rateButton}
            {repeatButton}
            <button type="button" className={mediaButtonClassName} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={`${fullscreen ? "Exit full screen" : "Full screen"} (F)`} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </>
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
