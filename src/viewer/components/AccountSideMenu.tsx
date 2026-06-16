import { LogOutIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import iconOnUrl from "../../assets/icon_on.svg";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { submitLogout } from "../shellActions";

export function AccountSideMenu() {
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
      <Sidebar
        id="accountSideMenu"
        collapsible="icon"
        className="border-sidebar-border"
        aria-label="Account menu"
      >
        <SidebarHeader className="justify-center p-2 pt-[calc(14px+env(safe-area-inset-top))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="h-12 px-2" tooltip="Media Preview">
                <img className="size-8 rounded-lg object-cover shadow-sm" src={iconOnUrl} alt="" aria-hidden="true" />
                <span className="grid min-w-0 group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-[720] leading-tight text-sidebar-foreground">Media Preview</span>
                  <span className="truncate text-[11px] leading-tight text-muted-foreground">{displayName}</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    id="authAccountLabel"
                    size="lg"
                    className="h-auto min-h-14 items-start py-2"
                    tooltip={accountStatusLabel || accountLabel || "Account"}
                    aria-label={accountStatusLabel || accountLabel}
                    title={roleDescription || undefined}
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-[760] text-secondary-foreground" aria-hidden="true">
                      {accountInitial(username)}
                    </span>
                    <span className="grid min-w-0 gap-1 group-data-[collapsible=icon]:hidden">
                      {username ? <span id="authUserLabel" className="block truncate text-sm font-[650] text-sidebar-foreground">{username}</span> : null}
                      {roleLabel ? <Badge id="authRoleLabel" variant="outline" className="w-fit rounded-full bg-background text-[11px] font-medium text-muted-foreground">{roleLabel}</Badge> : null}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                id="logoutButton"
                type="button"
                disabled={loginState.disabled}
                tooltip="Sign out"
                onClick={submitLogout}
              >
                <LogOutIcon />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {authError ? (
            <p id="authFooterMessage" className="m-0 rounded-md bg-destructive/10 px-2.5 py-2 text-xs leading-[1.35] text-destructive group-data-[collapsible=icon]:hidden" role="alert">
              {authError}
            </p>
          ) : null}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </>
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
