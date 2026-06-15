import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  closePreview,
  handlePreviewClose,
  handlePreviewDoubleClick,
  handlePreviewPointerDown,
  toggleFullscreen,
  togglePreviewInfo,
} from "../shellActions";
import { getPreviewDialogState, subscribePreviewDialogState } from "../previewDialogState";
import { PreviewMeta, PreviewOriginalName } from "./PreviewText";

export function PreviewDialog() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const previewDialogState = useSyncExternalStore(subscribePreviewDialogState, getPreviewDialogState, getPreviewDialogState);
  const dialogClassName = [
    "h-dvh max-h-dvh w-screen max-w-full rounded-none border-0 bg-app-surface p-0 text-app-text",
    previewDialogState.mode ? `${previewDialogState.mode}-mode` : "",
    previewDialogState.infoOpen ? "info-open" : "",
  ].filter(Boolean).join(" ");

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
        <button id="backPreview" className="text-icon-button inline-flex min-h-10 items-center gap-2 border-0 bg-transparent px-2 text-sm font-[680] text-app-text" type="button" aria-label="Back to results" onClick={closePreview}>
          <span data-lucide="chevron-left" />
          <span>Back to Results</span>
        </button>
        <div>
          <strong>Media Preview Server</strong>
          <span id="previewMetaHost">
            <PreviewMeta />
          </span>
        </div>
        <div className="dialog-actions flex items-center justify-end gap-2">
          <button id="toggleInfoPreview" className="icon-button inline-grid min-h-10 w-10 flex-[0_0_40px] place-items-center rounded-app border border-app-border bg-app-surface text-app-text" aria-label="Media information" aria-expanded={previewDialogState.infoOpen} title="Media information" onClick={togglePreviewInfo}>
            <span data-lucide="panel-left" />
          </button>
          <button id="fullscreenPreview" className="icon-button inline-grid min-h-10 w-10 flex-[0_0_40px] place-items-center rounded-app border border-app-border bg-app-surface text-app-text" aria-label="Fullscreen" title="Fullscreen" onClick={toggleFullscreen}>
            <span data-lucide="maximize" />
          </button>
          <button id="closePreview" className="icon-button inline-grid min-h-10 w-10 flex-[0_0_40px] place-items-center rounded-app border border-app-border bg-app-surface text-app-text" aria-label="Close" title="Close" onClick={closePreview}>
            <span data-lucide="x" />
          </button>
        </div>
      </div>
      <div className="preview-layout relative grid h-full max-h-full grid-cols-[minmax(0,1fr)] overflow-hidden">
        <div id="previewBody" className="preview-body relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[#f8fafc] p-0" />
        <aside
          className="preview-info absolute inset-y-0 left-0 z-[3] grid max-w-full content-start gap-3.5 overflow-auto border-0 border-r border-app-border bg-[rgba(255,255,255,0.96)] p-3.5 shadow-[18px_0_44px_rgba(15,23,42,0.14)] backdrop-blur-[18px]"
          aria-label="Media info"
        >
          <section className="preview-original-name-section grid min-h-8 grid-cols-[minmax(0,1fr)] items-center border-b border-[rgba(148,163,184,0.18)] px-2 pb-3.5 pt-2">
            <div id="previewOriginalNameHost">
              <PreviewOriginalName />
            </div>
          </section>
          <section className="preview-rating-section grid min-h-8 grid-cols-[minmax(96px,112px)_minmax(0,1fr)] items-center gap-[18px] px-2">
            <span className="info-label text-xs font-normal text-app-muted">Rating</span>
            <div id="previewRating" className="rating-control inline-flex items-center gap-px" aria-label="Rating" />
          </section>
          <div id="previewDetails" className="preview-details grid gap-2.5" />
          <div id="previewActions" className="preview-info-actions border-t border-[rgba(148,163,184,0.22)] px-2 pt-3" />
        </aside>
      </div>
    </dialog>
  );
}
