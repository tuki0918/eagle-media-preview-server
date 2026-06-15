import { useEffect, useSyncExternalStore } from "react";
import { LoginView } from "./components/LoginView";
import { ViewerShellLayout } from "./components/ViewerShellLayout";
import { handleUrlPop } from "./shellActions";
import { getShellView, subscribeShellView } from "./shellVisibility";

export function ViewerAppShell() {
  const shellView = useSyncExternalStore(subscribeShellView, getShellView, getShellView);

  useEffect(() => {
    window.addEventListener("popstate", handleUrlPop);
    return () => window.removeEventListener("popstate", handleUrlPop);
  }, []);

  return (
    <>
      <LoginView hidden={shellView !== "login"} />
      <ViewerShellLayout hidden={shellView !== "viewer"} />
    </>
  );
}

export { CardTemplate } from "./components/CardTemplate";
export { FolderOptions } from "./components/FolderOptions";
export { LibraryFooter } from "./components/LibraryFooter";
export { ConnectButton, ConnectMessage, LoginView } from "./components/LoginView";
export { PageButtons } from "./components/PageButtons";
export { Pager } from "./components/Pager";
export { PreviewBody } from "./components/PreviewBody";
export { PreviewDialog } from "./components/PreviewDialog";
export { PreviewActions, PreviewDetailsPanel } from "./components/PreviewInfo";
export { PreviewMeta, PreviewOriginalName } from "./components/PreviewText";
export { RatingStars } from "./components/RatingStars";
export { ResultList } from "./components/ResultList";
export { ResultSurface } from "./components/ResultSurface";
export { ResultStateView } from "./components/ResultState";
export { ResultsStatus } from "./components/ResultsStatus";
export { AdvancedFilters, SearchControls, SearchInput } from "./components/SearchControls";
export { TagChips } from "./components/TagChips";
export { TagSuggestions } from "./components/TagSuggestions";
export { TilesSentinel } from "./components/TilesSentinel";
export { ViewerShellLayout } from "./components/ViewerShellLayout";
