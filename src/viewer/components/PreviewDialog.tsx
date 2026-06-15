import { useEffect, useRef, useSyncExternalStore, type PointerEvent } from "react";
import {
  closePreview,
  handlePreviewClose,
  handlePreviewDoubleClick,
  handlePreviewPointerDown,
  togglePreviewInfo,
} from "../shellActions";
import { getPreviewDialogState, subscribePreviewDialogState } from "../previewDialogState";
import {
  getVideoOverlayControlsVisible,
  subscribeVideoOverlayControls,
} from "../videoOverlayState";
import { PreviewBodyHost } from "./PreviewBody";
import {
  ChevronLeftIcon,
  MaximizeIcon,
  PanelLeftOpenIcon,
  PanelRightOpenIcon,
  PanelTopCloseIcon,
  PanelTopOpenIcon,
} from "./Icons";
import { PreviewInfoActions, PreviewInfoDetails } from "./PreviewInfo";
import { PreviewRating } from "./RatingStars";
import { PreviewMeta, PreviewOriginalName } from "./PreviewText";

export function PreviewDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const closeSwipeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
  const videoOverlayControlsVisible = useSyncExternalStore(
    subscribeVideoOverlayControls,
    getVideoOverlayControlsVisible,
    getVideoOverlayControlsVisible,
  );
  const dialogClassName = [
    "fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none touch-none overscroll-none rounded-none border-0 bg-app-surface p-0 text-app-text",
    "backdrop:bg-[rgba(15,23,42,0.32)]",
    previewDialogState.mode ? `${previewDialogState.mode}-mode` : "",
    previewDialogState.infoOpen ? "info-open" : "",
    previewDialogState.mode === "video" ? "bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewLayoutClassName = [
    "preview-layout relative grid h-full max-h-full grid-cols-[minmax(0,1fr)] overflow-hidden p-0",
    previewDialogState.mode === "video" ? "h-dvh max-h-dvh bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewInfoClassName = [
    "preview-info absolute inset-y-0 right-0 z-[6] grid w-[min(360px,calc(100vw-56px))] max-w-full content-start gap-3.5 overflow-auto border-0 border-l border-app-border bg-[rgba(255,255,255,0.96)] p-3.5 backdrop-blur-[18px] transition-[box-shadow,transform] duration-200",
    previewDialogState.infoOpen
      ? "translate-x-0 shadow-[-18px_0_44px_rgba(15,23,42,0.14)] max-[540px]:translate-y-0 max-[540px]:shadow-[0_-18px_44px_rgba(15,23,42,0.14)]"
      : "translate-x-full shadow-none max-[540px]:translate-x-0 max-[540px]:translate-y-full",
    "max-[540px]:inset-x-0 max-[540px]:bottom-0 max-[540px]:top-auto max-[540px]:w-auto max-[540px]:max-h-[min(72dvh,560px)] max-[540px]:border-l-0 max-[540px]:border-t max-[540px]:border-app-border",
  ].join(" ");
  const previewActionButtonClassName = [
    "icon-button inline-grid touch-manipulation select-none place-items-center border backdrop-blur-[12px]",
    previewDialogState.mode === "video" || previewDialogState.mode === "audio" || previewDialogState.mode === "image"
      ? "h-11 w-11 flex-[0_0_44px] rounded-full border-[rgba(255,255,255,0.18)] bg-[rgba(15,23,42,0.48)] text-white shadow-[0_10px_28px_rgba(0,0,0,0.22)] hover:bg-[rgba(15,23,42,0.64)] hover:text-white"
      : "min-h-10 w-10 flex-[0_0_40px] rounded-app border-[rgba(203,213,225,0.82)] bg-[rgba(255,255,255,0.88)] text-app-text hover:border-[rgba(37,99,235,0.28)] hover:bg-white hover:text-app-accent",
  ].join(" ");
  const videoOverlayMenuClassName = [
    "transition-opacity duration-150",
    previewDialogState.mode === "video" && !videoOverlayControlsVisible ? "pointer-events-none opacity-0" : "opacity-100",
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

  const toggleFullscreen = async () => {
    const previewBody = previewBodyRef.current;
    if (!previewBody) return;
    const target = previewBody.querySelector("video") || previewBody.firstElementChild || previewBody;
    const videoTarget = target instanceof HTMLVideoElement
      ? target as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
      : null;
    try {
      if (videoTarget?.webkitEnterFullscreen && !document.fullscreenEnabled) {
        videoTarget.webkitEnterFullscreen();
        return;
      }
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (target.requestFullscreen) {
        await target.requestFullscreen();
        return;
      }
      if (videoTarget?.webkitEnterFullscreen) {
        videoTarget.webkitEnterFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen is unavailable in this browser.", error);
    }
  };

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
      <button id="closePreview" className={`${previewActionButtonClassName} ${videoOverlayMenuClassName} fixed left-2.5 top-[calc(10px+env(safe-area-inset-top))] z-[4]`} aria-label="Close" title="Close" onClick={closePreview}>
        <ChevronLeftIcon />
      </button>
      <div className={`dialog-header ${videoOverlayMenuClassName} fixed right-2.5 top-[calc(10px+env(safe-area-inset-top))] z-[4] flex items-center justify-end gap-3 border-0 bg-transparent p-0`}>
        <button id="backPreview" className="text-icon-button hidden min-h-10 items-center gap-2 border-0 bg-transparent px-2 text-sm font-[680] text-app-text" type="button" aria-label="Back to results" onClick={closePreview}>
          <ChevronLeftIcon />
          <span>Back to Results</span>
        </button>
        <div className="hidden">
          <strong className="block text-sm font-[720]">Media Preview Server</strong>
          <PreviewMeta />
        </div>
        <div className="dialog-actions flex items-center justify-end gap-2">
          <button id="toggleInfoPreview" className={previewActionButtonClassName} aria-label="Media information" aria-expanded={previewDialogState.infoOpen} title="Media information" onClick={togglePreviewInfo}>
            <PreviewInfoToggleIcon open={previewDialogState.infoOpen} />
          </button>
          <button id="fullscreenPreview" className={`${previewActionButtonClassName} ${previewDialogState.mode === "video" ? "" : "hidden"}`} aria-label="Fullscreen" title="Fullscreen" onClick={toggleFullscreen}>
            <MaximizeIcon />
          </button>
        </div>
      </div>
      <div className={previewLayoutClassName}>
        <PreviewBodyHost ref={previewBodyRef} />
        <aside
          className={previewInfoClassName}
          aria-label="Media info"
        >
          <section className="preview-original-name-section grid min-h-8 grid-cols-[minmax(0,1fr)] items-center border-b border-[rgba(148,163,184,0.18)] px-2 pb-3.5 pt-2 max-[540px]:pb-3.5 max-[540px]:pt-1.5">
            <PreviewOriginalName />
          </section>
          <section className="preview-rating-section grid min-h-8 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-center gap-[18px] px-2 max-[540px]:gap-3">
            <span className="info-label text-xs font-normal text-app-muted">Rating</span>
            <PreviewRating />
          </section>
          <PreviewInfoDetails />
          <PreviewInfoActions />
        </aside>
      </div>
    </dialog>
  );
}

function PreviewInfoToggleIcon({ open }: { open: boolean }) {
  return (
    <>
      <span className="hidden max-[540px]:block" aria-hidden="true">
        {open ? <PanelTopOpenIcon /> : <PanelTopCloseIcon />}
      </span>
      <span className="block max-[540px]:hidden" aria-hidden="true">
        {open ? <PanelLeftOpenIcon /> : <PanelRightOpenIcon />}
      </span>
    </>
  );
}

function shouldIgnorePreviewSwipe(target: Element) {
  return Boolean(target.closest("button,input,select,textarea,a,.preview-info"));
}
