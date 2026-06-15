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
  const username = loginState.user?.username?.trim();
  const roleLabel = authRoleLabel(loginState.user?.role);
  const authError = loginState.isError ? loginState.message.trim() : "";
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs leading-[1.4] text-app-muted">
      <p id="libraryFooterName" className="library-footer-name text-center">
        {displayName}
      </p>
      {loginState.authRequired && loginState.authenticated ? (
        <span className="inline-flex items-center gap-2">
          {username ? <span id="authUserLabel" className="text-app-muted">{username}</span> : null}
          {roleLabel ? <span id="authRoleLabel" className="rounded-full border border-app-border bg-app-surface px-2 py-0.5 text-[11px] font-medium text-app-text-soft">{roleLabel}</span> : null}
          <button
            id="logoutButton"
            className="text-app-accent hover:text-app-accent-strong disabled:text-app-muted"
            type="button"
            disabled={loginState.disabled}
            onClick={submitLogout}
          >
            Sign out
          </button>
          {authError ? <span id="authFooterMessage" className="text-app-danger" role="alert">{authError}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

function authRoleLabel(role: unknown) {
  if (role === "admin") return "Admin";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "";
}
