import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AccountSideMenu,
  AdvancedFilters,
  CardTemplate,
  ConnectButton,
  ConnectMessage,
  FolderOptions,
  LibraryFooter,
  LoginView,
  PageButtons,
  Pager,
  PreviewActions,
  PreviewBody,
  PreviewBodyHost,
  PreviewDialog,
  PreviewDetailsPanel,
  PreviewInfoActions,
  PreviewInfoDetails,
  PreviewMeta,
  PreviewOriginalName,
  PreviewRating,
  RatingStars,
  ResultList,
  ResultSurface,
  ResultStateView,
  ResultsStatus,
  SearchControls,
  SearchInput,
  TagChips,
  TagSuggestions,
  TilesSentinel,
  ViewerAppShell,
  ViewerShellLayout,
  SearchFiltersButton,
} from "./ViewerShell";
import { TagSearchControls } from "./components/SearchControls";
import { resetPreviewDialogState, setPreviewDialogState } from "./previewDialogState";
import { setImageOverlayControlsVisible } from "./imageOverlayState";
import { setVideoOverlayControlsVisible } from "./videoOverlayState";
import { setLoginConnectState } from "./loginConnectState";
import { setLibraryFooterName } from "./libraryFooterState";
import { setEagleStatus } from "./eagleStatusState";
import { getSearchControlsState, setSearchControlsState } from "./searchControlsState";
import { setTagListState } from "./tagListState";
import { TagList } from "./components/TagList";
import { getThemeState, initializeThemeState, setThemePreference } from "./themeState";
import { safeExternalUrl } from "./components/PreviewBody";
import { SubfolderList } from "./components/SubfolderList";
import { setFolderCoverFetcher } from "./folderCovers";
import { getSubfoldersVisible, setSubfoldersVisible } from "./subfolderVisibilityState";
import * as shellActions from "./shellActions";

