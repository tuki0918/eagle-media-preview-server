import { useSyncExternalStore } from "react";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { submitLogout } from "../shellActions";

interface LibraryFooterProps {
  name?: string;
}

export function LibraryFooter({ name }: LibraryFooterProps) {
  const storedName = useSyncExternalStore(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName);
  const loginState = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const displayName = name ?? storedName;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs leading-[1.4] text-app-muted">
      <p id="libraryFooterName" className="library-footer-name text-center">
        {displayName}
      </p>
      {loginState.authRequired && loginState.authenticated ? (
        <button
          id="logoutButton"
          className="text-app-accent hover:text-app-accent-strong disabled:text-app-muted"
          type="button"
          disabled={loginState.disabled}
          onClick={submitLogout}
        >
          Sign out
        </button>
      ) : null}
    </div>
  );
}
