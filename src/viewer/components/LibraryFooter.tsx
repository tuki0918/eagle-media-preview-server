import { useSyncExternalStore } from "react";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";

interface LibraryFooterProps {
  name?: string;
}

export function LibraryFooter({ name }: LibraryFooterProps) {
  const storedName = useSyncExternalStore(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName);
  const displayName = name ?? storedName;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs leading-[1.4] text-muted-foreground">
      <p id="libraryFooterName" className="library-footer-name text-center">
        {displayName}
      </p>
    </div>
  );
}
