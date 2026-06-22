import {
  BookOpenTextIcon,
  ChevronsUpDownIcon,
  FolderCogIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  LayoutGridIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UNCATEGORIZED_FOLDER_ID } from "../constants";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { changeFolder, changeSmartFolder, submitLogout } from "../shellActions";
import { getThemeState, setThemePreference, subscribeThemeState, type ThemePreference } from "../themeState";
import type { EagleFolder, EagleSmartFolder } from "../types";

export function AccountSideMenu() {
  const displayName = useSyncExternalStore(subscribeLibraryFooterName, getLibraryFooterName, getLibraryFooterName);
  const libraryHeader = libraryHeaderLabels(displayName);
  const loginState = useSyncExternalStore(subscribeLoginConnectState, getLoginConnectState, getLoginConnectState);
  const searchState = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const username = loginState.user?.username?.trim();
  const roleLabel = authRoleLabel(loginState.user?.role);
  const roleDescription = authRoleDescription(loginState.user?.role);
  const accountLabel = [username, roleLabel].filter(Boolean).join(" - ");
  const accountStatusLabel = [accountLabel, roleDescription].filter(Boolean).join(". ");
  const authError = loginState.isError ? loginState.message.trim() : "";

  return (
    <>
      <Sidebar
        id="accountSideMenu"
        variant="inset"
        collapsible="offcanvas"
        className="border-sidebar-border"
        aria-label="Account menu"
      >
        <SidebarHeader className="justify-center p-2 pt-[calc(14px+env(safe-area-inset-top))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="pointer-events-none h-12 px-2 hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground"
              >
                <div>
                  <Avatar className="size-8 rounded-lg" aria-hidden="true">
                    <AvatarFallback className="rounded-lg">
                      <BookOpenTextIcon className="size-5" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-[720] leading-tight text-sidebar-foreground">{libraryHeader.name}</span>
                    {libraryHeader.version ? (
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">{libraryHeader.version}</span>
                    ) : null}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <SmartFolderSideNav
              selectedSmartFolderId={searchState.selectedSmartFolderId}
              smartFolders={searchState.smartFolders}
            />
            <FolderSideNav
              allFoldersTotal={searchState.allFoldersTotal}
              folders={searchState.folders}
              selectedFolderId={searchState.selectedFolderId}
              selectedSmartFolderId={searchState.selectedSmartFolderId}
            />
          </div>
          <ThemeSideNav />
        </SidebarContent>

        {loginState.authRequired && loginState.authenticated ? (
          <SidebarFooter className="p-2">
            <AccountDropdown
              disabled={loginState.disabled}
              roleDescription={roleDescription}
              roleLabel={roleLabel}
              statusLabel={accountStatusLabel || accountLabel || "Account"}
              username={username}
            />
            {authError ? (
              <p id="authFooterMessage" className="m-0 rounded-md bg-destructive/10 px-2.5 py-2 text-xs leading-[1.35] text-destructive group-data-[collapsible=icon]:hidden" role="alert">
                {authError}
              </p>
            ) : null}
          </SidebarFooter>
        ) : null}
        <SidebarRail />
      </Sidebar>
    </>
  );
}

function libraryHeaderLabels(displayName: string) {
  const match = displayName.match(/^(.*?)\s+-\s+(Eagle\s+.+)$/);
  if (!match) return { name: displayName, version: "" };
  return { name: match[1], version: match[2] };
}

