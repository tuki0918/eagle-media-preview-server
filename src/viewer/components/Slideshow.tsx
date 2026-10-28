import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Music, Pause, Play, Presentation, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { errorMessage, mediaUrl } from "../api";
import { displayFileName } from "../format";
import { subscribeDisplaySettingsReset } from "../displayPreferences";
import { getResultSurfaceState, subscribeResultSurfaceState } from "../resultSurfaceState";
import { getSearchControlsState } from "../searchControlsState";
import { getTagChipsState } from "../tagChipsState";
import { DEFAULT_SLIDESHOW_SETTINGS, readSlideshowSettings, saveSlideshowSettings, SlideshowSource, slideshowMediaKind, type SlideshowQuery, type SlideshowSettings } from "../slideshow";
import type { EagleItem } from "../types";

const playerButton = "inline-grid size-11 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-5";
const selectClass = "h-10 w-full min-w-0 appearance-none rounded-xl border border-input bg-background pl-3 pr-9 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function SlideshowLauncher() {
  const surface = useSyncExternalStore(subscribeResultSurfaceState, getResultSurfaceState, getResultSurfaceState);
  const [query, setQuery] = useState<SlideshowQuery | null>(null);
  const close = useCallback(() => setQuery(null), []);
  const available = surface.kind === "list" && surface.items.length > 0;
  const open = () => {
    const search = getSearchControlsState();
    setQuery({ query: search.searchQuery, tags: [...getTagChipsState().tags], folderId: search.selectedFolderId, smartFolderId: search.selectedSmartFolderId, ext: search.selectedExt, rating: search.selectedRating });
  };
  return (
    <>
      <div className="slideshow-launcher pointer-events-auto fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-[calc(16px+env(safe-area-inset-left))] z-20 flex h-12 items-center rounded-full bg-[color-mix(in_srgb,var(--card)_86%,transparent)] px-1.5 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl min-[720px]:bottom-6 min-[720px]:left-6">
        <button type="button" className="inline-grid size-9 place-items-center rounded-full border-0 bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40" aria-label="Slideshow" title="Slideshow" disabled={!available} onClick={open}>
          <Presentation className="size-[18px]" aria-hidden="true" />
        </button>
      </div>
      {query ? <SlideshowDialog query={query} onClose={close} /> : null}
    </>
  );
}

