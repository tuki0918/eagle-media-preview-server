import { CardTemplate } from "./CardTemplate";
import { LibraryFooter } from "./LibraryFooter";
import { Pager } from "./Pager";
import { PreviewDialog } from "./PreviewDialog";
import { ResultsStatus } from "./ResultsStatus";
import { SearchControls } from "./SearchControls";
import { TilesSentinel } from "./TilesSentinel";

export function ViewerShellLayout() {
  return (
    <div id="viewerShell" hidden>
      <main>
        <SearchControls />
        <div id="resultsStatusHost">
          <ResultsStatus />
        </div>
        <div id="resultGridHost">
          <section id="grid" className="media-grid" aria-label="Eagle assets" />
        </div>
        <div id="tilesSentinelHost">
          <TilesSentinel />
        </div>
        <div id="pagerHost">
          <Pager />
        </div>
        <div id="libraryFooterNameHost">
          <LibraryFooter />
        </div>
      </main>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}
