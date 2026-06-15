import { CardTemplate } from "./CardTemplate";
import { LibraryFooter } from "./LibraryFooter";
import { Pager } from "./Pager";
import { PreviewDialog } from "./PreviewDialog";
import { ResultSurface } from "./ResultSurface";
import { ResultsStatus } from "./ResultsStatus";
import { SearchControls } from "./SearchControls";
import { TilesSentinel } from "./TilesSentinel";

interface ViewerShellLayoutProps {
  hidden?: boolean;
}

export function ViewerShellLayout({ hidden = true }: ViewerShellLayoutProps) {
  return (
    <div id="viewerShell" hidden={hidden}>
      <main className="mx-auto w-[min(1180px,100%)] px-3 py-[30px] min-[720px]:px-5 min-[1180px]:px-0">
        <SearchControls />
        <ResultsStatus />
        <ResultSurface />
        <TilesSentinel />
        <Pager />
        <LibraryFooter />
      </main>
      <PreviewDialog />
      <CardTemplate />
    </div>
  );
}
