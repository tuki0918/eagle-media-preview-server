import { CheckIcon, DownloadIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "../api";
import { downloadItems, type DownloadProgress } from "../downloads";
import {
  clearSelection,
  getSelectionState,
  setItemsSelected,
  subscribeSelectionState,
} from "../selectionState";
import { getResultSurfaceState, subscribeResultSurfaceState } from "../resultSurfaceState";
import { showErrorToast, showSuccessToast } from "../toasts";

interface DownloadViewState {
  completed: number;
  currentName: string;
  total: number;
}

const idleDownloadState: DownloadViewState = {
  completed: 0,
  currentName: "",
  total: 0,
};

export function BatchDownloadBar() {
  const selection = useSyncExternalStore(subscribeSelectionState, getSelectionState, getSelectionState);
  const resultSurface = useSyncExternalStore(subscribeResultSurfaceState, getResultSurfaceState, getResultSurfaceState);
  const [downloadState, setDownloadState] = useState<DownloadViewState>(idleDownloadState);
  const [isDownloading, setIsDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const visibleItems = resultSurface.kind === "list" ? resultSurface.items : [];
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selection.ids.has(String(item.id || "").trim()));

  if (!visibleItems.length && !selection.items.length && !isDownloading) return null;

  const toggleVisibleSelection = () => {
    setItemsSelected(visibleItems, !allVisibleSelected);
  };

  const startDownload = async () => {
    if (isDownloading || !selection.items.length) return;
    const items = [...selection.items];
    const controller = new AbortController();
    abortRef.current = controller;
    setIsDownloading(true);
    setDownloadState({ completed: 0, currentName: "", total: items.length });

    try {
      const result = await downloadItems(items, {
        onProgress: (progress: DownloadProgress) => setDownloadState(progress),
        signal: controller.signal,
      });
      if (result.cancelled) {
        showSuccessToast("Downloads cancelled", {
          description: `${result.downloaded} of ${items.length} files were downloaded.`,
        });
      } else if (result.failures.length) {
        showErrorToast("Some downloads failed", {
          description: `${result.downloaded} of ${items.length} files were downloaded. Try the remaining selected files again.`,
        });
      } else {
        clearSelection();
        showSuccessToast("Downloads started", {
          description: `${result.downloaded} ${result.downloaded === 1 ? "file" : "files"} were sent to your downloads.`,
        });
      }
    } catch (error) {
      showErrorToast("Unable to download files", {
        description: errorMessage(error),
      });
    } finally {
      abortRef.current = null;
      setIsDownloading(false);
      setDownloadState(idleDownloadState);
    }
  };

  const cancelDownload = () => {
    abortRef.current?.abort();
  };

  return (
    <section
      id="batchDownloadBar"
      className="batch-download-bar flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm min-[720px]:px-3"
      aria-label="Batch download"
      aria-busy={isDownloading}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {isDownloading ? <LoaderCircleIcon className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <DownloadIcon className="size-4 shrink-0" aria-hidden="true" />}
        <span className="truncate">
          {isDownloading
            ? `${downloadState.completed}/${downloadState.total} downloaded${downloadState.currentName ? ` · ${downloadState.currentName}` : ""}`
            : selection.items.length
            ? `${selection.items.length} selected`
            : "Select media to download"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!isDownloading && visibleItems.length ? (
          <Button
            id="toggleVisibleSelectionButton"
            className="h-8 px-2.5 text-xs"
            variant="ghost"
            type="button"
            onClick={toggleVisibleSelection}
          >
            {allVisibleSelected ? <XIcon data-icon="inline-start" aria-hidden="true" /> : <CheckIcon data-icon="inline-start" aria-hidden="true" />}
            {allVisibleSelected ? "Clear visible" : "Select visible"}
          </Button>
        ) : null}
        {isDownloading ? (
          <Button id="cancelBatchDownloadButton" className="h-8 px-2.5 text-xs" variant="outline" type="button" onClick={cancelDownload}>
            Cancel
          </Button>
        ) : selection.items.length ? (
          <>
            <Button id="clearSelectionButton" className="h-8 px-2.5 text-xs" variant="ghost" type="button" onClick={clearSelection}>
              Clear
            </Button>
            <Button id="downloadSelectedButton" className="h-8 px-2.5 text-xs" type="button" onClick={() => void startDownload()}>
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              Download {selection.items.length}
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
