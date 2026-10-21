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
  TagIcon,
  TagsIcon,
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
import { FOLDER_SECTIONS_OPEN_STORAGE_KEY, UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "../constants";
import { displayFolderCount } from "../format";
import { getLibraryFooterName, subscribeLibraryFooterName } from "../libraryFooterState";
import { getLoginConnectState, subscribeLoginConnectState } from "../loginConnectState";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { changeFolder, changeSmartFolder, openTags, submitLogout } from "../shellActions";
import { getThemeState, setThemePreference, subscribeThemeState, type ThemePreference } from "../themeState";
import type { EagleFolder, EagleSmartFolder } from "../types";

// Puts the resize handle on the floating card's edge; hovering it outlines the whole card (see sidebar-inner).
const floatingSidebarRailClassName = [
  "group-data-[state=expanded]:!inset-y-2.5 group-data-[state=expanded]:!right-0.5 group-data-[state=expanded]:hover:!bg-transparent",
  // The global `button { cursor: pointer }` rule outranks the rail's own cursor classes.
  "group-data-[state=expanded]:!cursor-col-resize group-data-[state=collapsed]:!cursor-e-resize",
  "group-data-[state=expanded]:after:!hidden",
].join(" ");

const GUEST_USERNAME = "Guest";
const GUEST_ROLE_LABEL = "No sign-in";

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
  const signedIn = loginState.authRequired && loginState.authenticated;

  return (
    <>
      <Sidebar
        id="accountSideMenu"
        variant="floating"
        collapsible="offcanvas"
        className="border-sidebar-border"
        aria-label="Account menu"
      >
        <SidebarHeader className="justify-center p-3 pb-1 pt-[calc(14px+env(safe-area-inset-top))]">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="pointer-events-none h-12 px-2 hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground"
              >
                <div>
                  <Avatar className="size-8 rounded-xl" aria-hidden="true">
                    <AvatarFallback className="rounded-xl bg-foreground text-background">
                      <RouterIcon className="size-5" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold leading-tight text-sidebar-foreground">{libraryHeader.name}</span>
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <FolderShortcutSideNav
              allFoldersTotal={searchState.allFoldersTotal}
              selectedFolderId={searchState.selectedFolderId}
              selectedSmartFolderId={searchState.selectedSmartFolderId}
              showingTags={searchState.section === "tags"}
            />
            <SmartFolderSideNav
              selectedSmartFolderId={searchState.selectedSmartFolderId}
              smartFolders={searchState.smartFolders}
            />
            <FolderSideNav
              folders={searchState.folders}
              selectedFolderId={searchState.selectedFolderId}
            />
          </div>
        </SidebarContent>

        <SidebarFooter className="p-2">
          {signedIn ? (
            <AccountDropdown
              disabled={loginState.disabled}
              roleDescription={roleDescription}
              roleLabel={roleLabel}
              signedIn
              statusLabel={accountStatusLabel || accountLabel || "Account"}
              username={username}
            />
          ) : (
            <AccountDropdown
              disabled={loginState.disabled}
              roleDescription=""
              roleLabel={GUEST_ROLE_LABEL}
              signedIn={false}
              statusLabel={`${GUEST_USERNAME} - ${GUEST_ROLE_LABEL}`}
              username={GUEST_USERNAME}
            />
          )}
          {signedIn && authError ? (
            <p id="authFooterMessage" className="m-0 rounded-md bg-destructive/10 px-2.5 py-2 text-xs leading-[1.35] text-destructive group-data-[collapsible=icon]:hidden" role="alert">
              {authError}
            </p>
          ) : null}
        </SidebarFooter>
        <SidebarRail className={floatingSidebarRailClassName} />
      </Sidebar>
    </>
  );
}

function libraryHeaderLabels(displayName: string) {
  const match = displayName.match(/^(.*?)\s+-\s+(Eagle\s+.+)$/);
  if (!match) return { name: displayName, version: "" };
  return { name: match[1], version: match[2] };
}