export function SlideshowDialog({ query, onClose }: { query: SlideshowQuery; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState(readSlideshowSettings);
  const [running, setRunning] = useState(false);
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (document.fullscreenElement === screenRef.current) void document.exitFullscreen?.().catch(() => {});
    onClose();
  }, [onClose]);

  useEffect(() => subscribeDisplaySettingsReset(() => setSettings({ ...DEFAULT_SLIDESHOW_SETTINGS })), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let entered = false;
    const changed = () => {
      if (document.fullscreenElement === screenRef.current) entered = true;
      else if (entered) close();
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [close]);

  const fullscreen = () => {
    // A user gesture is required; unsupported devices keep the viewport-filling player.
    try { void screenRef.current?.requestFullscreen?.().catch(() => {}); } catch { /* Viewport fallback. */ }
  };
  const start = () => {
    saveSlideshowSettings(settings);
    setRunning(true);
    fullscreen();
  };

  return createPortal(
    <dialog ref={dialogRef} aria-label="Slideshow" className={running ? "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-white backdrop:bg-black" : "fixed inset-0 m-auto max-h-[calc(100dvh-24px)] w-[min(480px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50"} onCancel={(event) => { event.preventDefault(); close(); }}>
      <div ref={screenRef} className={running ? "relative h-full w-full overflow-hidden bg-black text-white [&:fullscreen]:h-screen [&:fullscreen]:w-screen" : "relative flex max-h-[inherit] flex-col bg-card text-card-foreground"}>
        {running ? <SlideshowPlayer query={query} settings={settings} onClose={close} /> : (
          <>
            <header className="flex min-h-[60px] shrink-0 items-center gap-3 pb-3 pl-5 pr-14 pt-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Presentation className="size-5" aria-hidden="true" />Slideshow</h2>
              <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 size-9 rounded-full text-muted-foreground" aria-label="Close slideshow settings" onClick={close}><X /></Button>
            </header>
            <div className="slideshow-settings-fields grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-5 pb-4 pt-1 min-[360px]:grid-cols-2">
              <label className="grid min-w-0 content-start gap-2 text-xs font-medium text-muted-foreground"><span className="uppercase">Image display time</span>
                <span className="relative block">
                  <select className={selectClass} value={settings.seconds} onChange={(event) => setSettings({ ...settings, seconds: Number(event.target.value) })}>
                    {[3, 5, 10, 15, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </span>
              </label>
              <label className="grid min-w-0 content-start gap-2 text-xs font-medium text-muted-foreground"><span className="uppercase">Transition</span>
                <span className="relative block">
                  <select className={selectClass} value={settings.effect} onChange={(event) => setSettings({ ...settings, effect: event.target.value as SlideshowSettings["effect"] })}>
                    <option value="none">None</option><option value="fade">Fade</option><option value="slide">Slide</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </span>
              </label>
              <SlideshowToggle label="Show title" checked={settings.showTitle} onChange={(showTitle) => setSettings({ ...settings, showTitle })} />
              <SlideshowToggle label="Loop" checked={settings.loop} onChange={(loop) => setSettings({ ...settings, loop })} />
            </div>
            <footer className="shrink-0 border-t border-border bg-card px-5 py-4">
              <Button type="button" className="primary-action-button h-11 w-full touch-manipulation rounded-full transition-colors active:not-aria-[haspopup]:translate-y-0" onClick={start}><Play className="size-4" />START</Button>
            </footer>
          </>
        )}
      </div>
    </dialog>, document.body,
  );
}

function SlideshowToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
      <span>{label}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" className="pointer-events-none relative h-5 w-9 shrink-0 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-background after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
    </label>
  );
}