function renderAccountSideMenu() {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SidebarProvider>
        <AccountSideMenu />
        <SearchControls />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

const REQUIRED_ELEMENT_IDS = [
  "loginView",
  "connectForm",
  "connectButton",
  "connectMessage",
  "viewerShell",
  "extSelect",
  "ratingSelect",
  "searchInput",
  "tagChips",
  "tagSuggestions",
  "resetFiltersButton",
  "toggleFiltersButton",
  "advancedFilters",
  "grid",
  "tilesSentinel",
  "tilesViewButton",
  "gridViewButton",
  "listViewButton",
  "prevButton",
  "nextButton",
  "pageButtons",
  "pageSummary",
  "previewDialog",
  "previewBody",
  "previewOriginalName",
  "previewRating",
  "previewDetails",
  "previewActions",
  "toggleInfoPreview",
  "closePreview",
  "cardTemplate",
] as const;

describe("ViewerAppShell", () => {
  test("normalizes url preview links to safe external URLs only", () => {
    expect(safeExternalUrl("https://example.test/page")).toBe("https://example.test/page");
    expect(safeExternalUrl("https://subdomain.example.test/path?query=1")).toBe("https://subdomain.example.test/path?query=1");
    expect(safeExternalUrl("javascript:alert(1)")).toBe("");
  });

  test("preview body delegates media, image, and simple previews to focused modules", async () => {
    const [{ MediaControls }, { ImagePreview }, { TextPreview }] = await Promise.all([
      import("./components/previewBody/MediaPreviews"),
      import("./components/previewBody/ImagePreview"),
      import("./components/previewBody/SimplePreviews"),
    ]);

    expect(typeof MediaControls).toBe("function");
    expect(typeof ImagePreview).toBe("function");
    expect(typeof TextPreview).toBe("function");
  });

  test("renders the DOM contract used by viewerApp", () => {
    const html = renderToStaticMarkup(<ViewerAppShell />);

    for (const id of REQUIRED_ELEMENT_IDS) {
      expect(html).toContain(`id="${id}"`);
    }

    expect(html).toMatch(/class="[^"]*\bmedia-card\b/);
    expect(html).toMatch(/class="[^"]*\bthumb-button\b/);
    expect(html).toMatch(/class="[^"]*\bpager\b/);
    expect(html).toMatch(/class="[^"]*\brating-control\b/);
  });

  test("renders configured filter options", () => {
    const html = renderToStaticMarkup(<ViewerAppShell />);

    expect(html).toMatch(/id="extSelect"[^>]*aria-label="Type: All types"/);
    expect(html).toContain(">All types<");
    expect(html).toMatch(/id="ratingSelect"[^>]*aria-label="Rating: All ratings"/);
    expect(html).toContain(">All ratings<");

  });

  test("renders selected view mode with shadcn active styling", () => {
    const html = renderToStaticMarkup(<ResultsStatus total={12} viewMode="grid" />);

    expect(html).toContain("12 items");
    expect(html).toContain('aria-label="Results status and view options"');
    expect(html).toContain('id="gridViewButton"');
    expect(html).toContain('data-slot="tabs"');
    expect(html).toContain('data-slot="tabs-list"');
    expect(html).toContain('data-slot="tabs-trigger"');
    expect(html).toContain('data-icon="inline-start"');
    expect(html).toContain("data-[state=active]:bg-background");
    expect(html).toContain("data-[state=active]:text-foreground");
    expect(html).toContain("data-active:bg-background");
    expect(html).toContain("data-active:text-foreground");
    expect(html).toContain("text-muted-foreground");
  });

  test("renders login connection controls as reusable components", () => {
    const button = renderToStaticMarkup(<ConnectButton disabled />);
    const message = renderToStaticMarkup(<ConnectMessage isError message="No Eagle" />);
    const login = renderToStaticMarkup(<LoginView />);

    expect(button).toContain('id="connectButton"');
    expect(button).toContain("disabled");
    expect(message).toContain('id="connectMessage"');
    expect(message).toContain("No Eagle");
    expect(message).toContain("text-destructive");
    expect(message).toContain("text-left");
    expect(message).toContain("lucide-circle-alert");
    expect(message).toContain('role="alert"');
    expect(message).not.toContain("fixed bottom-");
    expect(login).not.toContain("Start the server from the Eagle plugin panel");
    expect(login).not.toContain("Ask the person who set up this media library for an account.");
  });

  test("exports independently renderable shell components", () => {
    const components = [
      { Component: LoginView, expectedId: "loginView" },
      { Component: SearchControls, expectedId: "advancedFilters" },
      { Component: ResultsStatus, expectedId: "gridViewButton" },
      { Component: ResultSurface, expectedId: "grid" },
      { Component: Pager, expectedId: "pageButtons" },
      { Component: PreviewDialog, expectedId: "previewDialog" },
      { Component: PreviewBodyHost, expectedId: "previewBody" },
      { Component: PreviewInfoDetails, expectedId: "previewDetails" },
      { Component: PreviewInfoActions, expectedId: "previewActions" },
      { Component: PreviewRating, expectedId: "previewRating" },
      { Component: CardTemplate, expectedId: "cardTemplate" },
      { Component: ViewerShellLayout, expectedId: "viewerShell" },
    ] as const;

    for (const { Component, expectedId } of components) {
      expect(renderToStaticMarkup(<TooltipProvider><Component /></TooltipProvider>)).toContain(`id="${expectedId}"`);
    }
  });

  test("renders preview header with back action, divider, filename, and mobile info toggle", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain("fixed inset-0");
    expect(html).toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(html).toContain("m-0");
    expect(html).toContain("max-h-none");
    expect(html).toContain("max-w-none");
    expect(html).not.toContain("preview-close-swipe-handle");
    expect(html).not.toContain("Swipe down to close preview");
    expect(html).toContain("preview-header");
    expect(html).toContain('id="closePreview"');
    expect(html).toContain('id="previewOriginalName"');
    expect(html).not.toContain('id="previewHeaderOriginalName"');
    expect(html).toContain("border-l border-border");
    expect(html).toContain("desktop:hidden");
    expect(html).toContain("desktop:col-start-1");
    expect(html).toContain("m15 18-6-6 6-6");
    expect(html).not.toContain("preview-original-name-section");
    expect(html).not.toContain("preview-original-meta");
    expect(html).not.toContain("Click to rate");
  });

  test("renders preview info button with mobile info and desktop panel icons", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain('id="toggleInfoPreview"');
    expect(html).toContain("desktop:hidden");
    expect(html).toContain("hidden desktop:block");
    expect(html).toContain('cx="12"');
    expect(html).toContain('cy="12"');
    expect(html).toContain('r="10"');
    expect(html).toContain('d="M12 16v-4"');
    expect(html).toContain('d="M12 8h.01"');
    expect(html).toContain('d="M9 3v18"');
    expect(html).toContain('d="m14 9 3 3-3 3"');
  });

  test("renders desktop preview info as a persistent right inspector", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain("preview-info");
    expect(html).toContain("right-0");
    expect(html).toContain("z-[6]");
    expect(html).toContain("border-l");
    expect(html).toContain("desktop:relative");
    expect(html).toContain("desktop:col-start-2");
    expect(html).toContain("desktop:row-span-2");
    expect(html).toContain("desktop:translate-x-0");
    expect(html).toContain("translate-x-full");
    expect(html).toContain("shadow-none");
  });

  test("renders video preview layout under the shared preview header", () => {
    setPreviewDialogState({ infoOpen: false, mode: "video", open: true });
    const html = renderToStaticMarkup(<PreviewDialog />);
    resetPreviewDialogState();

    expect(html).toContain("bg-[#05070a]");
    expect(html).toContain("preview-header");
    expect(html).toContain('id="closePreview"');
    expect(html).not.toContain('id="fullscreenPreview"');
    expect(html).not.toContain("fixed left-2.5 top-[calc(10px+env(safe-area-inset-top))]");
  });

  test("renders image preview actions with media-style controls", () => {
    setPreviewDialogState({ infoOpen: false, mode: "image", open: true });
    const dialog = renderToStaticMarkup(<PreviewDialog />);
    resetPreviewDialogState();
    const body = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.jpg" }} kind="image" />);

    expect(dialog).toContain("preview-header");
    expect(dialog).toContain("rounded-full");
    expect(dialog).not.toContain("bg-[rgba(15,23,42,0.48)]");
    expect(body).toContain("image-toolbar");
    expect(body).toMatch(/image-toolbar[^"]*right-\[calc\(14px\+env\(safe-area-inset-right\)\)\]/);
    expect(body).toContain("100%");
    expect(body).not.toMatch(/image-toolbar[^"]*left-1\/2/);
    expect(body).not.toMatch(/image-toolbar[^"]*-translate-x-1\/2/);
    expect(body).toContain("var(--card)_86%");
    expect(body).toContain("text-muted-foreground");
  });

  test("hides image overlay buttons and toolbar when image controls are toggled off", () => {
    setPreviewDialogState({ infoOpen: false, mode: "image", open: true });
    setImageOverlayControlsVisible(false);
    const dialog = renderToStaticMarkup(<PreviewDialog />);
    const body = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.jpg" }} kind="image" />);
    resetPreviewDialogState();
    setImageOverlayControlsVisible(true);

    expect(dialog).toContain('id="closePreview"');
    expect(dialog).toContain('id="toggleInfoPreview"');
    expect(body).toContain("image-toolbar");
    expect(body).toContain("pointer-events-none opacity-0");
  });

  test("keeps preview header actions visible when video controls are toggled off", () => {
    setPreviewDialogState({ infoOpen: false, mode: "video", open: true });
    setVideoOverlayControlsVisible(false);
    const html = renderToStaticMarkup(<PreviewDialog />);
    resetPreviewDialogState();
    setVideoOverlayControlsVisible(true);

    expect(html).toContain('id="closePreview"');
    expect(html).toContain('id="toggleInfoPreview"');
    expect(html).toContain("preview-header");
    expect(html).not.toContain("pointer-events-none opacity-0");
    expect(html).not.toContain('id="fullscreenPreview"');
  });

  test("renders page buttons as a reusable component", () => {
    const html = renderToStaticMarkup(<PageButtons current={2} pages={[1, 2, "...", 8]} onSelect={() => {}} />);

    expect(html).toContain('data-active="true"');
    expect(html).toContain("page-ellipsis");
  });

  test("renders mobile pagination position when page shortcuts are hidden", () => {
    const html = renderToStaticMarkup(
      <Pager
        current={3}
        hidden={false}
        nextDisabled={false}
        onSelectPage={() => {}}
        pages={[1, 2, 3, 4, "...", 10]}
        previousDisabled={false}
      />,
    );

    expect(html).toContain('id="pageSummary"');
    expect(html).toContain("Page 3 of 10");
    expect(html).toContain("max-[540px]:row-start-1");
    expect(html).toContain("max-[540px]:row-start-2");
  });

  test("keeps bottom spacing when pagination is hidden for tiles", () => {
    const html = renderToStaticMarkup(<Pager hidden />);

    expect(html).toContain("pager-spacer");
    expect(html).toContain("h-[82px]");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label="Pagination"');
    expect(html).not.toContain('id="prevButton"');
  });

  test("renders tag chips as a reusable component", () => {
    const html = renderToStaticMarkup(<TagChips tags={["alpha"]} onRemove={() => {}} />);

    expect(html).toContain('class="tag-chip ');
    expect(html).toContain("Remove tag alpha");
  });

  test("renders folder options as a reusable component", () => {
    const html = renderToStaticMarkup(<FolderOptions folders={[{
      id: "folder-1",
      name: "Folder 1",
      imageCount: 8,
      depth: 0,
      children: [{ id: "folder-child", name: "Folder Child", imageCount: 3, depth: 1 }],
    }]} />);

    expect(html).toContain("All folders");
    expect(html).toContain("Uncategorized");
    expect(html).toContain("Folder 1 (8)");
    expect(html).toContain("  Folder Child (3)");
  });

  test("renders library footer as a reusable component", () => {
    const html = renderToStaticMarkup(<LibraryFooter name="My Library" />);

    expect(html).toContain('id="libraryFooterName"');
    expect(html).toContain("My Library");
    expect(html).not.toContain("logoutButton");
    expect(html).not.toContain("authFooterMessage");
  });

  test("renders authenticated account controls in a responsive side menu", () => {
    setSearchControlsState({
      allFoldersTotal: 99,
      filtersOpen: false,
      folders: [
        { id: "parent", name: "Parent", imageCount: 10, depth: 0 },
        { id: "zero-folder", name: "Zero Folder", imageCount: 0, depth: 0 },
        { id: "child", name: "Child", imageCount: 4, depth: 1 },
      ],
      hasActiveFilters: true,
      hasResettableFilters: false,
      searchQuery: "",
      selectedExt: "",
      selectedFolderId: "child",
      selectedLimit: 30,
      selectedRating: "",
      selectedSmartFolderId: "",
      smartFolders: [
        { id: "smart-parent", name: "Large Images", imageCount: 42, depth: 0, conditions: [{ key: "type", value: "group-marker" }], icon: "grid" },
        { id: "smart-zero", name: "Zero Smart", imageCount: 0, depth: 0, conditions: [{ key: "type", value: "empty" }] },
        { id: "smart-child", name: "Needs Review", imageCount: 7, depth: 1, conditions: [], children: [{ id: "ignored-child", name: "Ignored" }] },
      ],
    });
    setLoginConnectState({
      authenticated: true,
      authRequired: true,
      disabled: false,
      isError: false,
      message: "",
      user: { role: "editor", username: "ed" },
    });
    setLibraryFooterName("My Library");
    const html = renderAccountSideMenu();

    expect(html).toContain('id="accountSideMenu"');
    expect(html).toContain("My Library");
    expect(html).not.toContain("Media Library");
    expect(html).toContain('id="authAccountLabel"');
    expect(html).toContain('id="authUserLabel"');
    expect(html).toContain('id="authRoleLabel"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toMatch(/id="authAvatarFallback"[^>]*>E</);
    expect(html).toMatch(/id="eagleStatusDot"[^>]*data-status="checking"/);

    setEagleStatus("online");
    expect(renderAccountSideMenu()).toMatch(/id="eagleStatusDot"[^>]*data-status="online"[^>]*title="Connected to media server"/);
    vi.stubGlobal("window", { location: { hostname: "nas.local" } });
    const onlineHtml = renderAccountSideMenu();
    vi.unstubAllGlobals();
    expect(onlineHtml).toMatch(/id="eagleStatusDot"[^>]*data-status="online"[^>]*title="Connected to nas.local"/);
    expect(onlineHtml).toContain("bg-success");

    setEagleStatus("offline");
    const offlineHtml = renderAccountSideMenu();
    expect(offlineHtml).toMatch(/id="eagleStatusDot"[^>]*data-status="offline"[^>]*title="Media server unavailable"/);
    expect(offlineHtml).toContain("bg-destructive");
    setEagleStatus("checking");
    expect(html).toContain("Smart Folders");
    expect(html).toContain("Folders");
    const allFoldersIndex = html.indexOf("All folders");
    const uncategorizedIndex = html.indexOf("Uncategorized");
    const smartFoldersIndex = html.indexOf("Smart Folders");
    const foldersIndex = html.indexOf("Folders", smartFoldersIndex + "Smart Folders".length);
    expect(allFoldersIndex).toBeLessThan(smartFoldersIndex);
    expect(uncategorizedIndex).toBeLessThan(smartFoldersIndex);
    expect(smartFoldersIndex).toBeLessThan(foldersIndex);
    expect(html).not.toContain('id="themeModeGroup"');
    expect(html).toContain('aria-label="Folder tree"');
    expect(html).toContain(">All<");
    expect(html).toContain(">99</span>");
    expect(html).toContain('title="All"');
    expect(html).not.toContain('title="All (99)"');
    expect(html).toContain("Uncategorized");
    expect(html).toContain("Untagged");
    expect(html.indexOf("Uncategorized")).toBeLessThan(html.indexOf("Untagged"));
    expect(html.indexOf("Untagged")).toBeLessThan(smartFoldersIndex);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("All Tags"));
    expect(html.indexOf("All Tags")).toBeLessThan(smartFoldersIndex);
    const accountMenuDocument = new JSDOM(html, { url: "http://localhost" }).window.document;
    const folderShortcuts = accountMenuDocument.querySelector('[aria-label="Folder shortcuts"]');
    expect(folderShortcuts?.querySelector(".sidebar-tree-depth-0")).toBeNull();
    const folderFilter = accountMenuDocument.querySelector('input[aria-label="Filter folders"]');
    const sidebarFooter = accountMenuDocument.querySelector('[data-slot="sidebar-footer"]');
    const scrollingFolders = accountMenuDocument.querySelector(".no-scrollbar.overflow-y-auto");
    expect(folderFilter?.getAttribute("placeholder")).toBe("Filter");
    expect(sidebarFooter?.contains(folderFilter)).toBe(true);
    expect(scrollingFolders?.contains(folderFilter)).toBe(false);
    expect(scrollingFolders?.className).toContain("mask-image:linear-gradient");
    expect(html.indexOf('aria-label="Filter folders"')).toBeLessThan(html.indexOf('id="authAccountLabel"'));
    expect(html).toContain("Large Images");
    expect(html).toContain(">42</span>");
    expect(html).toContain('title="Large Images"');
    expect(html).not.toContain('title="Large Images (42)"');
    expect(html).toContain("Zero Smart");
    expect(html).not.toContain("Zero Smart (0)");
    expect(html).toContain("Needs Review");
    expect(html).not.toContain("lucide-router");
    expect(html).toMatch(/src="(?:[^"]*app_icon\.svg|data:image\/svg\+xml,)/);
    expect(html).not.toContain("lucide-book-open-text");
    expect(html).toContain("lucide-folder-cog");
    expect(html).toContain("lucide-layout-grid");
    expect(html).not.toContain("No folders loaded");
    expect(html).toContain("Parent");
    expect(html).toContain("Zero Folder");
    expect(html).not.toContain("Zero Folder (0)");
    expect(html).toContain("Child");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("sidebar-tree-depth-1");
    expect(html).not.toContain("calc(0.125rem + 1 * 0.875rem)");
    expect(html).toContain('data-slot="sidebar"');
    expect(html).toContain('data-variant="floating"');
    expect(html).toContain('data-sidebar="menu-button"');
    expect(html).toContain("data-[active=true]:bg-[var(--sidebar-active)]");
    expect(html).toContain("data-[active=true]:text-[var(--sidebar-active-foreground)]");
    expect(html).toContain("rounded-[22px]");
    expect(html).toContain("group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]");
    expect(html).toContain("group-data-[collapsible=icon]:!size-8");
    expect(html).toContain("no-scrollbar min-h-0 flex-1 overflow-y-auto");
    expect(html).not.toContain("min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1");
    expect(html).toContain("shrink-0 px-3 pb-2 pt-1");
    expect(html).not.toContain("md:hidden");
    expect(html).not.toContain("fixed left-3");

    setLoginConnectState({
      authenticated: false,
      authRequired: false,
      disabled: false,
      isError: false,
      message: "",
      user: null,
    });
    setSearchControlsState({
      allFoldersTotal: 0,
      filtersOpen: false,
      folders: [],
      hasActiveFilters: false,
      hasResettableFilters: false,
      searchQuery: "",
      selectedExt: "",
      selectedFolderId: "",
      selectedLimit: 30,
      selectedRating: "",
      selectedSmartFolderId: "",
      smartFolders: [],
    });
  });

  test("renders sidebar folder trees with isExpand state and neutral branch lines", () => {
    setSearchControlsState({
      allFoldersTotal: 0,
      filtersOpen: false,
      folders: [
        {
          id: "open-folder",
          name: "Open Folder",
          imageCount: 3,
          isExpand: true,
          children: [
            { id: "open-child", name: "Open Child", imageCount: 2, depth: 1 },
            { id: "last-child", name: "Last Child", imageCount: 1, depth: 1 },
          ],
        },
        {
          id: "closed-folder",
          name: "Closed Folder",
          imageCount: 1,
          isExpand: false,
          children: [{ id: "closed-child", name: "Closed Child", imageCount: 1, depth: 1 }],
        },
      ],
      hasActiveFilters: false,
      hasResettableFilters: false,
      searchQuery: "",
      selectedExt: "",
      selectedFolderId: "open-child",
      selectedLimit: 30,
      selectedRating: "",
      selectedSmartFolderId: "",
      smartFolders: [
        {
          id: "open-smart",
          name: "Open Smart",
          imageCount: 3,
          isExpand: true,
          children: [{ id: "open-smart-child", name: "Open Smart Child", imageCount: 2, depth: 1 }],
        },
      ],
    });

    const html = renderAccountSideMenu();

    expect(html).toContain("Open Folder");
    expect(html).toContain("Open Child");
    expect(html).toContain("Last Child");
    expect(html).toContain("Closed Folder");
    expect(html).not.toContain("Closed Child");
    expect(html).toContain("Open Smart Child");
    expect(html).toContain('aria-label="Collapse Open Folder"');
    expect(html).toContain('aria-label="Expand Closed Folder"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("sidebar-tree-branch");
    expect(html).toContain("sidebar-tree-branch-mid");
    expect(html).toContain("sidebar-tree-branch-last");
    expect(html).toContain("bg-sidebar-border");
    expect(html).not.toMatch(/sidebar-tree-branch[^"]*bg-sidebar-primary/);
  });

  test("renders collapsible folder section labels with belonging folder counts", () => {
    setSearchControlsState({
      allFoldersTotal: 0,
      filtersOpen: false,
      folders: [
        {
          id: "folder-parent",
          name: "Folder Parent",
          imageCount: 3,
          isExpand: true,
          children: [
            { id: "folder-child-a", name: "Folder Child A", imageCount: 2, depth: 1 },
            { id: "folder-child-b", name: "Folder Child B", imageCount: 1, depth: 1 },
          ],
        },
      ],
      hasActiveFilters: false,
      hasResettableFilters: false,
      searchQuery: "",
      selectedExt: "",
      selectedFolderId: "",
      selectedLimit: 30,
      selectedRating: "",
      selectedSmartFolderId: "",
      smartFolders: [
        {
          id: "smart-parent",
          name: "Smart Parent",
          imageCount: 3,
          isExpand: true,
          children: [
            { id: "smart-child-a", name: "Smart Child A", imageCount: 2, depth: 1 },
            { id: "smart-child-b", name: "Smart Child B", imageCount: 1, depth: 1 },
          ],
        },
      ],
    });

    const html = renderAccountSideMenu();

    expect(html).toContain("Smart Folders (3)");
    expect(html).toContain("Folders (3)");
    expect(html).toContain('aria-label="Collapse Smart Folders section"');
    expect(html).toContain('aria-label="Collapse Folders section"');
    expect(html).toContain("Smart Child A");
    expect(html).toContain("Folder Child A");
    const accountMenuDocument = new JSDOM(html, { url: "http://localhost" }).window.document;
    const smartSectionToggle = accountMenuDocument.querySelector('[aria-label="Collapse Smart Folders section"]');
    const folderSectionToggle = accountMenuDocument.querySelector('[aria-label="Collapse Folders section"]');
    expect(smartSectionToggle?.querySelector("svg")).toBeNull();
    expect(folderSectionToggle?.querySelector("svg")).toBeNull();
    expect(smartSectionToggle?.className).toContain("folder-section-heading-open");
    expect(folderSectionToggle?.className).toContain("folder-section-heading-open");
  });

  test("restores and stores collapsible folder section open state", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.localStorage.setItem("eagleFolderSectionsOpen", JSON.stringify({ folders: false, smartFolders: false }));
    setLoginConnectState({
      authenticated: false,
      authRequired: false,
      disabled: false,
      isError: false,
      message: "",
      user: null,
    });
    setSearchControlsState({
      allFoldersTotal: 0,
      filtersOpen: false,
      folders: [{ id: "folder-one", name: "Folder One", imageCount: 1 }],
      hasActiveFilters: false,
      hasResettableFilters: false,
      searchQuery: "",
      selectedExt: "",
      selectedFolderId: "",
      selectedLimit: 30,
      selectedRating: "",
      selectedSmartFolderId: "",
      smartFolders: [{ id: "smart-one", name: "Smart One", imageCount: 1, conditions: [] }],
    });

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <TooltipProvider>
            <SidebarProvider>
              <AccountSideMenu />
            </SidebarProvider>
          </TooltipProvider>,
        );
      });

      expect(container.textContent).toContain("Smart Folders (1)");
      expect(container.textContent).toContain("Folders (1)");
      expect(container.textContent).not.toContain("Smart One");
      expect(container.textContent).not.toContain("Folder One");

      const smartToggle = container.querySelector('[aria-label="Expand Smart Folders section"]');
      if (!(smartToggle instanceof dom.window.HTMLButtonElement)) throw new Error("Missing smart section toggle");
      expect(smartToggle.querySelector("svg")).toBeNull();
      expect(smartToggle.className).toContain("folder-section-heading-closed");

      await act(async () => {
        smartToggle.click();
      });

      expect(container.textContent).toContain("Smart One");
      expect(JSON.parse(dom.window.localStorage.getItem("eagleFolderSectionsOpen") || "{}")).toEqual({
        folders: false,
        smartFolders: true,
      });

      const accountButton = container.querySelector("#authAccountLabel");
      if (!(accountButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing account menu button");
      expect(accountButton.textContent).toContain("Guest");
      expect(container.querySelector("#themeModeGroup")).toBeNull();

      await act(async () => {
        accountButton.click();
      });

      const themeGroup = container.querySelector("#themeModeGroup");
      expect(themeGroup).not.toBeNull();
      expect(themeGroup?.getAttribute("aria-label")).toBe("Theme color");
      expect(container.querySelector('#authAccountMenu [aria-label="Light"]')).not.toBeNull();
      expect(container.querySelector('#authAccountMenu [aria-label="Dark"]')).not.toBeNull();
      expect(container.querySelector('#authAccountMenu [aria-label="System"]')).not.toBeNull();
      const pageSizeGroup = container.querySelector("#pageSizeGroup");
      expect(pageSizeGroup?.getAttribute("aria-label")).toBe("Items per page");
      expect(container.querySelector('#authAccountMenu [aria-label="30 items per page"]')?.getAttribute("data-state")).toBe("active");
      expect(container.querySelector('#authAccountMenu [aria-label="240 items per page"]')?.getAttribute("data-state")).toBe("inactive");
      expect(container.querySelector("#logoutButton")).toBeNull();
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("filters both folder trees without changing item search or saved expansion state", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    const previousSearchState = getSearchControlsState();
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    const savedSections = JSON.stringify({ folders: false, smartFolders: false });
    dom.window.localStorage.setItem("eagleFolderSectionsOpen", savedSections);
    setSearchControlsState({
      allFoldersTotal: 42,
      filtersOpen: true,
      folders: [
        {
          id: "design", name: "Design", isExpand: false,
          children: [
            { id: "logo-studies", name: "Logo studies", depth: 1 },
            { id: "other-asset", name: "Other asset", depth: 1 },
          ],
        },
        {
          id: "logo-category", name: "Logo category", isExpand: false,
          children: [{ id: "unmatched-child", name: "Unmatched child", depth: 1 }],
        },
        { id: "repeated-logo", name: "Logo LOGO" },
        { id: "literal-folder", name: "Release.[draft]" },
        { id: "photos", name: "Photos" },
      ],
      hasActiveFilters: true,
      hasResettableFilters: true,
      searchQuery: "existing item search",
      selectedExt: "png",
      selectedFolderId: "logo-studies",
      selectedLimit: 30,
      selectedRating: "4",
      selectedSmartFolderId: "",
      smartFolders: [
        {
          id: "saved-searches", name: "Saved searches", isExpand: false,
          children: [{ id: "logo-favorites", name: "Logo favorites", depth: 1 }],
        },
        { id: "literal-smart-folder", name: "Review.[draft]", conditions: [] },
        { id: "video-picks", name: "Video picks", conditions: [] },
      ],
    });
    const itemSearchState = getSearchControlsState();
    const { createRoot } = await import("react-dom/client");
    const { Simulate } = await import("react-dom/test-utils");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);
      await act(async () => {
        root?.render(<TooltipProvider><SidebarProvider><AccountSideMenu /></SidebarProvider></TooltipProvider>);
      });
      const input = container.querySelector('input[aria-label="Filter folders"]');
      if (!(input instanceof dom.window.HTMLInputElement)) throw new Error("Missing folder filter");
      const setFilter = async (value: string) => {
        await act(async () => {
          Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
          Simulate.change(input);
        });
      };

      expect(container.textContent).not.toContain("Logo studies");
      expect(container.textContent).not.toContain("Logo favorites");
      await setFilter("  lOgO  ");

      const folderTree = container.querySelector('[aria-label="Folder tree"]');
      const smartTree = container.querySelector('[aria-label="Smart folder tree"]');
      expect(folderTree?.textContent).toContain("Design");
      expect(folderTree?.textContent).toContain("Logo studies");
      expect(folderTree?.textContent).toContain("Logo category");
      expect(folderTree?.textContent).toContain("Unmatched child");
      expect(folderTree?.textContent).not.toContain("Other asset");
      expect(folderTree?.textContent).not.toContain("Photos");
      expect(smartTree?.textContent).toContain("Saved searches");
      expect(smartTree?.textContent).toContain("Logo favorites");
      expect(smartTree?.textContent).not.toContain("Video picks");
      expect(Array.from(folderTree?.querySelectorAll("mark") ?? [], (match) => match.textContent)).toEqual(["Logo", "Logo", "Logo", "LOGO"]);
      expect(Array.from(smartTree?.querySelectorAll("mark") ?? [], (match) => match.textContent)).toEqual(["Logo"]);
      expect(folderTree?.querySelector('[title="Design"] mark')).toBeNull();
      expect(folderTree?.querySelector('[title="Unmatched child"] mark')).toBeNull();
      expect(smartTree?.querySelector('[title="Saved searches"] mark')).toBeNull();
      for (const match of container.querySelectorAll("mark")) {
        expect(match.classList.contains("bg-transparent")).toBe(true);
        expect(match.classList.contains("text-blue-700")).toBe(true);
        expect(match.classList.contains("dark:text-blue-400")).toBe(true);
      }
      expect(getSearchControlsState()).toBe(itemSearchState);
      expect(dom.window.localStorage.getItem("eagleFolderSectionsOpen")).toBe(savedSections);

      for (const literal of [".", "["]) {
        await setFilter(literal);
        expect(container.querySelector('[aria-label="Folder tree"]')?.textContent).toBe("Release.[draft]");
        expect(container.querySelector('[aria-label="Smart folder tree"]')?.textContent).toBe("Review.[draft]");
        expect(Array.from(container.querySelectorAll("mark"), (match) => match.textContent)).toEqual([literal, literal]);
      }

      await setFilter("no such folder");
      expect(container.querySelector('[data-slot="sidebar-content"] [role="status"]')?.textContent).toContain("No matching folders");
      expect(container.querySelector('[aria-label="Folder tree"]')).toBeNull();
      expect(container.querySelector('[aria-label="Smart folder tree"]')).toBeNull();
      expect(container.querySelector('[aria-label="Folder shortcuts"]')?.textContent).toContain("All");
      expect(container.querySelector('[aria-label="Folder shortcuts"]')?.textContent).toContain("Uncategorized");

      const clearButton = container.querySelector('[aria-label="Clear folder filter"]');
      if (!(clearButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing filter clear button");
      await act(async () => { clearButton.click(); });
      expect(input.value).toBe("");
      expect(container.querySelector("mark")).toBeNull();
      expect(container.querySelector('[data-slot="sidebar-content"] [role="status"]')).toBeNull();
      expect(container.querySelector('[aria-label="Expand Folders section"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Expand Smart Folders section"]')).not.toBeNull();
      expect(container.textContent).not.toContain("Logo studies");

      const folderToggle = container.querySelector('[aria-label="Expand Folders section"]');
      if (!(folderToggle instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder section toggle");
      await act(async () => { folderToggle.click(); });
      expect(container.textContent).toContain("Design");
      expect(container.textContent).toContain("Photos");
      expect(container.textContent).not.toContain("Logo studies");
      expect(container.textContent).not.toContain("Unmatched child");

      await setFilter("photos");
      expect(container.querySelector('[aria-label="Folder tree"]')?.textContent).not.toContain("Design");
      await act(async () => {
        input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      });
      expect(input.value).toBe("");
      expect(container.querySelector('[aria-label="Folder tree"]')?.textContent).toContain("Design");
      expect(container.querySelector("mark")).toBeNull();
      expect(getSearchControlsState()).toBe(itemSearchState);
    } finally {
      if (root) await act(async () => { root?.unmount(); });
      setSearchControlsState(previousSearchState);
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    }
  });

  test("shows only immediate subfolders for root, regular folders, and smart folders", () => {
    const previousSearchState = getSearchControlsState();
    const previousVisible = getSubfoldersVisible();
    const state = {
      ...previousSearchState,
      section: "items" as const,
      selectedFolderId: "",
      selectedSmartFolderId: "",
      folders: [
        {
          id: "design", name: "Design", imageCount: 12,
          children: [
            {
              id: "brand", name: "Brand", imageCount: 8,
              children: [{ id: "logos", name: "Logos", imageCount: 8 }],
            },
            { id: "layouts", name: "Layouts", imageCount: 4 },
          ],
        },
        { id: "photos", name: "Photos", imageCount: 0 },
      ],
      smartFolders: [{
        id: "smart-group", name: "Smart group",
        children: [{ id: "smart-child", name: "Smart child", imageCount: 3 }],
      }],
    };
    const cardsFor = (patch: Partial<typeof previousSearchState> = {}) => {
      setSearchControlsState({ ...state, ...patch });
      const dom = new JSDOM(renderToStaticMarkup(<SubfolderList />));
      const titles = Array.from(dom.window.document.querySelectorAll('#subfolderList button[title]'), (button) => button.getAttribute("title"));
      dom.window.close();
      return titles;
    };
    try {
      setSubfoldersVisible(true);
      expect(cardsFor()).toEqual(["Design", "Photos"]);
      expect(cardsFor({ selectedFolderId: "design" })).toEqual(["Brand", "Layouts"]);
      expect(cardsFor({ selectedFolderId: "brand" })).toEqual(["Logos"]);
      expect(cardsFor({ selectedFolderId: "layouts" })).toEqual([]);
      expect(cardsFor({ selectedFolderId: "missing" })).toEqual([]);
      expect(cardsFor({ selectedSmartFolderId: "smart-group" })).toEqual(["Smart child"]);
      expect(cardsFor({ selectedSmartFolderId: "smart-child" })).toEqual([]);
      expect(cardsFor({ section: "tags" })).toEqual([]);
      expect(cardsFor({ selectedFolderId: "__uncategorized__" })).toEqual([]);
      expect(cardsFor({ selectedFolderId: "__untagged__" })).toEqual([]);
      setSubfoldersVisible(false);
      expect(cardsFor()).toEqual([]);
    } finally {
      setSearchControlsState(previousSearchState);
      setSubfoldersVisible(previousVisible);
    }
  });

  test("opens subfolders above media items and toggles their visibility from the account menu", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    const previousSearchState = getSearchControlsState();
    const previousVisible = getSubfoldersVisible();
    const folderChanged = vi.spyOn(shellActions, "changeFolder").mockImplementation(() => {});
    const smartFolderChanged = vi.spyOn(shellActions, "changeSmartFolder").mockImplementation(() => {});
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    setFolderCoverFetcher(async () => null);
    setSubfoldersVisible(true);
    setSearchControlsState({
      ...previousSearchState,
      section: "items",
      selectedFolderId: "design",
      selectedSmartFolderId: "",
      folders: [{ id: "design", name: "Design", children: [{ id: "brand", name: "Brand", imageCount: 2 }] }],
      smartFolders: [{ id: "smart-group", name: "Smart group", children: [{ id: "smart-child", name: "Smart child", imageCount: 3 }] }],
    });
    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);
      await act(async () => {
        root?.render(<TooltipProvider><ViewerShellLayout hidden={false} /></TooltipProvider>);
      });
      const subfolders = container.querySelector('#subfolderList[aria-label="Subfolders"]');
      const media = container.querySelector('#grid[aria-label="Media items"]');
      expect(subfolders).not.toBeNull();
      expect(media).not.toBeNull();
      expect(Boolean(subfolders!.compareDocumentPosition(media!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      const brand = subfolders?.querySelector('button[title="Brand"]');
      if (!(brand instanceof dom.window.HTMLButtonElement)) throw new Error("Missing subfolder card");
      await act(async () => { brand.click(); });
      expect(folderChanged).toHaveBeenCalledWith({ currentTarget: { value: "brand" } });

      const account = container.querySelector("#authAccountLabel");
      if (!(account instanceof dom.window.HTMLButtonElement)) throw new Error("Missing account menu");
      await act(async () => { account.click(); });
      const tabs = Array.from(container.querySelectorAll('#authAccountMenu [role="tab"]'));
      const off = tabs.find((tab) => tab.textContent?.trim() === "Off");
      const on = tabs.find((tab) => tab.textContent?.trim() === "On");
      if (!(off instanceof dom.window.HTMLButtonElement) || !(on instanceof dom.window.HTMLButtonElement)) throw new Error("Missing subfolder visibility settings");
      expect(on.getAttribute("data-state")).toBe("active");
      await act(async () => { off.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, button: 0 })); });
      expect(container.querySelector("#subfolderList")).toBeNull();
      expect(getSubfoldersVisible()).toBe(false);
      expect(dom.window.localStorage.getItem("eagleShowSubfolders")).toBe("false");
      await act(async () => { on.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, button: 0 })); });
      expect(container.querySelector("#subfolderList")).not.toBeNull();
      expect(dom.window.localStorage.getItem("eagleShowSubfolders")).toBe("true");

      await act(async () => {
        setSearchControlsState({ ...getSearchControlsState(), selectedFolderId: "", selectedSmartFolderId: "smart-group" });
      });
      const smartChild = container.querySelector('#subfolderList button[title="Smart child"]');
      if (!(smartChild instanceof dom.window.HTMLButtonElement)) throw new Error("Missing smart subfolder card");
      await act(async () => { smartChild.click(); });
      expect(smartFolderChanged).toHaveBeenCalledWith({ currentTarget: { value: "smart-child" } });
    } finally {
      if (root) await act(async () => { root?.unmount(); });
      folderChanged.mockRestore();
      smartFolderChanged.mockRestore();
      setFolderCoverFetcher(null);
      setSearchControlsState(previousSearchState);
      setSubfoldersVisible(previousVisible);
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    }
  });

  test("applies and stores selected viewer theme", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    dom.window.matchMedia = (query: string) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    });

    try {
      initializeThemeState();

      expect(getThemeState()).toEqual({ preference: "system", resolved: "dark" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(true);
      expect(dom.window.localStorage.getItem("eagle-media-preview-theme")).toBeNull();

      setThemePreference("light");
      expect(getThemeState()).toEqual({ preference: "light", resolved: "light" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(false);
      expect(dom.window.localStorage.getItem("eagle-media-preview-theme")).toBe("light");

      initializeThemeState();
      expect(getThemeState()).toEqual({ preference: "light", resolved: "light" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(false);

      setThemePreference("system");
      expect(getThemeState()).toEqual({ preference: "system", resolved: "dark" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(true);
      expect(dom.window.localStorage.getItem("eagle-media-preview-theme")).toBe("system");
    } finally {
      setThemePreference("light");
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });

  test("restores and stores the viewer sidebar open state", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.localStorage.setItem("eagleSidebarOpen", "false");

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <TooltipProvider>
            <ViewerShellLayout hidden={false} />
          </TooltipProvider>,
        );
      });

      expect(container.querySelector('[data-slot="sidebar"][data-state="collapsed"]')).not.toBeNull();
      const trigger = container.querySelector("#accountMenuButton");
      if (!(trigger instanceof dom.window.HTMLButtonElement)) throw new Error("Missing sidebar trigger");

      await act(async () => {
        trigger.click();
      });

      expect(dom.window.localStorage.getItem("eagleSidebarOpen")).toBe("true");
      expect(container.querySelector('[data-slot="sidebar"][data-state="expanded"]')).not.toBeNull();
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("resizes the viewer sidebar for the current page session only", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <TooltipProvider>
            <ViewerShellLayout hidden={false} />
          </TooltipProvider>,
        );
      });

      const wrapper = container.querySelector('[data-slot="sidebar-wrapper"]');
      const rail = container.querySelector('[data-slot="sidebar-rail"]');
      if (!(wrapper instanceof dom.window.HTMLElement)) throw new Error("Missing sidebar wrapper");
      if (!(rail instanceof dom.window.HTMLButtonElement)) throw new Error("Missing sidebar rail");
      expect(wrapper.classList.contains("sidebar-width-256")).toBe(true);
      expect(wrapper.getAttribute("style")).toBeNull();
      expect(rail.classList.contains("cursor-col-resize")).toBe(true);
      expect(rail.getAttribute("style")).toBeNull();

      await act(async () => {
        rail.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 256 }));
      });

      expect(dom.window.document.body.classList.contains("cursor-col-resize")).toBe(true);
      expect(dom.window.document.body.classList.contains("select-none")).toBe(true);

      await act(async () => {
        dom.window.dispatchEvent(new dom.window.MouseEvent("pointermove", { bubbles: true, clientX: 500 }));
        dom.window.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true, clientX: 500 }));
      });

      expect(wrapper.classList.contains("sidebar-width-352")).toBe(true);
      expect(dom.window.document.body.classList.contains("cursor-col-resize")).toBe(false);
      expect(dom.window.document.body.classList.contains("select-none")).toBe(false);
      expect(dom.window.localStorage.length).toBe(0);

      await act(async () => {
        root?.unmount();
      });
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <TooltipProvider>
            <ViewerShellLayout hidden={false} />
          </TooltipProvider>,
        );
      });

      const resetWrapper = container.querySelector('[data-slot="sidebar-wrapper"]');
      if (!(resetWrapper instanceof dom.window.HTMLElement)) throw new Error("Missing reset sidebar wrapper");
      expect(resetWrapper.classList.contains("sidebar-width-256")).toBe(true);
      expect(resetWrapper.getAttribute("style")).toBeNull();
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("renders advanced filters as a reusable component", () => {
    const html = renderToStaticMarkup(
      <AdvancedFilters
        filtersOpen
        hasActiveFilters
        selectedExt="jpg"
        selectedRating="3"
      />,
    );

    expect(html).toContain('id="advancedFilters"');
    expect(html).not.toContain('hidden=""');
    expect(html).not.toContain('id="folderSelect"');
    expect(html).not.toContain('id="pageSizeSelect"');
    expect(html).toContain('id="resetFiltersButton"');
    expect(html).toContain('aria-label="Reset filters"');
  });

  test("disables the search filters button in smart folders", () => {
    const html = renderToStaticMarkup(
      <SearchFiltersButton activeFilters={["JPG"]} filtersOpen unavailableLabel="Search and filters aren't available in smart folders" />,
    );

    expect(html).toContain('id="toggleFiltersButton"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("aria-label=\"Search and filters aren&#x27;t available in smart folders\"");
    expect(html).toContain("lucide-search-slash");
    expect(html).not.toContain(" aria-expanded=");
    expect(html).not.toContain(">1<");
    expect(html).toContain("opacity-50");
  });

  test("renders the All Tags search panel as a single search box with its own clear button", () => {
    const closed = renderToStaticMarkup(<TagSearchControls filtersOpen={false} query="" />);
    expect(closed).toContain('id="tagSearchControls"');
    expect(closed).toContain('hidden=""');

    const empty = renderToStaticMarkup(<TagSearchControls filtersOpen query="" />);
    expect(empty).not.toContain('hidden=""');
    expect(empty).toContain('id="tagSearchInput"');
    expect(empty).not.toContain('id="clearTagSearchButton"');
    expect(empty).not.toContain('filter-reset-button');
    expect(empty).not.toContain('id="extSelect"');
    expect(empty).not.toContain('id="ratingSelect"');

    const searching = renderToStaticMarkup(<TagSearchControls filtersOpen query="cat" />);
    expect(searching).toContain('value="cat"');
    expect(searching).toMatch(/id="clearTagSearchButton"[^>]*aria-label="Clear tag search"/);
  });

  test("shows a clear button in the item search only while it has text", () => {
    expect(renderToStaticMarkup(<SearchInput value="" />)).not.toContain('id="clearSearchButton"');
    expect(renderToStaticMarkup(<SearchInput value="alpha" />)).toMatch(/id="clearSearchButton"[^>]*aria-label="Clear search text"/);
  });

  test("renders search input as a reusable component", () => {
    const html = renderToStaticMarkup(<SearchInput value="alpha" />);

    expect(html).toContain('id="searchInput"');
    expect(html).toContain('value="alpha"');
  });

  test("renders preview text as reusable components", () => {
    const meta = renderToStaticMarkup(<PreviewMeta value="JPG - 120 x 80" />);
    const originalName = renderToStaticMarkup(<PreviewOriginalName value="Sample.jpg" />);

    expect(meta).toContain('id="previewMeta"');
    expect(meta).toContain("JPG - 120 x 80");
    expect(originalName).toContain('id="previewOriginalName"');
    expect(originalName).toContain('title="Sample.jpg"');
  });

  test("renders tiles sentinel as a reusable component", () => {
    const html = renderToStaticMarkup(<TilesSentinel hidden={false} text="Loading more" />);

    expect(html).toContain('id="tilesSentinel"');
    expect(html).toContain("Loading more");
    expect(html).not.toContain("hidden");
  });

  test("renders tag suggestions as a reusable component", () => {
    const html = renderToStaticMarkup(<TagSuggestions items={[{ name: "alpha", count: 12 }]} onSelect={() => {}} />);

    expect(html).toContain('class="tag-suggestion ');
    expect(html).toContain('class="tag-suggestion-count ');
  });

  test("renders result state as a reusable component", () => {
    const message = renderToStaticMarkup(<ResultStateView kind="message" text="Loading" />);
    const empty = renderToStaticMarkup(<ResultStateView kind="empty" hasActiveFilters={true} onClearFilters={() => {}} viewMode="grid" />);
    const libraryEmpty = renderToStaticMarkup(<ResultStateView kind="empty" hasActiveFilters={false} onClearFilters={() => {}} viewMode="tiles" />);
    const error = renderToStaticMarkup(
      <ResultStateView
        kind="message"
        className="error"
        title="Media server unavailable"
        text="Couldn't load items from the media server."
        detail="Please try again in a bit."
      />,
    );

    expect(message).toContain("Loading");
    expect(empty).toContain("Clear filters");
    expect(empty).toContain("lucide-search-x");
    expect(empty).toContain("text-muted-foreground");
    expect(empty).toContain('stroke-width="1.5"');
    expect(empty).toContain("min-h-[clamp(280px,calc(100dvh-220px),460px)]");
    expect(libraryEmpty).toContain("Library is empty");
    expect(libraryEmpty).toContain("lucide-inbox");
    expect(libraryEmpty).toContain("min-h-[clamp(280px,calc(100dvh-220px),460px)]");
    expect(error).toContain("Media server unavailable");
    expect(error).toContain("Please try again in a bit.");
  });

  test("renders tiles empty state with dense grid layout", () => {
    const html = renderToStaticMarkup(
      <ResultSurface
        state={{
          kind: "empty",
          hasActiveFilters: true,
          onClearFilters: () => {},
          viewMode: "tiles",
        }}
      />,
    );

    expect(html).toContain("media-tiles");
    expect(html).toContain("flex-wrap");
    expect(html).toContain("max-[540px]:[--tile-scale:0.6]");
    expect(html).toContain("is-empty");
    expect(html).toContain("min-h-[clamp(280px,calc(100dvh-220px),460px)]");
    expect(html).not.toContain("column-count");
  });

  test("renders grid and list empty states with pagination-aware height", () => {
    const grid = renderToStaticMarkup(
      <ResultSurface
        state={{
          kind: "empty",
          hasActiveFilters: true,
          onClearFilters: () => {},
          viewMode: "grid",
        }}
      />,
    );
    const list = renderToStaticMarkup(
      <ResultSurface
        state={{
          kind: "empty",
          hasActiveFilters: true,
          onClearFilters: () => {},
          viewMode: "list",
        }}
      />,
    );

    expect(grid).toContain("media-grid");
    expect(grid).toContain("min-h-[clamp(280px,calc(100dvh-220px),460px)]");
    expect(list).toContain("media-list");
    expect(list).toContain("min-h-[clamp(280px,calc(100dvh-220px),460px)]");
  });

  test("renders result list as reusable media items", () => {
    const html = renderToStaticMarkup(
      <ResultList
        items={[{ id: "item-1", name: "Sample.mp4", ext: "mp4", width: 120, height: 80, duration: 125, star: 4, noThumbnail: false, noPreview: false }]}
        viewMode="tiles"
        onOpenPreview={() => {}}
      />,
    );

    expect(html).toContain("tile-item");
    expect(html).toContain("thumb-loading");
    expect(html).toContain("flex-basis:calc(var(--tile-h, 190px) * var(--tile-scale, 1) * var(--tile-fit, 1) * 1.5)");
    expect(html).toContain("2:05");
    expect(html).not.toContain("file-badge");
    expect(html).not.toContain("rating-star");
  });

  test("uses noThumbnail instead of noPreview to detect unavailable list thumbnails", () => {
    const html = renderToStaticMarkup(
      <ResultList
        items={[
          { id: "item-1", name: "No thumbnail.url", ext: "url", noThumbnail: true },
          { id: "item-2", name: "No preview.url", ext: "url", noPreview: true },
          { id: "item-3", name: "Empty.url", ext: "url", size: 0 },
        ]}
        viewMode="grid"
        onOpenPreview={() => {}}
      />,
    );

    expect(html).not.toContain("/api/items/item-1/thumb");
    expect(html).toContain("/api/items/item-2/thumb");
    expect(html).toContain("/api/items/item-3/thumb");
    expect(html).toContain("thumb-missing");
    expect(html).toContain("NO PREVIEW");
  });

  test.each(["tiles", "grid", "list"] as const)(
    "uses original images in %s view when Eagle reports noThumbnail",
    (viewMode) => {
      const html = renderToStaticMarkup(
        <ResultList
          items={[{ id: "item-1", name: "Small image.png", ext: "png", noThumbnail: true }]}
          viewMode={viewMode}
          onOpenPreview={() => {}}
        />,
      );

      expect(html).toContain('src="/file/item-1"');
      expect(html).not.toContain("/api/items/item-1/thumb");
      expect(html).not.toContain("thumb-missing");
      expect(html).not.toContain("NO PREVIEW");
    },
  );

  test("falls back to the original image when a thumbnail request fails", async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <ResultList
            items={[{ id: "item-1", name: "Small image.png", ext: "png" }]}
            viewMode="grid"
            onOpenPreview={() => {}}
          />,
        );
      });

      const thumbnail = container.querySelector("img");
      if (!(thumbnail instanceof dom.window.HTMLImageElement)) throw new Error("Missing thumbnail image");
      expect(thumbnail.getAttribute("src")).toBe("/api/items/item-1/thumb");

      await act(async () => {
        thumbnail.dispatchEvent(new dom.window.Event("error"));
      });

      const original = container.querySelector("img");
      if (!(original instanceof dom.window.HTMLImageElement)) throw new Error("Missing original image");
      expect(original.getAttribute("src")).toBe("/file/item-1");
      expect(container.textContent).not.toContain("NO PREVIEW");

      await act(async () => {
        original.dispatchEvent(new dom.window.Event("load"));
      });

      expect(original.className).not.toContain("opacity-0");
      expect(container.querySelector("button")?.className).not.toContain("thumb-loading");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    }
  });

  test("staggers appended tiles from their own first column", async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);
      const items = ["a", "b", "c", "d"].map((id) => ({ id, name: `${id}.png`, ext: "png" }));
      const delays = () => Array.from(container.querySelectorAll<HTMLElement>(".tile-item")).map((tile) => tile.style.getPropertyValue("--enter-delay"));

      await act(async () => {
        root?.render(<ResultList items={items.slice(0, 2)} viewMode="tiles" onOpenPreview={() => {}} />);
      });
      expect(delays()).toEqual(["0ms", "90ms"]);

      await act(async () => {
        root?.render(<ResultList items={items} viewMode="tiles" onOpenPreview={() => {}} />);
      });
      expect(delays()).toEqual(["0ms", "90ms", "0ms", "90ms"]);
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    }
  });

  test("renders preview info as reusable detail and action components", () => {
    const details = renderToStaticMarkup(
      <PreviewDetailsPanel
        canEditMetadata
        item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
        folders={[{ id: "folder-1", name: "Folder 1" }]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async (_item, patch) => patch}
      />,
    );
    const actions = renderToStaticMarkup(<PreviewActions canManageLibrary item={{ id: "item-1" }} onToggleTrash={async () => {}} />);
    const deletedActions = renderToStaticMarkup(<PreviewActions canManageLibrary item={{ id: "item-1", isDeleted: true }} onToggleTrash={async () => {}} />);
    const editorActions = renderToStaticMarkup(<PreviewActions canEditMetadata item={{ id: "item-1" }} onToggleTrash={async () => {}} />);
    const nonAdminActions = renderToStaticMarkup(<PreviewActions item={{ id: "item-1" }} />);

    expect(details).toContain("preview-details-section");
    expect(details).toContain("preview-metadata-summary");
    expect(details).toContain("preview-metadata-add");
    expect(details).not.toContain("Metadata");
    expect(details).not.toContain("preview-edit-toggle");
    expect(details).not.toContain("preview-edit-form");
    expect(actions).toContain("preview-admin-actions");
    expect(actions).toContain("direct-file-link");
    expect(actions).toContain("preview-info-cta");
    expect(actions).toContain("preview-admin-menu-trigger");
    expect(actions).toContain("More admin actions");
    expect(actions).toContain("lucide-ellipsis");
    expect(actions).not.toContain("Move to trash");
    expect(deletedActions).toContain("preview-admin-menu-trigger");
    expect(editorActions).toContain("Open file");
    expect(editorActions).toContain("direct-file-link");
    expect(editorActions).not.toContain("preview-admin-menu-trigger");
    expect(editorActions).not.toContain("Move to trash");
    expect(nonAdminActions).toContain("Open file");
    expect(nonAdminActions).toContain("direct-file-link");
    expect(nonAdminActions).not.toContain("preview-admin-menu-trigger");
    expect(nonAdminActions).not.toContain("previewAdminMenu");
  });

  test("opens preview admin actions menu from the ellipsis button", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(<PreviewActions canManageLibrary item={{ id: "item-1" }} onToggleTrash={async () => {}} />);
      });

      const menuButton = container.querySelector(".preview-admin-menu-trigger");
      if (!(menuButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing admin menu button");

      await act(async () => {
        menuButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });

      const menu = container.querySelector("#previewAdminMenu");
      expect(menu).not.toBeNull();
      expect(menu?.getAttribute("role")).toBe("menu");
      expect(menu?.textContent).toContain("Move to trash");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    }
  });

  test("renders preview annotation and url before typed detail rows", () => {
    const details = renderToStaticMarkup(
      <PreviewDetailsPanel
        item={{
          id: "item-1",
          annotation: "Line one\nLine two",
          url: "https://example.com/path/to/a/very/long/reference",
          tags: [],
          folders: [],
        }}
        folders={[]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async (_item, patch) => patch}
      />,
    );

    expect(details).toContain("preview-item-text");
    expect(details).toContain("preview-item-annotation");
    expect(details).toContain("Line one\nLine two");
    expect(details).toContain("preview-item-url");
    expect(details).toContain('title="https://example.com/path/to/a/very/long/reference"');
    expect(details).toContain("lucide-external-link");
    expect(details.indexOf("Line one")).toBeLessThan(details.indexOf("Type"));
    expect(details).not.toContain(">annotation<");
    expect(details).not.toContain(">url<");
  });

  test("adds preview tags immediately from the inline input", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    const savedPatches: Array<{ tags: string[]; folders: string[] }> = [];
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
            folders={[{ id: "folder-1", name: "Folder 1" }]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={() => []}
            onSaveMetadata={async (_item, patch) => {
              savedPatches.push(patch);
              return { tags: ["alpha", "beta-saved"], folders: patch.folders };
            }}
          />,
        );
      });

      const addTagButton = Array.from(container.querySelectorAll(".preview-metadata-add")).find((button) => button.getAttribute("aria-label") === "Add Tags");
      if (!(addTagButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing tag add button");

      await act(async () => {
        addTagButton.click();
      });
      const tagInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "Add tag");
      if (!(tagInput instanceof dom.window.HTMLInputElement)) throw new Error("Missing tag input");

      expect(tagInput.className).toContain("pl-9");
      expect(tagInput.parentElement?.innerHTML).toContain("lucide-tag");
      expect(tagInput.parentElement?.innerHTML).toContain("aria-label=\"Close\"");
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(tagInput, "beta");
        tagInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(savedPatches).toEqual([{ tags: ["alpha", "beta"], folders: ["folder-1"] }]);
      expect(container.textContent).toContain("beta-saved");
      expect(container.querySelector(".preview-metadata-input")).toBeNull();
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("closes preview metadata input without saving", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: [] }}
            folders={[]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={() => []}
            onSaveMetadata={async (_item, patch) => patch}
          />,
        );
      });

      const addTagButton = Array.from(container.querySelectorAll(".preview-metadata-add")).find((button) => button.getAttribute("aria-label") === "Add Tags");
      if (!(addTagButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing tag add button");

      await act(async () => {
        addTagButton.click();
      });

      const tagInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "Add tag");
      if (!(tagInput instanceof dom.window.HTMLInputElement)) throw new Error("Missing tag input");
      const closeButton = container.querySelector(".preview-metadata-input button");
      if (!(closeButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing close input button");

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(tagInput, "beta");
        closeButton.click();
      });

      expect(container.querySelector(".preview-metadata-input")).toBeNull();
      expect(container.textContent).not.toContain("beta");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("locks preview metadata controls while saving an inline delete", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    let resolveSave: ((value: { tags: string[]; folders: string[] }) => void) | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
            folders={[{ id: "folder-1", name: "Folder 1" }]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={() => []}
            onSaveMetadata={async (_item, patch) => new Promise((resolve) => {
              resolveSave = resolve;
            })}
          />,
        );
      });

      const removeButton = container.querySelector(".preview-edit-chip button");
      if (!(removeButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing metadata delete button");

      act(() => {
        removeButton.click();
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.querySelector(".preview-metadata-summary")?.getAttribute("aria-busy")).toBe("true");
      const disabledRemoveButton = container.querySelector(".preview-edit-chip button");
      expect(disabledRemoveButton).toHaveProperty("disabled", true);

      await act(async () => {
        resolveSave?.({ tags: [], folders: ["folder-1"] });
      });

      expect(container.textContent).not.toContain("alpha");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("keeps folder additions limited to existing folder suggestions", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    const savedPatches: Array<{ tags: string[]; folders: string[] }> = [];
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
            folders={[{ id: "folder-1", name: "Folder 1" }]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={() => []}
            onSaveMetadata={async (_item, patch) => {
              savedPatches.push(patch);
              return patch;
            }}
          />,
        );
      });

      const addFolderButton = Array.from(container.querySelectorAll(".preview-metadata-add")).find((button) => button.getAttribute("aria-label") === "Add Folders");
      if (!(addFolderButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder add button");

      await act(async () => {
        addFolderButton.click();
      });

      const folderInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "Search folder");
      if (!(folderInput instanceof dom.window.HTMLInputElement)) {
        throw new Error("Missing category editor controls");
      }

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(folderInput, "New folder");
        folderInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(savedPatches).toEqual([]);
      expect(container.textContent).not.toContain("New folder");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("adds folders immediately from suggestions", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    const savedPatches: Array<{ tags: string[]; folders: string[] }> = [];
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
            folders={[{ id: "folder-1", name: "Folder 1" }, { id: "folder-2", name: "Folder 2" }]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={(query, selected) => [
              { value: "folder-2", label: "Folder 2", meta: query ? "1 item" : "Recent" },
            ].filter((item) => !selected.includes(item.value))}
            onSaveMetadata={async (_item, patch) => {
              savedPatches.push(patch);
              return patch;
            }}
          />,
        );
      });

      const addFolderButton = Array.from(container.querySelectorAll(".preview-metadata-add")).find((button) => button.getAttribute("aria-label") === "Add Folders");
      if (!(addFolderButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder add button");

      await act(async () => {
        addFolderButton.click();
      });

      const folderInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "Search folder");
      if (!(folderInput instanceof dom.window.HTMLInputElement)) throw new Error("Missing folder input");

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(folderInput, "Folder 2");
        folderInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(savedPatches).toEqual([{ tags: ["alpha"], folders: ["folder-1", "folder-2"] }]);
      expect(container.textContent).toContain("Folder 1");
      expect(container.textContent).toContain("Folder 2");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("adds nested zero-count folders from clicked suggestions", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    const savedPatches: Array<{ tags: string[]; folders: string[] }> = [];
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: [] }}
            folders={[{
              id: "parent",
              name: "Parent",
              children: [{ id: "child-zero", name: "Child Zero", imageCount: 0, depth: 1 }],
            }]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={(query) => query === "child-zero" ? [] : [{ value: "child-zero", label: "Child Zero", meta: "", depth: 1 }]}
            onSaveMetadata={async (_item, patch) => {
              savedPatches.push(patch);
              return patch;
            }}
          />,
        );
      });

      const addFolderButton = Array.from(container.querySelectorAll(".preview-metadata-add")).find((button) => button.getAttribute("aria-label") === "Add Folders");
      if (!(addFolderButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder add button");

      await act(async () => {
        addFolderButton.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const childSuggestion = Array.from(container.querySelectorAll("[role=\"option\"]")).find((option) => option.textContent?.includes("Child Zero"));
      if (!(childSuggestion instanceof dom.window.HTMLButtonElement)) throw new Error("Missing child folder suggestion");

      await act(async () => {
        childSuggestion.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(savedPatches).toEqual([{ tags: ["alpha"], folders: ["child-zero"] }]);
      expect(container.textContent).toContain("Parent / Child Zero");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("does not add folder suggestions on pointer down before tap is confirmed", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    const savedPatches: Array<{ tags: string[]; folders: string[] }> = [];
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: [] }}
            folders={[{ id: "folder-1", name: "Folder 1" }]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={() => [{ value: "folder-1", label: "Folder 1", meta: "12 items" }]}
            onSaveMetadata={async (_item, patch) => {
              savedPatches.push(patch);
              return patch;
            }}
          />,
        );
      });

      const addFolderButton = Array.from(container.querySelectorAll(".preview-metadata-add")).find((button) => button.getAttribute("aria-label") === "Add Folders");
      if (!(addFolderButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder add button");

      await act(async () => {
        addFolderButton.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const folderSuggestion = Array.from(container.querySelectorAll("[role=\"option\"]")).find((option) => option.textContent?.includes("Folder 1"));
      if (!(folderSuggestion instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder suggestion");

      await act(async () => {
        const pointerDown = new dom.window.Event("pointerdown", { bubbles: true, cancelable: true });
        Object.defineProperty(pointerDown, "pointerType", { value: "touch" });
        folderSuggestion.dispatchEvent(pointerDown);
        const pointerMove = new dom.window.Event("pointermove", { bubbles: true, cancelable: true });
        Object.defineProperty(pointerMove, "pointerType", { value: "touch" });
        Object.defineProperty(pointerMove, "clientY", { value: 60 });
        folderSuggestion.dispatchEvent(pointerMove);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(savedPatches).toEqual([]);

      await act(async () => {
        folderSuggestion.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(savedPatches).toEqual([{ tags: ["alpha"], folders: ["folder-1"] }]);
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("removes folders immediately from metadata chips", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <PreviewDetailsPanel
            canEditMetadata
            item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
            folders={[
              { id: "folder-1", name: "Folder 1" },
              { id: "folder-2", name: "Folder 2" },
              { id: "folder-3", name: "Folder 3" },
            ]}
            detailRows={[{ label: "Type", value: "Image" }]}
            onTagSuggestions={() => []}
            onFolderSuggestions={() => [{ value: "folder-3", label: "Folder 3", meta: "Recent" }]}
            onSaveMetadata={async (_item, patch) => patch}
          />,
        );
      });

      const folderChip = Array.from(container.querySelectorAll(".preview-edit-chip")).find((chip) => chip.textContent?.includes("Folder 1"));
      const removeButton = folderChip?.querySelector("button");
      if (!(removeButton instanceof dom.window.HTMLButtonElement)) throw new Error("Missing folder remove button");

      await act(async () => {
        removeButton.click();
      });

      expect(container.textContent).not.toContain("Folder 1");
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });

  test("renders preview metadata as read-only chips without edit permission", () => {
    const details = renderToStaticMarkup(
      <PreviewDetailsPanel
        item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
        folders={[{ id: "folder-1", name: "Folder 1" }]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async (_item, patch) => patch}
      />,
    );

    expect(details).toContain("Tags");
    expect(details).toContain("alpha");
    expect(details).toContain("Folders");
    expect(details).toContain("Folder 1");
    expect(details).not.toContain("preview-edit-form");
  });

  test("keeps read-only metadata rows visible when tags and folders are empty", () => {
    const details = renderToStaticMarkup(
      <PreviewDetailsPanel
        item={{ id: "item-1", tags: [], folders: [] }}
        folders={[]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async (_item, patch) => patch}
      />,
    );

    expect(details).toContain("Tags");
    expect(details).toContain("Folders");
    expect(details).not.toContain("No tags");
    expect(details).not.toContain("No folders");
    expect(details).not.toContain("preview-metadata-add");
  });

  test("deduplicates preview metadata chips from existing item values", () => {
    const readOnly = renderToStaticMarkup(
      <PreviewDetailsPanel
        item={{ id: "item-1", tags: ["alpha", " alpha "], folders: ["folder-1", "folder-1"] }}
        folders={[{ id: "folder-1", name: "Folder 1" }]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async (_item, patch) => patch}
      />,
    );
    const editable = renderToStaticMarkup(
      <PreviewDetailsPanel
        canEditMetadata
        item={{ id: "item-1", tags: ["alpha", " alpha "], folders: ["folder-1", "folder-1"] }}
        folders={[{ id: "folder-1", name: "Folder 1" }]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async (_item, patch) => patch}
      />,
    );

    expect(readOnly.match(/>alpha</g)?.length).toBe(1);
    expect(readOnly.match(/>Folder 1</g)?.length).toBe(1);
    expect(editable.match(/>alpha</g)?.length).toBe(1);
    expect(editable.match(/>Folder 1</g)?.length).toBe(1);
  });

  test("renders preview body media variants", () => {
    const video = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.mp4", ext: "mp4" }} kind="video" />);
    const audio = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.mp3", ext: "mp3", noThumbnail: false, noPreview: false }} kind="audio" />);
    const image = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.jpg" }} kind="image" />);
    const text = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.txt" }} kind="text" />);
    const pdf = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.pdf", ext: "pdf" }} kind="pdf" />);
    const url = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.url", ext: "url", url: "https://example.test/page", noThumbnail: false, noPreview: false }} kind="url" />);
    const unsupported = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", ext: "avi", noThumbnail: false, noPreview: false }} kind="unsupported" />);

    expect(video).toContain("video-player");
    expect(video).toContain("Playback position");
    expect(video).not.toContain("Sample.mp4");
    expect(video).toContain("transition-opacity");
    expect(video).toContain("cursor-pointer");
    expect(video).toContain('aria-label="Video player"');
    expect(video).toContain('aria-label="Full screen"');
    expect(video).toContain('aria-label="Volume"');
    expect(video).toContain('aria-label="Playback speed 1x"');
    expect(audio).toContain("audio-player-shell");
    expect(audio).toContain("audio-artwork");
    expect(audio).toContain("Sample");
    expect(audio).not.toContain("Sample.mp3");
    expect(audio).toContain("Repeat");
    expect(image).toContain("image-viewport");
    expect(image).toContain("image-toolbar");
    expect(text).toContain("text-preview");
    expect(pdf).toContain("pdf-preview");
    expect(pdf).toContain('src="/file/item-1"');
    expect(pdf).toContain('title="Sample.pdf"');
    expect(url).toContain("url-thumb-preview");
    expect(url).toContain('src="/api/items/item-1/thumb"');
    expect(url).toContain('href="https://example.test/page"');
    expect(url).toContain("このページを開く");
    expect(url).not.toContain("<iframe");
    expect(unsupported).toContain("unsupported-thumb");
  });

  test("does not request url preview thumbnails when Eagle reports noThumbnail", () => {
    const url = renderToStaticMarkup(
      <PreviewBody
        item={{ id: "item-1", name: "Sample.url", ext: "url", noThumbnail: true, url: "https://example.test/page" }}
        kind="url"
      />,
    );
    const noPreviewUrl = renderToStaticMarkup(
      <PreviewBody
        item={{ id: "item-2", name: "No preview.url", ext: "url", noPreview: true, url: "https://example.test/no-preview" }}
        kind="url"
      />,
    );

    expect(url).toContain("url-thumb-preview");
    expect(url).not.toContain("/api/items/item-1/thumb");
    expect(noPreviewUrl).toContain("/api/items/item-2/thumb");
    expect(url).toContain("No thumbnail");
    expect(noPreviewUrl).not.toContain("No thumbnail");
    expect(url).toContain('href="https://example.test/page"');
    expect(url).toContain("このページを開く");
  });

  test("does not request preview thumbnails when Eagle reports noThumbnail", () => {
    const audio = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.mp3", ext: "mp3", noThumbnail: true }} kind="audio" />);
    const imageThumb = renderToStaticMarkup(<PreviewBody item={{ id: "item-2", name: "Sample.psd", noThumbnail: true }} kind="image" srcKind="thumb" />);
    const unsupported = renderToStaticMarkup(<PreviewBody item={{ id: "item-3", ext: "avi", noThumbnail: true }} kind="unsupported" />);

    expect(audio).not.toContain("/api/items/item-1/thumb");
    expect(imageThumb).not.toContain("/api/items/item-2/thumb");
    expect(imageThumb).toContain("Thumbnail is unavailable");
    expect(unsupported).not.toContain("/api/items/item-3/thumb");
    expect(unsupported).toContain("AVI is not supported");
  });

  test("renders rating stars as reusable static and interactive controls", () => {
    const statik = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 3 }} />);
    const interactive = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive onSelect={() => {}} />);
    const disabled = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive disabled onSelect={() => {}} />);
    const saving = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive disabled disabledLabel="Saving rating" onSelect={() => {}} />);

    expect(statik).toContain("rating-star");
    expect(statik).toContain("rating-star-static");
    expect(statik).toContain("cursor-default");
    expect(statik).not.toContain("cursor-pointer");
    expect(statik).toContain('data-active="true"');
    expect(statik).toContain('aria-label="Rating (read only)"');
    expect(statik).not.toContain("title=");
    expect(interactive).toContain('aria-pressed="true"');
    expect(interactive).toContain("cursor-pointer");
    expect(interactive).toContain('aria-label="Rating"');
    expect(interactive).toContain("Rating 2");
    expect(disabled).toContain("disabled");
    expect(saving).toContain('aria-label="Saving rating"');
    expect(saving).toContain('title="Saving rating"');
  });
});

describe("tag list", () => {
  test("renders starred tags above grouped and ungrouped tags", () => {
    setTagListState({
      error: "",
      status: "ready",
      overview: {
        tags: [
          { name: "tree", imageCount: 1 },
          { name: "vtuber", imageCount: 3 },
          { name: "@work: xxx", imageCount: 0 },
        ],
        groups: [{ id: "g1", name: "Nature", tags: ["tree"] }],
        starred: [{ name: "@work: xxx" }],
      },
    });

    const html = renderToStaticMarkup(<TagList />);

    expect(html).not.toContain('id="tagSearchInput"');
    expect(html.indexOf("Starred Tags")).toBeLessThan(html.indexOf("Nature"));
    expect(html.indexOf("Nature")).toBeLessThan(html.indexOf("Ungrouped"));
    expect(html.indexOf("@work: xxx")).toBeLessThan(html.indexOf("tree"));
    expect(html.indexOf("tree")).toBeLessThan(html.indexOf("vtuber"));
    expect(html).toContain("3 items");
    expect(html).toContain("1 item<");
    expect(html.match(/aria-label="Starred"/g)).toHaveLength(1);
  });

  test("shows load errors and empty libraries", () => {
    setTagListState({ error: "Eagle is offline", overview: null, status: "error" });
    expect(renderToStaticMarkup(<TagList />)).toContain("Eagle is offline");

    setTagListState({ error: "", overview: { tags: [], groups: [], starred: [] }, status: "ready" });
    expect(renderToStaticMarkup(<TagList />)).toContain("No tags yet");
  });

  test("collapses tag sections and remembers the choice", async () => {
    const dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
    const testGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousNode = globalThis.Node;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousIS_REACT_ACT_ENVIRONMENT = testGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.localStorage.setItem("eagleTagSectionsCollapsed", JSON.stringify(["ungrouped"]));
    setTagListState({
      error: "",
      status: "ready",
      overview: {
        tags: [{ name: "tree", imageCount: 1 }, { name: "vtuber", imageCount: 3 }],
        groups: [{ id: "g1", name: "Nature", tags: ["tree"] }],
        starred: [],
      },
    });

    const { createRoot } = await import("react-dom/client");
    let root: import("react-dom/client").Root | null = null;
    try {
      const container = dom.window.document.querySelector("#root");
      if (!(container instanceof dom.window.HTMLElement)) throw new Error("Missing test root");
      root = createRoot(container);

      await act(async () => {
        root?.render(<TagList />);
      });

      expect(container.textContent).toContain("tree");
      expect(container.textContent).not.toContain("vtuber");
      expect(container.querySelector('[aria-label="Expand Ungrouped"]')?.getAttribute("aria-expanded")).toBe("false");

      const natureToggle = container.querySelector('[aria-label="Collapse Nature"]');
      if (!(natureToggle instanceof dom.window.HTMLButtonElement)) throw new Error("Missing Nature toggle");
      await act(async () => {
        natureToggle.click();
      });

      expect(container.textContent).not.toContain("tree");
      expect(container.textContent).toContain("Nature1");
      expect(JSON.parse(dom.window.localStorage.getItem("eagleTagSectionsCollapsed") || "[]")).toEqual(["ungrouped", "group:g1"]);

      const ungroupedToggle = container.querySelector('[aria-label="Expand Ungrouped"]');
      if (!(ungroupedToggle instanceof dom.window.HTMLButtonElement)) throw new Error("Missing Ungrouped toggle");
      await act(async () => {
        ungroupedToggle.click();
      });

      expect(container.textContent).toContain("vtuber");
      expect(JSON.parse(dom.window.localStorage.getItem("eagleTagSectionsCollapsed") || "[]")).toEqual(["group:g1"]);
    } finally {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Node = previousNode;
      globalThis.HTMLElement = previousHTMLElement;
      testGlobal.IS_REACT_ACT_ENVIRONMENT = previousIS_REACT_ACT_ENVIRONMENT;
    }
  });
});
