import { useSyncExternalStore } from "react";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";

interface LibraryFooterProps {
  name?: string;
}

export function LibraryFooter({ name }: LibraryFooterProps) {
  const storedName = useSyncExternalStore(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName);
  const displayName = name ?? storedName;
  return (
    <p id="libraryFooterName" className="library-footer-name mt-2 text-center text-xs leading-[1.4] text-app-muted">
      {displayName}
    </p>
  );
}
