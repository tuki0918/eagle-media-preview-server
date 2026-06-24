import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  FolderCogIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  LayoutGridIcon,
  LogOutIcon,
  MoonIcon,
  RouterIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { displayFolderCount } from "../format";
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
                      <RouterIcon className="size-5" />
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
  const { expandedIds, toggleFolder } = useFolderExpansion(folders);

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
          <FolderTreeNavItems
            expandedIds={expandedIds}
            folders={folders}
            iconForFolder={(folder) => selectedFolderId === folder.id ? "open" : "folder"}
            isActive={(folder) => selectedFolderId === folder.id}
            onSelect={selectFolder}
            onToggle={toggleFolder}
          />
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
  const { expandedIds, toggleFolder } = useFolderExpansion(smartFolders);

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
          <FolderTreeNavItems
            expandedIds={expandedIds}
            folders={smartFolders}
            iconForFolder={(folder) => isSmartFolderGroup(folder as EagleSmartFolder) ? "smartGroup" : "smart"}
            isActive={(folder) => selectedSmartFolderId === folder.id}
            onSelect={selectSmartFolder}
            onToggle={toggleFolder}
          />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function isSmartFolderGroup(folder: EagleSmartFolder) {
  return folder.icon === "grid";
}

type FolderNavIconName = "folder" | "inbox" | "open" | "smart" | "smartGroup";

function FolderTreeNavItems({
  expandedIds,
  folders,
  iconForFolder,
  isActive,
  onSelect,
  onToggle,
}: {
  expandedIds: Readonly<Record<string, boolean>>;
  folders: readonly EagleFolder[];
  iconForFolder: (folder: EagleFolder) => FolderNavIconName;
  isActive: (folder: EagleFolder) => boolean;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
}) {
  return (
    <>
      {folders.map((folder, index) => {
        const children = Array.isArray(folder.children) ? folder.children : [];
        const isExpanded = Boolean(expandedIds[folder.id]);
        const isLastChild = index === folders.length - 1;
        return (
          <Fragment key={folder.id}>
            <FolderNavItem
              active={isActive(folder)}
              count={folder.imageCount}
              depth={folder.depth || 0}
              expanded={children.length ? isExpanded : undefined}
              icon={iconForFolder(folder)}
              isLastChild={isLastChild}
              label={folder.name}
              onSelect={() => onSelect(folder.id)}
              onToggle={children.length ? () => onToggle(folder.id) : undefined}
            />
            {children.length && isExpanded ? (
              <FolderTreeNavItems
                expandedIds={expandedIds}
                folders={children}
                iconForFolder={iconForFolder}
                isActive={isActive}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

function useFolderExpansion(folders: readonly EagleFolder[]) {
  const signature = folderExpansionSignature(folders);
  const signatureRef = useRef("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => initialFolderExpansion(folders));

  useEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    setExpandedIds(initialFolderExpansion(folders));
  }, [folders, signature]);

  return {
    expandedIds,
    toggleFolder(folderId: string) {
      setExpandedIds((current) => ({ ...current, [folderId]: !current[folderId] }));
    },
  };
}

function initialFolderExpansion(folders: readonly EagleFolder[]) {
  const expanded: Record<string, boolean> = {};
  collectInitialFolderExpansion(folders, expanded);
  return expanded;
}

function collectInitialFolderExpansion(folders: readonly EagleFolder[], expanded: Record<string, boolean>) {
  for (const folder of folders) {
    const children = Array.isArray(folder.children) ? folder.children : [];
    if (children.length && folder.isExpand === true) expanded[folder.id] = true;
    if (children.length) collectInitialFolderExpansion(children, expanded);
  }
}

function folderExpansionSignature(folders: readonly EagleFolder[]) {
  const parts: string[] = [];
  collectFolderExpansionSignature(folders, parts);
  return parts.join("|");
}

function collectFolderExpansionSignature(folders: readonly EagleFolder[], parts: string[]) {
  for (const folder of folders) {
    const children = Array.isArray(folder.children) ? folder.children : [];
    parts.push(`${folder.id}:${folder.isExpand === true ? "1" : "0"}:${children.length}`);
    if (children.length) collectFolderExpansionSignature(children, parts);
  }
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

const folderTreeDepthClasses = [
  "sidebar-tree-depth-0 pl-0.5",
  "sidebar-tree-depth-1 pl-4",
  "sidebar-tree-depth-2 pl-[1.875rem]",
  "sidebar-tree-depth-3 pl-[2.75rem]",
  "sidebar-tree-depth-4 pl-[3.625rem]",
  "sidebar-tree-depth-5 pl-[4.5rem]",
  "sidebar-tree-depth-6 pl-[5.375rem]",
  "sidebar-tree-depth-7 pl-[6.25rem]",
  "sidebar-tree-depth-8 pl-[7.125rem]",
] as const;

function folderTreeDepthClass(depth: number) {
  return folderTreeDepthClasses[Math.max(0, Math.min(depth, folderTreeDepthClasses.length - 1))];
}

function FolderNavItem({
  active,
  count,
  depth,
  expanded,
  icon,
  isLastChild,
  label,
  onSelect,
  onToggle,
}: {
  active: boolean;
  count?: number;
  depth: number;
  expanded?: boolean;
  icon: FolderNavIconName;
  isLastChild?: boolean;
  label: string;
  onSelect: () => void;
  onToggle?: () => void;
}) {
  const Icon = folderNavIcon(icon);
  const safeDepth = Math.max(0, Math.min(depth, 8));
  const displayCount = displayFolderCount(count);
  const canToggle = onToggle && expanded !== undefined;
  const ToggleIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <SidebarMenuItem>
      <div
        className={[
          "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center group-data-[collapsible=icon]:block",
          folderTreeDepthClass(safeDepth),
        ].join(" ")}
      >
        <div className="relative flex h-8 w-6 shrink-0 items-center justify-center group-data-[collapsible=icon]:hidden">
          {safeDepth > 0 ? (
            <>
              <span
                className={[
                  "sidebar-tree-branch absolute left-1/2 top-0 w-px -translate-x-1/2 bg-sidebar-border",
                  isLastChild ? "sidebar-tree-branch-last h-1/2" : "sidebar-tree-branch-mid bottom-0",
                ].join(" ")}
                aria-hidden="true"
              />
              <span className="sidebar-tree-branch absolute left-1/2 top-1/2 h-px w-3 bg-sidebar-border" aria-hidden="true" />
            </>
          ) : null}
          {canToggle ? (
            <button
              className="relative z-10 flex size-5 items-center justify-center rounded-sm bg-sidebar text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              <ToggleIcon className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <SidebarMenuButton
          className="h-8 min-w-0 gap-2 px-1 text-[13px] font-normal data-active:bg-transparent data-active:font-[650] data-active:text-sidebar-foreground group-data-[collapsible=icon]:!pl-2"
          isActive={active}
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
      </div>
    </SidebarMenuItem>
  );
}

function folderNavIcon(icon: FolderNavIconName) {
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
