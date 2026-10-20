import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  closePreview,
  handlePreviewClose,
  handlePreviewDoubleClick,
  handlePreviewPointerDown,
  stepPreview,
  togglePreviewInfo,
} from "../shellActions";
import { getPreviewDialogState, subscribePreviewDialogState } from "../previewDialogState";
import { getVideoOverlayControlsVisible, subscribeVideoOverlayControls } from "../videoOverlayState";
import { PREVIEW_TOASTER_ID } from "../toasts";
import { PreviewBodyHost } from "./PreviewBody";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  PanelLeftOpenIcon,
  PanelRightOpenIcon,
} from "./Icons";
import { PreviewInfoActions, PreviewInfoDetails } from "./PreviewInfo";
import { PreviewRating } from "./RatingStars";
import { PreviewMeta, PreviewOriginalName } from "./PreviewText";

export function PreviewDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeSwipeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(true);
  const [desktopViewport, setDesktopViewport] = useState(false);
  const [phoneViewport, setPhoneViewport] = useState(false);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
  const videoControlsVisible = useSyncExternalStore(subscribeVideoOverlayControls, getVideoOverlayControlsVisible, getVideoOverlayControlsVisible);
  const videoMode = previewDialogState.mode === "video";
  // On phones the video fills the screen and the header overlays it, fading with the player controls.
  const previewHeaderClassName = [
    "preview-header grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-background px-2 min-[720px]:h-14 min-[720px]:px-3 min-[900px]:col-start-1 min-[900px]:row-start-1",
    videoMode
      ? "max-[719px]:absolute max-[719px]:inset-x-0 max-[719px]:top-0 max-[719px]:z-[5] max-[719px]:h-[calc(3rem+env(safe-area-inset-top)+1.5rem)] max-[719px]:bg-transparent max-[719px]:bg-[linear-gradient(180deg,rgba(5,7,10,0.78),transparent)] max-[719px]:pb-6 max-[719px]:pt-[env(safe-area-inset-top)] max-[719px]:text-white max-[719px]:transition-opacity max-[719px]:duration-200 max-[719px]:[&_.icon-button]:!text-white max-[719px]:[&_.preview-original-name-value]:!text-white max-[719px]:[&_[data-slot=separator]]:!border-white/30"
      : "",
    videoMode && !videoControlsVisible ? "max-[719px]:pointer-events-none max-[719px]:opacity-0" : "",
    // The header sits on the black video on phones, so it always uses the dark palette (hover colours included).
    videoMode && phoneViewport ? "dark" : "",
  ].filter(Boolean).join(" ");
  const dialogClassName = [
    "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none touch-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overscroll-none rounded-none border-0 bg-background p-0 text-foreground open:grid min-[900px]:transition-[grid-template-columns] min-[900px]:duration-200 min-[900px]:ease-out",
    desktopInfoOpen ? "min-[900px]:grid-cols-[minmax(0,1fr)_380px]" : "min-[900px]:grid-cols-[minmax(0,1fr)_0px]",
    "backdrop:bg-foreground/30",
    previewDialogState.mode ? `${previewDialogState.mode}-mode` : "",
    previewDialogState.infoOpen ? "info-open" : "",
    videoMode ? "bg-[#05070a] max-[719px]:grid-rows-[minmax(0,1fr)]" : "",
  ].filter(Boolean).join(" ");
  const previewBodyColumnClassName = [
    "preview-layout relative min-h-0 overflow-hidden",
    previewDialogState.mode === "video" ? "bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewInfoClassName = [
    "preview-info absolute inset-y-0 right-0 z-[6] flex w-[min(380px,calc(100vw-56px))] max-w-full flex-col gap-6 overflow-auto border-0 border-l border-border bg-card px-5 pt-5 text-card-foreground transition-[box-shadow,opacity,transform] duration-200 max-[540px]:rounded-t-[24px]",
    desktopInfoOpen
      ? "min-[900px]:pointer-events-auto min-[900px]:relative min-[900px]:inset-auto min-[900px]:z-auto min-[900px]:col-start-2 min-[900px]:row-span-2 min-[900px]:row-start-1 min-[900px]:h-full min-[900px]:w-[380px] min-[900px]:translate-x-0 min-[900px]:opacity-100 min-[900px]:shadow-none"
      : "min-[900px]:pointer-events-none min-[900px]:relative min-[900px]:inset-auto min-[900px]:z-auto min-[900px]:col-start-2 min-[900px]:row-span-2 min-[900px]:row-start-1 min-[900px]:h-full min-[900px]:w-[380px] min-[900px]:translate-x-3 min-[900px]:opacity-0 min-[900px]:shadow-none",
    previewDialogState.infoOpen
      ? "translate-x-0 shadow-[-18px_0_44px_rgba(15,23,42,0.14)] max-[540px]:translate-y-0 max-[540px]:shadow-[0_-18px_44px_rgba(15,23,42,0.14)]"
      : "translate-x-full shadow-none max-[540px]:translate-x-0 max-[540px]:translate-y-full",
    "max-[540px]:inset-x-0 max-[540px]:bottom-0 max-[540px]:top-auto max-[540px]:w-auto max-[540px]:max-h-[min(72dvh,560px)] max-[540px]:border-l-0 max-[540px]:border-t max-[540px]:border-border",
  ].join(" ");
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    document.body.classList.toggle("modal-open", previewDialogState.open);
    if (!previewDialogState.open) {
      if (typeof dialog.close === "function" && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
      return;
    }

    if (typeof dialog.showModal === "function") {
      try {
        if (!dialog.open) {
          dialog.showModal();
          requestAnimationFrame(() => {
            if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) {
              document.activeElement.blur();
            }
          });
        }
        return;
      } catch {
        // Safari fallback below.
      }
    }
    dialog.setAttribute("open", "");
  }, [previewDialogState.open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const preventGestureWhileOpen = (event: Event) => {
      if (dialog.open) {
        event.preventDefault();
      }
    };
    const preventMultiTouchWhileOpen = (event: TouchEvent) => {
      if (dialog.open && event.touches.length > 1) {
        event.preventDefault();
      }
    };
    const preventTrackpadPinchWhileOpen = (event: WheelEvent) => {
      if (dialog.open && event.ctrlKey) {
        event.preventDefault();
      }
    };
    const options = { passive: false };
    for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
      document.addEventListener(eventName, preventGestureWhileOpen, options);
    }
    document.addEventListener("touchmove", preventMultiTouchWhileOpen, options);
    document.addEventListener("wheel", preventTrackpadPinchWhileOpen, options);
    return () => {
      for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
        document.removeEventListener(eventName, preventGestureWhileOpen);
      }
      document.removeEventListener("touchmove", preventMultiTouchWhileOpen);
      document.removeEventListener("wheel", preventTrackpadPinchWhileOpen);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog.open || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input,select,textarea,[contenteditable='true'],video,audio")) return;
      event.preventDefault();
      stepPreview(event.key === "ArrowLeft" ? -1 : 1);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 900px)");
    const phoneQuery = window.matchMedia("(max-width: 719px)");
    const syncViewport = () => {
      setDesktopViewport(mediaQuery.matches);
      setPhoneViewport(phoneQuery.matches);
    };
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    phoneQuery.addEventListener("change", syncViewport);
    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
      phoneQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  const startCloseSwipe = (event: PointerEvent<HTMLDialogElement>) => {
    if (event.pointerType !== "touch") return;
    const target = event.target;
    if (target instanceof Element && shouldIgnorePreviewSwipe(target)) return;
    closeSwipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const endCloseSwipe = (event: PointerEvent<HTMLDialogElement>) => {
    const session = closeSwipeRef.current;
    closeSwipeRef.current = null;
    if (!session || session.pointerId !== event.pointerId) return;
    const deltaX = Math.abs(event.clientX - session.startX);
    const deltaY = event.clientY - session.startY;
    if (deltaY > 72 && deltaY > deltaX * 1.35) {
      closePreview();
    }
  };

  const handleDialogPointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    handlePreviewPointerDown(event);
    startCloseSwipe(event);
  };
  const handleTogglePreviewInfo = () => {
    if (desktopViewport) {
      setDesktopInfoOpen((open) => !open);
      return;
    }
    togglePreviewInfo();
  };

  return (
    <dialog
      ref={dialogRef}
      id="previewDialog"
      className={dialogClassName}
      onClose={handlePreviewClose}
      onDoubleClick={handlePreviewDoubleClick}
      onPointerCancel={() => {
        closeSwipeRef.current = null;
      }}
      onPointerDown={handleDialogPointerDown}
      onPointerUp={endCloseSwipe}
    >
      <header className={previewHeaderClassName}>
        <div className="grid min-w-0 grid-cols-[36px_1px_minmax(0,1fr)] items-center gap-2">
          <button id="closePreview" className="icon-button inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-full border border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground" type="button" aria-label="Back to results" title="Back to results" onClick={closePreview}>
            <ChevronLeftIcon />
          </button>
          <Separator
            orientation="vertical"
            className="h-4 w-0 border-l border-border bg-transparent data-[orientation=vertical]:h-4 data-[orientation=vertical]:w-0"
          />
          <div className="min-w-0 truncate text-sm font-medium text-foreground [&_.preview-original-name-value]:truncate [&_.preview-original-name-value]:whitespace-nowrap">
            <PreviewOriginalName source="display" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <PreviewStepButton direction="previous" disabled={!previewDialogState.hasPrevious} />
          <PreviewStepButton direction="next" disabled={!previewDialogState.hasNext} />
          <Separator
            orientation="vertical"
            className="mx-1 h-4 w-0 border-l border-border bg-transparent data-[orientation=vertical]:h-4 data-[orientation=vertical]:w-0"
          />
          <button id="toggleInfoPreview" className="icon-button inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-full border border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground" type="button" aria-label="Media information" aria-expanded={desktopViewport ? desktopInfoOpen : previewDialogState.infoOpen} title="Media information" onClick={handleTogglePreviewInfo}>
            <span className="min-[900px]:hidden">
              <InfoIcon />
            </span>
            <span className="hidden min-[900px]:block" aria-hidden="true">
              {desktopInfoOpen ? <PanelLeftOpenIcon /> : <PanelRightOpenIcon />}
            </span>
          </button>
        </div>
      </header>
      <div className={previewBodyColumnClassName}>
        <PreviewBodyHost />
      </div>
      <aside
        className={previewInfoClassName}
        aria-label="Media info"
      >
        <section className="preview-info-title grid gap-1.5">
          <div className="text-base font-semibold leading-snug [&_.preview-original-name-value]:text-base [&_.preview-original-name-value]:font-semibold [&_.preview-original-name-value]:leading-snug">
            <PreviewOriginalName id="previewInfoName" source="display" />
          </div>
          <p className="m-0 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground [font-variant-numeric:tabular-nums]">
            <PreviewMeta />
          </p>
        </section>
        <section className="preview-rating-section flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border px-3.5 py-2">
          <span className="info-label text-[13px] font-normal text-muted-foreground">Rating</span>
          <PreviewRating />
        </section>
        <PreviewInfoDetails />
        <PreviewInfoActions />
      </aside>
      <Toaster id={PREVIEW_TOASTER_ID} />
    </dialog>
  );
}

function PreviewStepButton({ direction, disabled }: { direction: "previous" | "next"; disabled: boolean }) {
  const previous = direction === "previous";
  const label = previous ? "Previous item" : "Next item";
  return (
    <button
      className="preview-step-button icon-button inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-full border border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-35"
      type="button"
      aria-label={label}
      title={`${label} (${previous ? "←" : "→"})`}
      disabled={disabled}
      onClick={() => stepPreview(previous ? -1 : 1)}
    >
      {previous ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </button>
  );
}

function shouldIgnorePreviewSwipe(target: Element) {
  return Boolean(target.closest("button,input,select,textarea,a,.preview-info,.image-viewport"));
}
