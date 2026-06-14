import { shellClasses } from "../shellClasses";
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
        <ResultsStatus />
        <section id="grid" className="media-grid" aria-label="Eagle assets" />
        <div id="tilesSentinel" className={shellClasses.tilesSentinel} hidden>
          Loading more
        </div>
        <Pager />
        <p id="libraryFooterName" className={shellClasses.libraryFooterName}>
          Connecting to Eagle
        </p>
      </main>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}
