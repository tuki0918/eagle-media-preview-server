import { useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import iconOnUrl from "../../assets/icon_on.svg";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { submitLogout } from "../shellActions";
import { PanelLeftIcon, XIcon } from "./Icons";

export function AccountSideMenu() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = useSyncExternalStore(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName);
  const loginState = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const username = loginState.user?.username?.trim();
  const roleLabel = authRoleLabel(loginState.user?.role);
  const roleDescription = authRoleDescription(loginState.user?.role);
  const accountLabel = [username, roleLabel].filter(Boolean).join(" - ");
  const accountStatusLabel = [accountLabel, roleDescription].filter(Boolean).join(". ");
  const authError = loginState.isError ? loginState.message.trim() : "";

  if (!loginState.authRequired || !loginState.authenticated) return null;

  return (
    <>
      <Button
        id="accountMenuButton"
        className="fixed left-3 top-[calc(12px+env(safe-area-inset-top))] z-30 size-10 rounded-full bg-white text-app-text shadow-app-soft min-[720px]:hidden"
        variant="outline"
        size="icon-lg"
        type="button"
        aria-controls="accountSideMenu"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Close account menu" : "Open account menu"}
        onClick={() => setMobileOpen((current) => !current)}
      >
        {mobileOpen ? <XIcon /> : <PanelLeftIcon />}
      </Button>
      <button
        className={`fixed inset-0 z-20 bg-[rgba(2,6,23,0.24)] backdrop-blur-[2px] transition-opacity min-[720px]:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        type="button"
        aria-label="Close account menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        id="accountSideMenu"
        className={`fixed left-0 top-0 z-20 flex h-dvh w-[236px] flex-col border-r border-app-border bg-[rgba(255,255,255,0.96)] px-3 pb-4 pt-[calc(68px+env(safe-area-inset-top))] shadow-app backdrop-blur-xl transition-transform duration-200 min-[720px]:z-10 min-[720px]:w-[72px] min-[720px]:translate-x-0 min-[720px]:px-2 min-[720px]:pt-[calc(18px+env(safe-area-inset-top))] min-[720px]:shadow-none min-[1180px]:w-[224px] min-[1180px]:px-3 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Account menu"
      >
        <div className="flex min-h-10 items-center gap-2 px-1 min-[720px]:justify-center min-[1180px]:justify-start">
          <img className="h-9 w-9 rounded-xl object-cover shadow-[0_10px_20px_rgba(20,99,243,0.18)]" src={iconOnUrl} alt="" aria-hidden="true" />
          <div className="min-w-0 min-[720px]:hidden min-[1180px]:block">
            <p className="m-0 truncate text-sm font-[720] leading-tight text-app-text">Media Preview</p>
            <p className="m-0 truncate text-[11px] leading-tight text-app-muted">{displayName}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <Card
            id="authAccountLabel"
            className="grid gap-2 rounded-lg border-app-border bg-app-surface-strong p-2 py-2 shadow-none min-[720px]:place-items-center min-[720px]:border-transparent min-[720px]:bg-transparent min-[1180px]:place-items-stretch min-[1180px]:border-app-border min-[1180px]:bg-app-surface-strong"
            aria-label={accountStatusLabel || accountLabel}
            title={roleDescription || undefined}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-app-accent-soft text-sm font-[760] text-app-accent" aria-hidden="true">
              {accountInitial(username)}
            </span>
            <span className="min-w-0 min-[720px]:hidden min-[1180px]:block">
              {username ? <span id="authUserLabel" className="block truncate text-sm font-[650] text-app-text">{username}</span> : null}
              {roleLabel ? <Badge id="authRoleLabel" variant="outline" className="mt-1 rounded-full bg-white text-[11px] font-medium text-app-text-soft">{roleLabel}</Badge> : null}
            </span>
          </Card>
          <Button
            id="logoutButton"
            className="h-10 rounded-lg px-3 text-sm font-[650] min-[720px]:px-0 min-[1180px]:justify-start min-[1180px]:px-3"
            variant="outline"
            type="button"
            disabled={loginState.disabled}
            title="Sign out"
            onClick={submitLogout}
          >
            <SignOutIcon />
            <span className="min-[720px]:hidden min-[1180px]:inline">Sign out</span>
          </Button>
          {authError ? (
            <p id="authFooterMessage" className="m-0 rounded-app border border-red-200 bg-red-50 px-2.5 py-2 text-xs leading-[1.35] text-app-danger min-[720px]:hidden min-[1180px]:block" role="alert">
              {authError}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function SignOutIcon() {
  return (
    <svg className="h-4 w-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M21 3v18" />
    </svg>
  );
}

function accountInitial(username: string | undefined) {
  return (username || "?").slice(0, 1).toUpperCase();
}

function authRoleLabel(role: unknown) {
  if (role === "admin") return "Admin";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "";
}

function authRoleDescription(role: unknown) {
  if (role === "admin") return "Can edit metadata and switch libraries";
  if (role === "editor") return "Can edit ratings, tags, and categories";
  if (role === "viewer") return "Can browse and preview";
  return "";
}
