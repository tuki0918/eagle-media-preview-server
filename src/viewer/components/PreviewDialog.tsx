import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  closePreview,
  handlePreviewClose,
  handlePreviewDoubleClick,
  handlePreviewPointerDown,
  togglePreviewInfo,
} from "../shellActions";
import { getPreviewDialogState, subscribePreviewDialogState } from "../previewDialogState";
import { PREVIEW_TOASTER_ID } from "../toasts";
import { PreviewBodyHost } from "./PreviewBody";
import {
  ChevronLeftIcon,
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
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(true);
  const [desktopViewport, setDesktopViewport] = useState(false);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
  const dialogClassName = [
    "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none touch-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overscroll-none rounded-none border-0 bg-background p-0 text-foreground open:grid min-[900px]:transition-[grid-template-columns] min-[900px]:duration-200 min-[900px]:ease-out",
    desktopInfoOpen ? "min-[900px]:grid-cols-[minmax(0,1fr)_380px]" : "min-[900px]:grid-cols-[minmax(0,1fr)_0px]",
    "backdrop:bg-foreground/30",
    previewDialogState.mode ? `${previewDialogState.mode}-mode` : "",
    previewDialogState.infoOpen ? "info-open" : "",
    previewDialogState.mode === "video" ? "bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewBodyColumnClassName = [
    "preview-layout relative min-h-0 overflow-hidden",
    previewDialogState.mode === "video" ? "bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewInfoClassName = [
    "preview-info absolute inset-y-0 right-0 z-[6] grid w-[min(380px,calc(100vw-56px))] max-w-full content-start gap-3.5 overflow-auto border-0 border-l border-border bg-card p-3.5 text-card-foreground transition-[box-shadow,opacity,transform] duration-200",
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
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 900px)");
    const syncDesktopViewport = () => {
      setDesktopViewport(mediaQuery.matches);
    };
    syncDesktopViewport();
    mediaQuery.addEventListener("change", syncDesktopViewport);
    return () => {
      mediaQuery.removeEventListener("change", syncDesktopViewport);
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
      <header className="preview-header grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_36px] items-center gap-2 border-b border-border bg-background px-2 min-[720px]:h-14 min-[720px]:px-3 min-[900px]:col-start-1 min-[900px]:row-start-1">
        <div className="grid min-w-0 grid-cols-[36px_1px_minmax(0,1fr)] items-center gap-2">
          <button id="closePreview" className="icon-button inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-lg border border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground" type="button" aria-label="Back to results" title="Back to results" onClick={closePreview}>
            <ChevronLeftIcon />
          </button>
          <Separator
            orientation="vertical"
            className="h-4 w-0 border-l border-border bg-transparent data-[orientation=vertical]:h-4 data-[orientation=vertical]:w-0"
          />
          <div className="min-w-0 truncate text-sm font-normal text-foreground min-[720px]:text-base [&_.preview-original-name-value]:truncate [&_.preview-original-name-value]:whitespace-nowrap">
            <PreviewOriginalName />
          </div>
        </div>
        <button id="toggleInfoPreview" className="icon-button inline-grid size-9 shrink-0 touch-manipulation select-none place-items-center rounded-lg border border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground" type="button" aria-label="Media information" aria-expanded={desktopViewport ? desktopInfoOpen : previewDialogState.infoOpen} title="Media information" onClick={handleTogglePreviewInfo}>
          <span className="min-[900px]:hidden">
            <InfoIcon />
          </span>
          <span className="hidden min-[900px]:block" aria-hidden="true">
            {desktopInfoOpen ? <PanelLeftOpenIcon /> : <PanelRightOpenIcon />}
          </span>
        </button>
      </header>
      <div className={previewBodyColumnClassName}>
        <PreviewBodyHost />
      </div>
      <aside
        className={previewInfoClassName}
        aria-label="Media info"
      >
        <section className="preview-rating-section grid min-h-8 grid-cols-[minmax(82px,104px)_minmax(0,1fr)] items-center gap-4 px-2 max-[540px]:gap-3">
          <span className="info-label text-xs font-normal text-muted-foreground">Rating</span>
          <PreviewRating />
        </section>
        <PreviewInfoDetails />
        <PreviewInfoActions />
      </aside>
      <Toaster id={PREVIEW_TOASTER_ID} />
    </dialog>
  );
}

function shouldIgnorePreviewSwipe(target: Element) {
  return Boolean(target.closest("button,input,select,textarea,a,.preview-info,.image-viewport"));
}
