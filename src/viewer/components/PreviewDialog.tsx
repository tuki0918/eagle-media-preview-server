import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  closePreview,
  handlePreviewClose,
  handlePreviewDoubleClick,
  handlePreviewPointerDown,
  togglePreviewInfo,
} from "../shellActions";
import { getPreviewDialogState, subscribePreviewDialogState } from "../previewDialogState";
import { PreviewBodyHost } from "./PreviewBody";
import { ChevronLeftIcon, MaximizeIcon, PanelLeftIcon, XIcon } from "./Icons";
import { PreviewInfoActions, PreviewInfoDetails } from "./PreviewInfo";
import { PreviewRating } from "./RatingStars";
import { PreviewMeta, PreviewOriginalName } from "./PreviewText";

export function PreviewDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previewBodyRef = useRef<HTMLDivElement | null>(null);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
  const dialogClassName = [
    "h-dvh max-h-dvh w-screen max-w-full rounded-none border-0 bg-app-surface p-0 text-app-text",
    "backdrop:bg-[rgba(15,23,42,0.32)]",
    previewDialogState.mode ? `${previewDialogState.mode}-mode` : "",
    previewDialogState.infoOpen ? "info-open" : "",
    previewDialogState.mode === "video" ? "bg-[#05070a]" : "",
  ].filter(Boolean).join(" ");
  const previewLayoutClassName = [
    "preview-layout relative grid h-full max-h-full grid-cols-[minmax(0,1fr)] overflow-hidden p-0",
    previewDialogState.mode === "video" ? "h-dvh max-h-dvh bg-[#05070a] pt-[calc(60px+env(safe-area-inset-top))]" : "",
  ].filter(Boolean).join(" ");
  const previewInfoClassName = [
    "preview-info absolute inset-y-0 left-0 z-[3] grid w-[min(360px,calc(100vw-56px))] max-w-full content-start gap-3.5 overflow-auto border-0 border-r border-app-border bg-[rgba(255,255,255,0.96)] p-3.5 shadow-[18px_0_44px_rgba(15,23,42,0.14)] backdrop-blur-[18px] transition-transform duration-200",
    previewDialogState.infoOpen ? "translate-x-0 max-[540px]:translate-y-0" : "-translate-x-full max-[540px]:translate-x-0 max-[540px]:translate-y-full",
    "max-[540px]:inset-x-0 max-[540px]:bottom-0 max-[540px]:top-auto max-[540px]:w-auto max-[540px]:max-h-[min(72dvh,560px)] max-[540px]:border-r-0 max-[540px]:border-t max-[540px]:border-app-border max-[540px]:shadow-[0_-18px_44px_rgba(15,23,42,0.14)]",
  ].join(" ");
  const previewActionButtonClassName = [
    "icon-button inline-grid min-h-10 w-10 flex-[0_0_40px] touch-manipulation select-none place-items-center rounded-app border backdrop-blur-[12px]",
    previewDialogState.mode === "video" || previewDialogState.mode === "audio"
      ? "border-[rgba(255,255,255,0.2)] bg-[rgba(15,23,42,0.62)] text-white hover:border-[rgba(255,255,255,0.38)] hover:bg-[rgba(15,23,42,0.82)] hover:text-white"
      : "border-[rgba(203,213,225,0.82)] bg-[rgba(255,255,255,0.88)] text-app-text hover:border-[rgba(37,99,235,0.28)] hover:bg-white hover:text-app-accent",
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
    for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
      dialog.addEventListener(eventName, preventGestureWhileOpen);
    }
    return () => {
      for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
        dialog.removeEventListener(eventName, preventGestureWhileOpen);
      }
    };
  }, []);

  const toggleFullscreen = async () => {
    const previewBody = previewBodyRef.current;
    if (!previewBody) return;
    const target = previewBody.firstElementChild || previewBody;
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

  return (
    <dialog
      ref={dialogRef}
      id="previewDialog"
      className={dialogClassName}
      onClose={handlePreviewClose}
      onDoubleClick={handlePreviewDoubleClick}
      onPointerDown={handlePreviewPointerDown}
    >
      <div className="dialog-header fixed right-2.5 top-[calc(10px+env(safe-area-inset-top))] z-[4] flex items-center justify-end gap-3 border-0 bg-transparent p-0">
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
            <PanelLeftIcon />
          </button>
          <button id="fullscreenPreview" className={`${previewActionButtonClassName} hidden`} aria-label="Fullscreen" title="Fullscreen" onClick={toggleFullscreen}>
            <MaximizeIcon />
          </button>
          <button id="closePreview" className={previewActionButtonClassName} aria-label="Close" title="Close" onClick={closePreview}>
            <XIcon />
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