function FolderShortcutSideNav({
  allFoldersTotal,
  selectedFolderId,
  selectedSmartFolderId,
  showingTags = false,
}: {
  allFoldersTotal: number;
  selectedFolderId: string;
  selectedSmartFolderId: string;
  showingTags?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  const selectFolder = (folderId: string) => {
    changeFolder({ currentTarget: { value: folderId } });
    if (isMobile) setOpenMobile(false);
  };

  const selectTags = () => {
    openTags();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup className="shrink-0 px-3 pb-2 pt-2">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1" aria-label="Folder shortcuts">
          <FolderNavItem
            active={!showingTags && !selectedFolderId && !selectedSmartFolderId}
            count={allFoldersTotal}
            depth={0}
            icon="open"
            label="All"
            treeLayout={false}
            onSelect={() => selectFolder("")}
          />
          <FolderNavItem
            active={selectedFolderId === UNCATEGORIZED_FOLDER_ID}
            depth={0}
            icon="inbox"
            label="Uncategorized"
            treeLayout={false}
            onSelect={() => selectFolder(UNCATEGORIZED_FOLDER_ID)}
          />
          <FolderNavItem
            active={selectedFolderId === UNTAGGED_FOLDER_ID}
            depth={0}
            icon="tag"
            label="Untagged"
            treeLayout={false}
            onSelect={() => selectFolder(UNTAGGED_FOLDER_ID)}
          />
          <FolderNavItem
            active={showingTags}
            depth={0}
            icon="tags"
            label="All Tags"
            treeLayout={false}
            onSelect={selectTags}
          />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function FolderSideNav({
  folders,
  selectedFolderId,
}: {
  folders: readonly EagleFolder[];
  selectedFolderId: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const { expandedIds, toggleFolder } = useFolderExpansion(folders);
  const { open, toggleOpen } = useFolderSectionOpen("folders");
  const label = folderSectionLabel("Folders", folders);

  const selectFolder = (folderId: string) => {
    changeFolder({ currentTarget: { value: folderId } });
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup className="shrink-0 px-3 pb-2 pt-1">
      <FolderSectionHeader
        label={label}
        open={open}
        storageName="Folders"
        onToggle={toggleOpen}
      />
      {open ? (
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5" aria-label="Folder tree">
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
      ) : null}
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
  const { open, toggleOpen } = useFolderSectionOpen("smartFolders");
  const label = folderSectionLabel("Smart Folders", smartFolders);

  if (!smartFolders.length) return null;

  const selectSmartFolder = (smartFolderId: string) => {
    changeSmartFolder({ currentTarget: { value: smartFolderId } });
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup className="shrink-0 px-3 pb-1 pt-1">
      <FolderSectionHeader
        label={label}
        open={open}
        storageName="Smart Folders"
        onToggle={toggleOpen}
      />
      {open ? (
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
      ) : null}
    </SidebarGroup>
  );
}

type FolderSectionKey = "folders" | "smartFolders";

function FolderSectionHeader({
  label,
  open,
  storageName,
  onToggle,
}: {
  label: string;
  open: boolean;
  storageName: string;
  onToggle: () => void;
}) {
  return (
    <SidebarGroupLabel className="h-8 px-0 text-[11px] uppercase tracking-[0.08em]">
      <button
        className={[
          "flex h-8 min-w-0 flex-1 items-center rounded-lg px-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          open ? "folder-section-heading-open" : "folder-section-heading-closed",
        ].join(" ")}
        type="button"
        aria-label={`${open ? "Collapse" : "Expand"} ${storageName} section`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </SidebarGroupLabel>
  );
}

function useFolderSectionOpen(section: FolderSectionKey) {
  const [open, setOpen] = useState(() => readFolderSectionOpen(section));

  return {
    open,
    toggleOpen() {
      setOpen((current) => {
        const next = !current;
        writeFolderSectionOpen(section, next);
        return next;
      });
    },
  };
}

function folderSectionLabel(label: string, folders: readonly EagleFolder[]) {
  const count = folderTreeCount(folders);
  return count > 0 ? `${label} (${count.toLocaleString()})` : label;
}

function folderTreeCount(folders: readonly EagleFolder[]) {
  let count = 0;
  for (const folder of folders) {
    count += 1;
    const children = Array.isArray(folder.children) ? folder.children : [];
    if (children.length) count += folderTreeCount(children);
  }
  return count;
}

function readFolderSectionOpen(section: FolderSectionKey) {
  try {
    if (typeof window === "undefined") return true;
    const saved = JSON.parse(window.localStorage.getItem(FOLDER_SECTIONS_OPEN_STORAGE_KEY) || "{}") as Partial<Record<FolderSectionKey, unknown>>;
    if (saved[section] === false) return false;
    if (saved[section] === true) return true;
  } catch {
    // Keep the default when storage is unavailable or corrupted.
  }
  return true;
}

function writeFolderSectionOpen(section: FolderSectionKey, open: boolean) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FOLDER_SECTIONS_OPEN_STORAGE_KEY) || "{}") as Partial<Record<FolderSectionKey, unknown>>;
    window.localStorage.setItem(FOLDER_SECTIONS_OPEN_STORAGE_KEY, JSON.stringify({ ...saved, [section]: open }));
  } catch {
    // Ignore unavailable storage; the in-memory section state still updates.
  }
}

function isSmartFolderGroup(folder: EagleSmartFolder) {
  return folder.icon === "grid";
}

type FolderNavIconName = "folder" | "inbox" | "open" | "smart" | "smartGroup" | "tag" | "tags";

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

function ThemeMenuSection() {
  const themeState = useSyncExternalStore(subscribeThemeState, getThemeState, getThemeState);
  const themeOptions: { icon: typeof SunIcon; label: string; value: ThemePreference }[] = [
    { icon: SunIcon, label: "Light", value: "light" },
    { icon: MoonIcon, label: "Dark", value: "dark" },
  ];

  return (
    <div className="grid gap-2 px-2 pb-1.5 pt-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Theme</span>
      <Tabs
        id="themeModeGroup"
        value={themeState.preference}
        className="w-full"
        aria-label="Theme color"
        onValueChange={(value) => {
          setThemePreference(value as ThemePreference);
        }}
      >
        <TabsList className="grid h-9 w-full grid-cols-2 rounded-xl bg-muted p-1 shadow-none" aria-label="Theme color">
          {themeOptions.map(({ icon: Icon, label, value }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-7 gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:hover:text-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm data-active:hover:text-foreground"
              aria-label={label}
              title={label}
            >
              <Icon data-icon="inline-start" aria-hidden="true" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function RoleChip({ description, label }: { description: string; label: string }) {
  return (
    <span className="group/role relative inline-flex shrink-0">
      <span
        className="inline-flex cursor-default items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        tabIndex={description ? 0 : undefined}
        aria-describedby={description ? "authRoleDescription" : undefined}
      >
        {label}
      </span>
      {description ? (
        <span
          id="authRoleDescription"
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-10 mt-1.5 w-max max-w-[220px] rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-medium leading-snug text-background opacity-0 shadow-md transition-opacity group-hover/role:opacity-100 group-focus-within/role:opacity-100"
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}

function AccountAvatar({ id, large = false, signedIn, username }: { id?: string; large?: boolean; signedIn: boolean; username: string | undefined }) {
  const initial = signedIn ? (username || "").trim().slice(0, 1).toUpperCase() : "";
  const sizeClassName = large ? "size-10 text-base" : "size-8 text-sm";
  return (
    <Avatar className={`${sizeClassName} rounded-full`}>
      <AvatarFallback id={id} className={`rounded-full font-semibold ${signedIn ? "bg-foreground text-background" : "bg-sidebar-accent text-muted-foreground"}`}>
        {initial || <UserRoundIcon className="size-4" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
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
  treeLayout = true,
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
  treeLayout?: boolean;
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
          treeLayout
            ? "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center group-data-[collapsible=icon]:block"
            : "min-w-0",
          treeLayout ? folderTreeDepthClass(safeDepth) : "",
        ].join(" ")}
      >
        {treeLayout ? (
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
        ) : null}
        <SidebarMenuButton
          className={`h-9 min-w-0 gap-2.5 rounded-xl text-[13.5px] font-normal data-[active=true]:bg-[var(--sidebar-active)] data-[active=true]:font-semibold data-[active=true]:text-[var(--sidebar-active-foreground)] data-[active=true]:hover:bg-[var(--sidebar-active)] data-[active=true]:hover:text-[var(--sidebar-active-foreground)] group-data-[collapsible=icon]:!pl-2 ${treeLayout ? "px-1.5" : "px-2.5"}`}
          isActive={active}
          tooltip={label}
          type="button"
          aria-current={active ? "page" : undefined}
          title={label}
          onClick={onSelect}
        >
          <Icon className={active ? "text-[var(--sidebar-active-foreground)]" : "text-muted-foreground"} aria-hidden="true" />
          <span className="min-w-0 truncate">{label}</span>
          {displayCount === undefined ? null : (
            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none [font-variant-numeric:tabular-nums] group-data-[collapsible=icon]:hidden ${active ? "bg-background text-sidebar-foreground" : "bg-sidebar-accent text-muted-foreground"}`}>
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
  if (icon === "tag") return TagIcon;
  if (icon === "tags") return TagsIcon;
  return FolderIcon;
}

function AccountDropdown({
  disabled,
  roleDescription,
  roleLabel,
  signedIn,
  statusLabel,
  username,
}: {
  disabled: boolean;
  roleDescription: string;
  roleLabel: string;
  signedIn: boolean;
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
          className="h-14 rounded-xl px-2 hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-foreground"
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
          <AccountAvatar id="authAvatarFallback" signedIn={signedIn} username={username} />
          <span className="grid min-w-0 flex-1 gap-0.5 text-left text-sm leading-tight">
            <span id="authUserLabel" className="truncate font-semibold">
              {displayUsername}
            </span>
            <span id="authRoleLabel" className="truncate text-xs text-muted-foreground">
              {displayRole}
            </span>
          </span>
          <ChevronsUpDownIcon className="ml-auto text-muted-foreground" aria-hidden="true" />
        </SidebarMenuButton>

        {open ? (
          <div
            ref={menuRef}
            id="authAccountMenu"
            role="menu"
            aria-labelledby="authAccountLabel"
            className={
              isMobile
                ? "absolute bottom-full left-0 right-0 z-50 mb-2 rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)]"
                : "absolute bottom-0 left-full z-50 ml-3 w-72 rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_18px_48px_-16px_rgba(15,23,42,0.35)]"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-2 pb-2.5 pt-2 text-left text-sm">
              <AccountAvatar signedIn={signedIn} username={username} large />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm leading-tight">
                <span className="min-w-0 truncate font-semibold">{displayUsername}</span>
                <RoleChip description={roleDescription} label={displayRole} />
              </div>
            </div>
            <div className="-mx-1.5 my-1 h-px bg-border" />
            <ThemeMenuSection />
            {signedIn ? (
              <>
                <div className="-mx-1.5 my-1 h-px bg-border" />
                <button
                  id="logoutButton"
                  type="button"
                  role="menuitem"
                  className="relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground outline-hidden select-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
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
              </>
            ) : null}
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
