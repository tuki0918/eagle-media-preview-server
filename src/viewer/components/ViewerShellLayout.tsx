import { AccountSideMenu } from "./AccountSideMenu";
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
      <AccountSideMenu />
      <main className="mx-auto w-[min(1180px,100%)] px-3 py-[30px] min-[720px]:pl-[92px] min-[720px]:pr-5 min-[1180px]:pl-[236px] min-[1180px]:pr-6 min-[1440px]:pl-0 min-[1440px]:pr-0">
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