interface Slide { item: EagleItem; index: number; token: number }
export function SlideshowPlayer({ query, settings, onClose }: { query: SlideshowQuery; settings: SlideshowSettings; onClose: () => void }) {
  const sourceRef = useRef<SlideshowSource | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [preparedNext, setPreparedNext] = useState<{ item: EagleItem; index: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [seekVersion, setSeekVersion] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const controlsTimer = useRef<number | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const request = useRef(0);
  const targetIndex = useRef(0);
  const currentIndex = useRef(-1);
  const remaining = useRef({ token: 0, ms: settings.seconds * 1000 });
  const navigate = useCallback(async (index: number) => {
    const source = sourceRef.current;
    if (!source) return;
    const generation = ++request.current;
    targetIndex.current = index;
    mediaRef.current?.pause();
    setLoading(true); setReady(false); setError(""); setBlocked(false); setFinished(false); setBuffering(false);
    try {
      let item = await source.itemAt(index);
      if (generation !== request.current) return;
      if (!item && settings.loop && index > 0) {
        index = 0;
        targetIndex.current = 0;
        item = await source.itemAt(0);
        if (generation !== request.current) return;
      }
      setTotal(source.total);
      if (!item) { setFinished(true); setPaused(true); setLoading(false); return; }
      currentIndex.current = index;
      remaining.current = { token: generation, ms: settings.seconds * 1000 };
      setCurrentTime(0); setMediaDuration(0);
      setSlide({ item, index, token: generation });
      setLoading(false);
    } catch (cause) {
      if (generation !== request.current) return;
      setError(cause instanceof DOMException && cause.name === "AbortError" ? "The server took too long to respond. Please retry." : errorMessage(cause));
      setPaused(true); setLoading(false);
    }
  }, [settings.loop, settings.seconds]);

  useEffect(() => {
    const source = new SlideshowSource(query);
    sourceRef.current = source;
    void navigate(0);
    return () => { request.current += 1; source.dispose(); };
  }, [navigate, query]);

  useEffect(() => {
    if (!slide || !ready || loading || error || finished) return;
    const source = sourceRef.current;
    if (!source) return;
    let cancelled = false;
    setPreparedNext(null);
    const nextIndex = source.total !== null && slide.index + 1 >= source.total
      ? settings.loop ? 0 : -1
      : slide.index + 1;
    if (nextIndex >= 0) {
      void source.peek(nextIndex).then((item) => {
        if (!cancelled && item) setPreparedNext({ item, index: nextIndex });
      }).catch(() => { /* Retry on demand; a failed preload must not interrupt playback. */ });
    }
    return () => { cancelled = true; };
  }, [slide, ready, loading, error, finished, settings.loop]);

  const advance = useCallback(() => { void navigate(currentIndex.current + 1); }, [navigate]);
  const kind = slide ? slideshowMediaKind(slide.item) : null;
  const staticSlide = kind === "image" || kind === "thumbnail";
  useEffect(() => {
    if (!slide || !staticSlide || !ready || paused || loading || error || finished) return;
    const budget = remaining.current;
    const started = performance.now();
    const elapsed = () => Math.min(settings.seconds, settings.seconds - Math.max(0, budget.ms - (performance.now() - started)) / 1000);
    const interval = window.setInterval(() => setCurrentTime(elapsed()), 100);
    const timer = window.setTimeout(() => { setCurrentTime(settings.seconds); advance(); }, Math.max(0, budget.ms));
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
      if (remaining.current === budget) budget.ms = Math.max(0, budget.ms - (performance.now() - started));
    };
  }, [slide, staticSlide, ready, paused, loading, error, finished, advance, settings.seconds, seekVersion]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !slide || loading || error || finished || !ready) return;
    let cancelled = false;
    if (paused) media.pause();
    else void media.play().catch(() => { if (!cancelled) { setBlocked(true); setPaused(true); } });
    return () => { cancelled = true; };
  }, [slide, ready, paused, loading, error, finished]);
  useEffect(() => {
    const media = mediaRef.current;
    return () => { media?.pause(); };
  }, [slide]);
  useEffect(() => {
    if ((!loading && ready && !buffering) || error || finished || paused) return;
    const timer = window.setTimeout(() => { setError("This file is taking too long to load. Retry or skip it."); setPaused(true); }, 20000);
    return () => window.clearTimeout(timer);
  }, [slide, loading, ready, buffering, error, finished, paused]);

  const clearControlsTimer = useCallback(() => {
    if (controlsTimer.current !== null) window.clearTimeout(controlsTimer.current);
    controlsTimer.current = null;
  }, []);
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearControlsTimer();
    if (!paused) controlsTimer.current = window.setTimeout(() => setControlsVisible(false), 2500);
  }, [paused, clearControlsTimer]);
  useEffect(() => {
    clearControlsTimer();
    if (controlsVisible && !paused && !focusWithin) {
      controlsTimer.current = window.setTimeout(() => setControlsVisible(false), 2500);
    }
    return clearControlsTimer;
  }, [paused, controlsVisible, focusWithin, clearControlsTimer]);

  const togglePause = useCallback(() => {
    if (finished) { setPaused(false); void navigate(0); return; }
    if (loading || error) return;
    if (paused) {
      setBlocked(false);
      // Call play inside the click/keyboard gesture for browsers that block autoplay.
      void mediaRef.current?.play().catch(() => { setBlocked(true); setPaused(true); });
    }
    setPaused((value) => !value);
  }, [finished, loading, error, paused, navigate]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test((event.target as HTMLElement)?.tagName)) return;
      if ((event.target as HTMLElement)?.closest("button") && (event.key === " " || event.key === "Enter")) return;
      if (event.key === " ") { event.preventDefault(); togglePause(); }
      if (event.key === "ArrowRight" && !loading && !error && !finished) { event.preventDefault(); advance(); }
      if (event.key === "ArrowLeft" && !loading && !error && currentIndex.current > 0) { event.preventDefault(); void navigate(currentIndex.current - 1); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [togglePause, loading, error, finished, advance, navigate]);

  const duration = staticSlide ? settings.seconds : mediaDuration;
  const syncMediaTime = () => {
    const media = mediaRef.current;
    if (!media) return;
    setCurrentTime(Number.isFinite(media.currentTime) ? media.currentTime : 0);
    setMediaDuration(Number.isFinite(media.duration) ? media.duration : 0);
  };
  const seek = (value: number) => {
    const time = Math.min(duration, Math.max(0, value));
    if (staticSlide && slide) {
      remaining.current = { token: slide.token, ms: (settings.seconds - time) * 1000 };
      setSeekVersion((version) => version + 1);
    } else if (mediaRef.current) {
      mediaRef.current.currentTime = time;
    }
    setCurrentTime(time);
    revealControls();
  };
  const controlsShown = controlsVisible || focusWithin || blocked || Boolean(error) || finished;
  const controlsVisibility = controlsShown ? "visible opacity-100" : "pointer-events-none invisible opacity-0";
  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0;
  const failMedia = () => { setError("Unable to play this file. Retry or skip it."); setPaused(true); };
  const retry = () => { setPreparedNext(null); setPaused(false); void navigate(targetIndex.current); };
  const skip = () => { setPaused(false); void navigate(targetIndex.current + 1); };
  const title = slide ? displayFileName(slide.item) || "Untitled" : "Slideshow";
  const slideLoading = Boolean((loading || (slide && !ready) || buffering) && !error && !finished && !blocked);
  return (
    <section
      className="relative grid h-full w-full grid-rows-[minmax(0,1fr)] bg-black text-white outline-none"
      aria-label="Slideshow player"
      aria-busy={slideLoading}
      tabIndex={0}
      onPointerDown={() => setFocusWithin(false)}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse" && (event.movementX || event.movementY)) revealControls();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        clearControlsTimer(); setControlsVisible(false);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse" || (event.target as HTMLElement).closest("button,input")) return;
        if (controlsVisible) { clearControlsTimer(); setControlsVisible(false); }
        else revealControls();
      }}
      onFocusCapture={(event) => {
        // Pointer focus must not pin the overlay open after a click.
        if ((event.target as HTMLElement).matches(":focus-visible")) setFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      {[
        ...(slide && !loading ? [{ item: slide.item, index: slide.index, active: true }] : []),
        ...(preparedNext && (loading || preparedNext.index !== slide?.index) ? [{ ...preparedNext, active: false }] : []),
      ].map((frame) => (
        <SlideshowFrame
          key={`${frame.index}:${String(frame.item.id)}`}
          item={frame.item}
          active={frame.active}
          effect={settings.effect}
          mediaRef={mediaRef}
          onReady={() => { setReady(true); setBuffering(false); syncMediaTime(); }}
          onBuffering={setBuffering}
          onTime={syncMediaTime}
          onEnded={() => { syncMediaTime(); advance(); }}
          onError={failMedia}
          onPreloadError={() => setPreparedNext(null)}
          muted={muted}
        />
      ))}
      {slideLoading ? <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status" aria-label="Loading slide"><div className="grid justify-items-center gap-3 text-center"><span aria-hidden="true" className="size-9 animate-spin rounded-full border-2 border-white/25 border-t-white motion-reduce:animate-none" /><p className="text-sm text-white/80">Loading slide…</p></div></div> : null}
      {error ? <div className="absolute inset-0 grid place-items-center bg-black/80 p-6"><div className="grid max-w-sm justify-items-center gap-4 text-center" role="alert"><p className="text-sm leading-relaxed">{error}</p><div className="flex gap-3"><Button onClick={retry}>Retry</Button><Button variant="secondary" onClick={skip}>Skip</Button></div></div></div> : null}
      {finished ? <div className="absolute inset-0 grid place-items-center bg-black/65 p-6"><div className="grid justify-items-center gap-4"><p className="text-lg">Slideshow complete</p><Button onClick={togglePause}><RotateCcw className="size-4" />Replay</Button></div></div> : null}
      {blocked ? <p className="pointer-events-none absolute inset-x-0 top-[calc(50%+64px)] text-center text-sm text-white/80" role="status">Tap to play</p> : null}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-4 bg-gradient-to-b from-black/70 to-transparent px-[max(16px,env(safe-area-inset-left))] pb-10 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="min-w-0">{settings.showTitle ? <p className="truncate text-sm font-medium" title={title}>{title}</p> : null}<p className={`${settings.showTitle ? "mt-1 " : ""}text-xs text-white/60`} aria-live="off">{slide ? `${slide.index + 1} / ${total ?? "…"}` : "Slideshow"}{kind === "thumbnail" ? " · Thumbnail" : ""}</p></div>
        <div className={`flex shrink-0 items-center gap-1 transition-opacity duration-200 ${controlsVisibility}`} aria-hidden={!controlsShown}>
          <button type="button" className={`pointer-events-auto ${playerButton}`} aria-label="Previous slide" title="Previous item" disabled={loading || Boolean(error) || !slide || slide.index === 0} onClick={() => { void navigate(currentIndex.current - 1); }}><ChevronLeft /></button>
          <button type="button" className={`pointer-events-auto ${playerButton}`} aria-label="Next slide" title="Next item" disabled={loading || Boolean(error) || finished} onClick={advance}><ChevronRight /></button>
          <Separator orientation="vertical" className="mx-1 h-4 w-0 border-l border-white/30 bg-transparent data-[orientation=vertical]:h-4 data-[orientation=vertical]:w-0" />
          <button type="button" className={`pointer-events-auto ${playerButton} ${controlsVisibility}`} aria-label="Close slideshow" title="Close slideshow (Esc)" onClick={onClose}><X /></button>
        </div>
      </header>
      {!error && !finished && !loading && ready && !buffering ? (
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-5 transition-opacity duration-200 ${controlsVisibility}`} aria-hidden={!controlsShown}>
          <button type="button" className="pointer-events-auto inline-grid size-24 shrink-0 place-items-center rounded-full border-0 bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-10" aria-label={paused ? "Resume slideshow" : "Pause slideshow"} disabled={loading} onClick={togglePause}>{paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}</button>
        </div>
      ) : null}
      <footer className={`absolute inset-x-0 bottom-0 grid gap-1 bg-gradient-to-t from-black/80 to-transparent px-[max(16px,env(safe-area-inset-left))] pb-[max(12px,env(safe-area-inset-bottom))] pt-12 transition-opacity duration-200 ${controlsVisibility}`} aria-hidden={!controlsShown}>
        <input
          type="range"
          aria-label="Slide playback position"
          aria-valuetext={`${playbackTime(currentTime)} of ${playbackTime(duration)}`}
          className="media-range h-4 w-full cursor-pointer touch-manipulation appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
          min={0}
          max={duration || 1}
          step={0.01}
          value={Math.min(currentTime, duration)}
          style={{ ["--media-progress" as string]: `${progress}%` }}
          disabled={loading || !ready || Boolean(error) || finished || duration <= 0}
          onInput={(event) => seek(Number(event.currentTarget.value))}
        />
        <div className="flex min-h-9 items-center justify-between gap-3">
          <span className="text-xs font-medium tabular-nums text-white/80" aria-label="Playback time">{playbackTime(currentTime)} / {playbackTime(duration)}</span>
          {kind === "video" || kind === "audio" ? <button type="button" className={playerButton} aria-label={muted ? "Unmute slideshow" : "Mute slideshow"} onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}</button> : null}
        </div>
      </footer>
    </section>
  );
}

function SlideshowFrame({ item, active, effect, mediaRef, onReady, onBuffering, onTime, onEnded, onError, onPreloadError, muted }: {
  item: EagleItem;
  active: boolean;
  effect: SlideshowSettings["effect"];
  mediaRef: { current: HTMLMediaElement | null };
  onReady: () => void;
  onBuffering: (buffering: boolean) => void;
  onTime: () => void;
  onEnded: () => void;
  onError: () => void;
  onPreloadError: () => void;
  muted: boolean;
}) {
  const kind = slideshowMediaKind(item);
  const [prepared, setPrepared] = useState(false);
  const [failed, setFailed] = useState(false);
  const localMediaRef = useRef<HTMLMediaElement | null>(null);
  const isStatic = kind === "image" || kind === "thumbnail";
  const fail = () => { if (active) setFailed(true); else onPreloadError(); };
  const prepareImage = (image: HTMLImageElement) => {
    if (typeof image.decode === "function") {
      void image.decode().catch(() => {}).then(() => setPrepared(true));
    } else setPrepared(true);
  };
  // Keep the next frame mounted and promote it without recreating its image/media element.
  useEffect(() => {
    if (!active) return;
    const media = localMediaRef.current;
    if (media) { mediaRef.current = media; media.currentTime = 0; }
  }, [active]);
  useEffect(() => {
    if (active && failed) onError();
    else if (active && prepared) onReady();
  }, [active, prepared, failed]);
  useEffect(() => {
    const media = localMediaRef.current;
    return () => { media?.pause(); };
  }, []);
  const bindMedia = (element: HTMLMediaElement | null) => {
    localMediaRef.current = element;
    if (active) mediaRef.current = element;
  };
  const mediaEvents = {
    onCanPlay: () => { setPrepared(true); if (active) onBuffering(false); },
    onPlaying: () => { if (active) onBuffering(false); },
    onWaiting: () => { if (active) onBuffering(true); },
    onLoadedMetadata: () => { if (active) onTime(); },
    onDurationChange: () => { if (active) onTime(); },
    onTimeUpdate: () => { if (active) onTime(); },
    onEnded: () => { if (active) onEnded(); },
    onError: fail,
  };
  return (
    <div
      className={active ? `slideshow-frame relative grid h-full min-h-0 w-full place-items-center ${effect === "none" ? "" : `slideshow-${effect}`}` : "hidden"}
      aria-hidden={!active}
      data-slideshow-preload={active ? undefined : "true"}
    >
      {isStatic ? <img src={mediaUrl(String(item.id), kind === "image" ? "file" : "thumb")} alt={active ? displayFileName(item) || "Untitled" : ""} className="h-full min-h-0 w-full object-contain" decoding="async" onLoad={(event) => prepareImage(event.currentTarget)} onError={fail} /> : null}
      {kind === "video" ? <video ref={bindMedia} className="h-full min-h-0 w-full object-contain" src={mediaUrl(String(item.id), "file")} playsInline muted={muted || !active} preload="auto" {...mediaEvents} /> : null}
      {kind === "audio" ? <div className="grid w-[min(420px,80vw)] justify-items-center px-4"><AudioArtwork item={item} /><audio ref={bindMedia} src={mediaUrl(String(item.id), "file")} muted={muted || !active} preload="auto" {...mediaEvents} /></div> : null}
    </div>
  );
}

function AudioArtwork({ item }: { item: EagleItem }) {
  const [missing, setMissing] = useState(item.noThumbnail === true);
  return <div className="grid aspect-square w-[min(280px,44dvh)] place-items-center overflow-hidden rounded-2xl bg-white/10">{missing ? <Music className="size-16 text-white/60" strokeWidth={1.5} /> : <img className="h-full w-full object-cover" src={mediaUrl(String(item.id), "thumb")} alt="" onError={() => setMissing(true)} />}</div>;
}

function playbackTime(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
