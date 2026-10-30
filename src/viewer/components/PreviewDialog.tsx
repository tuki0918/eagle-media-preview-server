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
import { getImageOverlayControlsVisible, subscribeImageOverlayControls } from "../imageOverlayState";
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
import { PreviewOriginalName } from "./PreviewText";

export function PreviewDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeSwipeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const infoDragRef = useRef<{ pointerId: number; startY: number } | null>(null);
  const suppressHandleClick = useRef(false);
  const [infoDragOffset, setInfoDragOffset] = useState<number | null>(null);
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(true);
  const [desktopViewport, setDesktopViewport] = useState(false);
  const [touchViewport, setTouchViewport] = useState(false);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
  const videoControlsVisible = useSyncExternalStore(subscribeVideoOverlayControls, getVideoOverlayControlsVisible, getVideoOverlayControlsVisible);
  const videoMode = previewDialogState.mode === "video";
  const imageControlsVisible = useSyncExternalStore(subscribeImageOverlayControls, getImageOverlayControlsVisible, getImageOverlayControlsVisible);
  const overlayMode = videoMode || previewDialogState.mode === "image";
  const overlayControlsVisible = videoMode ? videoControlsVisible : imageControlsVisible;
  // Portrait and compact touch screens overlay media headers; landscape tablets share the desktop inspector.
  const previewHeaderClassName = [
    "preview-header grid w-full min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-background desktop:col-start-1 desktop:row-start-1",
    // On desktop match the results header (height and px-5) so the back button sits where the menu button was.
    desktopViewport ? "h-[72px] px-5 [--preview-header-height:72px]" : "h-12 px-2 [--preview-header-height:3rem] min-[720px]:h-14 min-[720px]:px-3 min-[720px]:[--preview-header-height:3.5rem]",
    // Share horizontal spacing and control-row height with document previews, including in landscape.
    // Safe-area side insets constrain the whole screen and unnecessarily squeeze this top header.
    overlayMode
      ? "touch:absolute touch:inset-x-0 touch:top-0 touch:z-[5] touch:!h-[calc(var(--preview-header-height)+env(safe-area-inset-top)+1.5rem)] touch:bg-transparent touch:bg-[linear-gradient(180deg,rgba(5,7,10,0.78),transparent)] touch:pb-6 touch:pt-[env(safe-area-inset-top)] touch:text-white touch:transition-opacity touch:duration-200 touch:[&_.icon-button]:!text-white touch:[&_.preview-original-name-value]:!text-white touch:[&_[data-slot=separator]]:!border-white/30"
      : "",
    overlayMode && !overlayControlsVisible ? "touch:pointer-events-none touch:opacity-0" : "",
    // Overlaid headers use a dark gradient and palette for contrast over the media.
    overlayMode && touchViewport ? "dark" : "",
  ].filter(Boolean).join(" ");
  const dialogClassName = [
    "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none touch-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overscroll-none rounded-none border-0 bg-background p-0 text-foreground open:grid desktop:transition-[grid-template-columns] desktop:duration-200 desktop:ease-out",
    desktopInfoOpen ? "desktop:grid-cols-[minmax(0,1fr)_380px]" : "desktop:grid-cols-[minmax(0,1fr)_0px]",
    "backdrop:bg-foreground/30",
    previewDialogState.mode ? `${previewDialogState.mode}-mode` : "",
    previewDialogState.infoOpen ? "info-open" : "",
    videoMode ? "bg-[#05070a]" : "",
    overlayMode ? "touch:grid-rows-[minmax(0,1fr)]" : "",
  ].filter(Boolean).join(" ");
  const previewBodyColumnClassName = [
    "preview-layout relative min-h-0 overflow-hidden",
    previewDialogState.mode === "video" ? "bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewInfoClassName = [
    "preview-info absolute inset-y-0 right-0 z-[6] flex w-[min(380px,calc(100vw-56px))] max-w-full flex-col gap-6 overflow-auto border-0 border-l border-border bg-card px-5 pt-5 text-card-foreground transition-[box-shadow,opacity,transform] duration-200 max-[540px]:rounded-t-[24px]",
    desktopInfoOpen
      ? "desktop:pointer-events-auto desktop:relative desktop:inset-auto desktop:z-auto desktop:col-start-2 desktop:row-span-2 desktop:row-start-1 desktop:h-full desktop:w-[380px] desktop:translate-x-0 desktop:opacity-100 desktop:shadow-none"
      : "desktop:pointer-events-none desktop:relative desktop:inset-auto desktop:z-auto desktop:col-start-2 desktop:row-span-2 desktop:row-start-1 desktop:h-full desktop:w-[380px] desktop:translate-x-3 desktop:opacity-0 desktop:shadow-none",
    previewDialogState.infoOpen
      ? "translate-x-0 shadow-[-18px_0_44px_rgba(15,23,42,0.14)] max-[540px]:translate-y-0 max-[540px]:shadow-[0_-18px_44px_rgba(15,23,42,0.14)]"
      : "translate-x-full shadow-none max-[540px]:translate-x-0 max-[540px]:translate-y-full",
    "max-[540px]:inset-x-0 max-[540px]:bottom-0 max-[540px]:top-[max(6rem,env(safe-area-inset-top))] max-[540px]:w-auto max-[540px]:max-h-none max-[540px]:border-l-0 max-[540px]:border-t max-[540px]:border-border max-[540px]:pt-0",
  ].join(" ");
  useEffect(() => {
    infoDragRef.current = null;
    setInfoDragOffset(null);
  }, [previewDialogState.infoOpen, previewDialogState.open, desktopViewport]);
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
    const mediaQuery = window.matchMedia("(min-width: 768px) and (min-height: 600px) and (orientation: landscape), (min-width: 900px) and (hover: hover), (min-width: 900px) and (pointer: fine)");
    const touchQuery = window.matchMedia("(hover: none) and (pointer: coarse) and (max-width: 767px), (hover: none) and (pointer: coarse) and (max-height: 599px), (hover: none) and (pointer: coarse) and (orientation: portrait)");
    const syncViewport = () => {
      setDesktopViewport(mediaQuery.matches);
      setTouchViewport(touchQuery.matches);
    };
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    touchQuery.addEventListener("change", syncViewport);
    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
      touchQuery.removeEventListener("change", syncViewport);
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
            <span className="desktop:hidden">
              <InfoIcon />
            </span>
            <span className="hidden desktop:block" aria-hidden="true">
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
        style={infoDragOffset === null ? undefined : { transform: `translateY(${infoDragOffset}px)`, transition: "none" }}
      >
        <button
          type="button"
          className="preview-info-handle sticky top-0 z-10 -mx-5 -mb-3 flex h-11 shrink-0 touch-none cursor-grab items-center justify-center rounded-t-[24px] border-0 bg-card active:cursor-grabbing min-[541px]:hidden"
          aria-label="Close item details"
          title="Drag down or tap to close"
          onPointerDown={(event) => {
            if (event.button !== 0 || !previewDialogState.infoOpen) return;
            event.stopPropagation();
            suppressHandleClick.current = false;
            infoDragRef.current = { pointerId: event.pointerId, startY: event.clientY };
            setInfoDragOffset(0);
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = infoDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.stopPropagation();
            setInfoDragOffset(Math.max(0, event.clientY - drag.startY));
          }}
          onPointerUp={(event) => {
            const drag = infoDragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.stopPropagation();
            const distance = event.clientY - drag.startY;
            infoDragRef.current = null;
            setInfoDragOffset(null);
            suppressHandleClick.current = Math.abs(distance) > 8;
            if (distance > 72) togglePreviewInfo();
          }}
          onPointerCancel={() => {
            infoDragRef.current = null;
            setInfoDragOffset(null);
          }}
          onClick={(event) => {
            if (suppressHandleClick.current && event.detail !== 0) {
              suppressHandleClick.current = false;
              return;
            }
            if (previewDialogState.infoOpen) togglePreviewInfo();
          }}
        >
          <span className="grid gap-1" aria-hidden="true">
            <span className="h-1 w-9 rounded-full bg-muted-foreground opacity-40" />
            <span className="h-1 w-9 rounded-full bg-muted-foreground opacity-40" />
          </span>
        </button>
        <section className="preview-info-title grid gap-1.5">
          <div className="text-base font-semibold leading-snug [&_.preview-original-name-value]:text-base [&_.preview-original-name-value]:font-semibold [&_.preview-original-name-value]:leading-snug">
            <PreviewOriginalName id="previewInfoName" source="display" />
          </div>
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
