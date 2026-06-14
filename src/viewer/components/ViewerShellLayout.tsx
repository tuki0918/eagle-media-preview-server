import { CardTemplate } from "./CardTemplate";
import { Pager } from "./Pager";
import { PreviewDialog } from "./PreviewDialog";
import { ResultsStatus } from "./ResultsStatus";
import { SearchControls } from "./SearchControls";

export function ViewerShellLayout() {
  return (
    <div id="viewerShell" hidden>
      <main>
        <SearchControls />
        <div id="resultsStatusHost">
          <ResultsStatus />
        </div>
        <section id="grid" className="media-grid" aria-label="Eagle assets" />
        <div id="tilesSentinel" className="tiles-sentinel mt-3 grid min-h-[52px] place-items-center text-[13px] font-[680] text-app-muted" hidden>
          Loading more
        </div>
        <Pager />
        <p id="libraryFooterName" className="library-footer-name mt-2 text-center text-xs leading-[1.4] text-app-muted">
          Connecting to Eagle
        </p>
      </main>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}
