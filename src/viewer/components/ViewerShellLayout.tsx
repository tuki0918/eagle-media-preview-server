import { CardTemplate } from "./CardTemplate";
import { LibraryFooter } from "./LibraryFooter";
import { Pager } from "./Pager";
import { PreviewDialog } from "./PreviewDialog";
import { ResultsStatus } from "./ResultsStatus";
import { SearchControls } from "./SearchControls";
import { TilesSentinel } from "./TilesSentinel";

interface ViewerShellLayoutProps {
  hidden?: boolean;
}

export function ViewerShellLayout({ hidden = true }: ViewerShellLayoutProps) {
  return (
    <div id="viewerShell" hidden={hidden}>
      <main className="mx-auto w-[min(1180px,100%)] px-3 py-[30px]">
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
        <LibraryFooter />
      </main>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}
