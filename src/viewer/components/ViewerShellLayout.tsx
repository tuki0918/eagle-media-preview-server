import { useCallback, useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SIDEBAR_OPEN_STORAGE_KEY, UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "../constants";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";
import { getResultsStatusState, subscribeResultsStatusState } from "../resultsStatusState";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { getZoomLevel, gridColumnWidth, subscribeZoomLevel, tileRowHeight } from "../zoomState";
import { AccountSideMenu } from "./AccountSideMenu";
import { CardTemplate } from "./CardTemplate";
import { Pager } from "./Pager";
import { PreviewDialog } from "./PreviewDialog";
import { ResultSurface } from "./ResultSurface";
import { SearchControls, SearchFiltersButton } from "./SearchControls";
import { TilesSentinel } from "./TilesSentinel";
import { ViewerDock } from "./ViewerDock";

interface ViewerShellLayoutProps {
  hidden?: boolean;
}

const SIDEBAR_INITIAL_WIDTH = 14 * 16;
const SIDEBAR_MIN_WIDTH = 12 * 16;
const SIDEBAR_MAX_WIDTH = 22 * 16;
const HEADER_REVEAL_OFFSET = 64;
const HEADER_SCROLL_THRESHOLD = 8;

export function ViewerShellLayout({ hidden = true }: ViewerShellLayoutProps) {
  const searchState = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const [sidebarOpen, setSidebarOpenState] = useState(readSavedSidebarOpen);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_INITIAL_WIDTH);
  const resultsStatus = useSyncExternalStore(subscribeResultsStatusState, getResultsStatusState, getResultsStatusState);
  const zoomLevel = useSyncExternalStore(subscribeZoomLevel, getZoomLevel, getZoomLevel);
  const contentStyle = {
    "--grid-col-w": `${gridColumnWidth(zoomLevel)}px`,
    "--tile-h": `${tileRowHeight(zoomLevel)}px`,
  } as CSSProperties;
  const libraryName = useSyncExternalStore(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName);
  const headerHidden = useHeaderHiddenOnScroll();
  const folderName = selectedFolderName(
    searchState.selectedFolderId,
    searchState.folders,
    searchState.selectedSmartFolderId,
    searchState.smartFolders,
    libraryNameFromFooter(libraryName),
  );
  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    writeSavedSidebarOpen(open);
  }, []);

  return (
    <div id="viewerShell" hidden={hidden}>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        sidebarWidth={sidebarWidth}
        sidebarWidthMin={SIDEBAR_MIN_WIDTH}
        sidebarWidthMax={SIDEBAR_MAX_WIDTH}
        onSidebarWidthChange={setSidebarWidth}
      >
        <AccountSideMenu />
        <SidebarInset className="min-w-0 bg-background">
          <header className={`sticky top-0 z-10 grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 bg-[color-mix(in_srgb,var(--background)_82%,transparent)] px-3 backdrop-blur-xl transition-transform duration-200 ease-out min-[720px]:h-[72px] min-[720px]:px-5 ${headerHidden ? "-translate-y-full" : "translate-y-0"}`}>
            <div className="flex min-w-0 items-center">
              <SidebarTrigger
                id="accountMenuButton"
                className="icon-button size-9 rounded-full text-muted-foreground hover:text-foreground"
                aria-controls="accountSideMenu"
              />
            </div>
            <button
              type="button"
              className="flex min-w-0 max-w-[60vw] items-center justify-center gap-2 border-0 bg-transparent p-0 text-inherit focus-visible:shadow-none"
              title="Scroll to top"
              onClick={scrollToTop}
            >
              <h1 className="m-0 min-w-0 truncate text-[13px] font-semibold uppercase leading-none tracking-[0.08em] text-foreground min-[720px]:text-sm">
                {folderName}
              </h1>
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-[3px] text-[11px] font-semibold leading-none text-muted-foreground [font-variant-numeric:tabular-nums]"
                aria-live="polite"
                aria-label={`${resultsStatus.total.toLocaleString()} ${resultsStatus.total === 1 ? "item" : "items"}`}
                title={`${resultsStatus.total.toLocaleString()} ${resultsStatus.total === 1 ? "item" : "items"}`}
              >
                {resultsStatus.total.toLocaleString()}
              </span>
            </button>
            <div className="flex min-w-0 items-center justify-end">
              <SearchFiltersButton filtersOpen={searchState.filtersOpen} />
            </div>
          </header>
          <div className="flex w-full flex-col gap-3 px-2 pb-28 pt-1 min-[720px]:px-6 min-[720px]:pt-2" style={contentStyle}>
            <SearchControls />
            <ResultSurface />
            <TilesSentinel />
            <Pager />
          </div>
          <ViewerDock />
        </SidebarInset>
      </SidebarProvider>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}

function selectedFolderName(
  selectedFolderId: string,
  folders: readonly { id: string; name: string }[],
  selectedSmartFolderId: string,
  smartFolders: readonly { id: string; name: string }[],
  libraryName = "",
) {
  if (selectedSmartFolderId) return smartFolders.find((folder) => folder.id === selectedSmartFolderId)?.name || "Smart Folder";
  if (!selectedFolderId) return libraryName || "All";
  if (selectedFolderId === UNCATEGORIZED_FOLDER_ID) return "Uncategorized";
  if (selectedFolderId === UNTAGGED_FOLDER_ID) return "Untagged";
  return folders.find((folder) => folder.id === selectedFolderId)?.name || "All";
}

function useHeaderHiddenOnScroll() {
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      if (y < HEADER_REVEAL_OFFSET) {
        setHeaderHidden(false);
        lastY = y;
      } else if (Math.abs(delta) > HEADER_SCROLL_THRESHOLD) {
        setHeaderHidden(delta > 0);
        lastY = y;
      }
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return headerHidden;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function libraryNameFromFooter(footerName: string) {
  return footerName.match(/^(.*?)\s+-\s+Eagle\s+.+$/)?.[1] || "";
}

function readSavedSidebarOpen() {
  try {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    if (saved === "false") return false;
    if (saved === "true") return true;
  } catch {
    // Keep the default when storage is unavailable.
  }
  return true;
}

function writeSavedSidebarOpen(open: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Ignore unavailable storage; the in-memory sidebar state still updates.
  }
}