function FolderSideNav({
  allFoldersTotal,
  folders,
  selectedFolderId,
  selectedSmartFolderId,
}: {
  allFoldersTotal: number;
  folders: readonly EagleFolder[];
  selectedFolderId: string;
  selectedSmartFolderId: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  const selectFolder = (folderId: string) => {
    changeFolder({ currentTarget: { value: folderId } });
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup className="shrink-0 px-2 pb-2 pt-1">
      <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-normal">
        Folders
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5" aria-label="Folder tree">
          <FolderNavItem
            active={!selectedFolderId && !selectedSmartFolderId}
            count={allFoldersTotal}
            depth={0}
            icon="open"
            label="All folders"
            onSelect={() => selectFolder("")}
          />
          <FolderNavItem
            active={selectedFolderId === UNCATEGORIZED_FOLDER_ID}
            depth={0}
            icon="inbox"
            label="Uncategorized"
            onSelect={() => selectFolder(UNCATEGORIZED_FOLDER_ID)}
          />
          {folders.map((folder) => (
            <FolderNavItem
              key={folder.id}
              active={selectedFolderId === folder.id}
              count={folder.imageCount}
              depth={folder.depth || 0}
              icon={selectedFolderId === folder.id ? "open" : "folder"}
              label={folder.name}
              onSelect={() => selectFolder(folder.id)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SmartFolderSideNav({
  selectedSmartFolderId,
  smartFolders,
}: {
  selectedSmartFolderId: string;
  smartFolders: readonly EagleSmartFolder[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  if (!smartFolders.length) return null;

  const selectSmartFolder = (smartFolderId: string) => {
    changeSmartFolder({ currentTarget: { value: smartFolderId } });
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup className="shrink-0 px-2 pb-1 pt-1">
      <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-normal">
        Smart Folders
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5" aria-label="Smart folder tree">
          {smartFolders.map((folder) => (
            <FolderNavItem
              key={folder.id}
              active={selectedSmartFolderId === folder.id}
              count={folder.imageCount}
              depth={folder.depth || 0}
              icon={isSmartFolderGroup(folder) ? "smartGroup" : "smart"}
              label={folder.name}
              onSelect={() => selectSmartFolder(folder.id)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function isSmartFolderGroup(folder: EagleSmartFolder) {
  return folder.icon === "grid";
}

function ThemeSideNav() {
  const themeState = useSyncExternalStore(subscribeThemeState, getThemeState, getThemeState);
  const themeOptions: { icon: typeof SunIcon; label: string; value: ThemePreference }[] = [
    { icon: SunIcon, label: "Light", value: "light" },
    { icon: MoonIcon, label: "Dark", value: "dark" },
  ];

  return (
    <SidebarGroup className="shrink-0 px-2 pb-2 pt-1">
      <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-normal">
        Theme
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <Tabs
          id="themeModeGroup"
          value={themeState.preference}
          className="w-full group-data-[collapsible=icon]:hidden"
          aria-label="Theme color"
          onValueChange={(value) => {
            setThemePreference(value as ThemePreference);
          }}
        >
          <TabsList className="grid w-full grid-cols-2 rounded-lg bg-muted shadow-none" aria-label="Theme color">
            {themeOptions.map(({ icon: Icon, label, value }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-[30px] rounded-md px-[9px] text-xs font-[680] text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:hover:text-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm data-active:hover:text-foreground"
                aria-label={label}
                title={label}
              >
                <Icon data-icon="inline-start" aria-hidden="true" />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function FolderNavItem({
  active,
  count,
  depth,
  icon,
  label,
  onSelect,
}: {
  active: boolean;
  count?: number;
  depth: number;
  icon: "folder" | "inbox" | "open" | "smart" | "smartGroup";
  label: string;
  onSelect: () => void;
}) {
  const Icon = folderNavIcon(icon);
  const safeDepth = Math.max(0, Math.min(depth, 8));
  const displayCount = displayFolderCount(count);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="h-8 gap-2 text-[13px] font-normal data-active:bg-transparent data-active:font-[650] data-active:text-sidebar-foreground group-data-[collapsible=icon]:!pl-2"
        isActive={active}
        style={{ paddingLeft: `calc(0.5rem + ${safeDepth} * 0.875rem)` }}
        tooltip={label}
        type="button"
        aria-current={active ? "page" : undefined}
        title={label}
        onClick={onSelect}
      >
        <Icon className={active ? "text-sidebar-primary" : "text-muted-foreground"} aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
        {displayCount === undefined ? null : (
          <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground [font-variant-numeric:tabular-nums] group-data-[collapsible=icon]:hidden">
            {displayCount.toLocaleString()}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function displayFolderCount(count: number | undefined) {
  if (count === undefined) return undefined;
  const normalized = Number(count);
  if (!Number.isFinite(normalized) || normalized <= 0) return undefined;
  return normalized;
}

function folderNavIcon(icon: "folder" | "inbox" | "open" | "smart" | "smartGroup") {
  if (icon === "inbox") return InboxIcon;
  if (icon === "open") return FolderOpenIcon;
  if (icon === "smart") return FolderCogIcon;
  if (icon === "smartGroup") return LayoutGridIcon;
  return FolderIcon;
}

function AccountDropdown({
  disabled,
  roleDescription,
  roleLabel,
  statusLabel,
  username,
}: {
  disabled: boolean;
  roleDescription: string;
  roleLabel: string;
  statusLabel: string;
  username: string | undefined;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayUsername = username || "Account";
  const displayRole = roleLabel || "Signed in";

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <SidebarMenu>
      <SidebarMenuItem ref={containerRef}>
        <SidebarMenuButton
          id="authAccountLabel"
          size="lg"
          className="h-14 aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
          tooltip={statusLabel}
          aria-label={statusLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="authAccountMenu"
          title={roleDescription || undefined}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback id="authAvatarFallback" className="rounded-lg">
              <UserRoundIcon className="size-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span id="authUserLabel" className="truncate font-medium">
              {displayUsername}
            </span>
            <span id="authRoleLabel" className="truncate text-xs text-muted-foreground">
              {displayRole}
            </span>
          </span>
          <ChevronsUpDownIcon className="ml-auto" aria-hidden="true" />
        </SidebarMenuButton>

        {open ? (
          <div
            ref={menuRef}
            id="authAccountMenu"
            role="menu"
            aria-labelledby="authAccountLabel"
            className={
              isMobile
                ? "absolute bottom-full left-0 right-0 z-50 mb-2 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                : "absolute bottom-0 left-full z-50 ml-2 w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  <UserRoundIcon className="size-4" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayUsername}</span>
                <span className="truncate text-xs text-muted-foreground">{displayRole}</span>
              </div>
            </div>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              id="logoutButton"
              type="button"
              role="menuitem"
              className="relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                setOpen(false);
                if (isMobile) setOpenMobile(false);
                submitLogout();
              }}
            >
              <LogOutIcon />
              <span>Sign out</span>
            </button>
          </div>
        ) : null}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function authRoleLabel(role: unknown) {
  if (role === "admin") return "Admin";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return "";
}

function authRoleDescription(role: unknown) {
  if (role === "admin") return "Full access to available management actions";
  if (role === "editor") return "Can edit ratings, tags, and categories";
  if (role === "viewer") return "Can browse and preview";
  return "";
}
