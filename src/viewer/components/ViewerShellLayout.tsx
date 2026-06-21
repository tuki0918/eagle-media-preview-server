import { useCallback, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SIDEBAR_OPEN_STORAGE_KEY, UNCATEGORIZED_FOLDER_ID } from "../constants";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { AccountSideMenu } from "./AccountSideMenu";
import { CardTemplate } from "./CardTemplate";
import { Pager } from "./Pager";
import { PreviewDialog } from "./PreviewDialog";
import { ResultSurface } from "./ResultSurface";
import { ResultsStatus } from "./ResultsStatus";
import { SearchControls, SearchFiltersButton } from "./SearchControls";
import { TilesSentinel } from "./TilesSentinel";

interface ViewerShellLayoutProps {
  hidden?: boolean;
}

export function ViewerShellLayout({ hidden = true }: ViewerShellLayoutProps) {
  const searchState = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const [sidebarOpen, setSidebarOpenState] = useState(readSavedSidebarOpen);
  const folderName = selectedFolderName(
    searchState.selectedFolderId,
    searchState.folders,
    searchState.selectedSmartFolderId,
    searchState.smartFolders,
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
        style={{
          "--sidebar-width": "14rem",
          "--sidebar-width-icon": "3rem",
        } as CSSProperties}
      >
        <AccountSideMenu />
        <SidebarInset className="min-w-0 md:!m-1 md:!ml-0">
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 bg-background px-2 min-[720px]:h-14 min-[720px]:px-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger
                id="accountMenuButton"
                className="icon-button size-9 rounded-lg"
                aria-controls="accountSideMenu"
              />
              <Separator
                orientation="vertical"
                className="mr-2 h-4 w-0 border-l border-border bg-transparent data-[orientation=vertical]:h-4 data-[orientation=vertical]:w-0"
              />
              <span className="truncate text-sm font-normal text-foreground min-[720px]:text-base">
                {folderName}
              </span>
            </div>
            <SearchFiltersButton filtersOpen={searchState.filtersOpen} />
          </header>
          <div className="flex w-full flex-col gap-2 px-2 pb-3 pt-1 min-[720px]:px-3">
            <SearchControls />
            <ResultsStatus />
            <ResultSurface />
            <TilesSentinel />
            <Pager />
          </div>
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
) {
  if (selectedSmartFolderId) return smartFolders.find((folder) => folder.id === selectedSmartFolderId)?.name || "Smart Folder";
  if (!selectedFolderId) return "All";
  if (selectedFolderId === UNCATEGORIZED_FOLDER_ID) return "Uncategorized";
  return folders.find((folder) => folder.id === selectedFolderId)?.name || "All";
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
