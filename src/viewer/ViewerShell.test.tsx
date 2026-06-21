import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
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
} from "./ViewerShell";
import { resetPreviewDialogState, setPreviewDialogState } from "./previewDialogState";
import { setImageOverlayControlsVisible } from "./imageOverlayState";
import { setVideoOverlayControlsVisible } from "./videoOverlayState";
import { MEDIA_TYPE_OPTIONS, PAGE_SIZE_OPTIONS, RATING_OPTIONS } from "./shellConfig";
import { setLoginConnectState } from "./loginConnectState";
import { setLibraryFooterName } from "./libraryFooterState";
import { setSearchControlsState } from "./searchControlsState";
import { getThemeState, initializeThemeState, setThemePreference } from "./themeState";

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
  "pageSizeSelect",
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

    for (const type of MEDIA_TYPE_OPTIONS) {
      expect(html).toContain(`value="${type}"`);
      expect(html).toContain(type.toUpperCase());
    }

    for (const rating of RATING_OPTIONS) {
      expect(html).toContain(`value="${rating}"`);
      expect(html).toContain(`★ ${rating}`);
    }

    for (const pageSize of PAGE_SIZE_OPTIONS) {
      expect(html).toContain(`value="${pageSize}"`);
      expect(html).toContain(`${pageSize} items`);
    }
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
    expect(login).not.toContain("Use an account configured in the Eagle plugin panel.");
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
    expect(html).toContain("min-[900px]:hidden");
    expect(html).toContain("min-[900px]:col-start-1");
    expect(html).toContain("m15 18-6-6 6-6");
    expect(html).not.toContain("preview-original-name-section");
    expect(html).not.toContain("preview-original-meta");
    expect(html).not.toContain("Click to rate");
  });

  test("renders preview info button with mobile info and desktop panel icons", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain('id="toggleInfoPreview"');
    expect(html).toContain("min-[900px]:hidden");
    expect(html).toContain("hidden min-[900px]:block");
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
    expect(html).toContain("min-[900px]:relative");
    expect(html).toContain("min-[900px]:col-start-2");
    expect(html).toContain("min-[900px]:row-span-2");
    expect(html).toContain("min-[900px]:translate-x-0");
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
    expect(dialog).toContain("rounded-lg");
    expect(dialog).not.toContain("bg-[rgba(15,23,42,0.48)]");
    expect(body).toContain("image-toolbar");
    expect(body).toMatch(/image-toolbar[^"]*right-\[calc\(14px\+env\(safe-area-inset-right\)\)\]/);
    expect(body).toContain("100%");
    expect(body).not.toMatch(/image-toolbar[^"]*left-1\/2/);
    expect(body).not.toMatch(/image-toolbar[^"]*-translate-x-1\/2/);
    expect(body).toContain("bg-card");
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
    const html = renderToStaticMarkup(<FolderOptions folders={[{ id: "folder-1", name: "Folder 1", imageCount: 8, depth: 1 }]} />);

    expect(html).toContain("All folders");
    expect(html).toContain("Uncategorized");
    expect(html).toContain("  Folder 1 (8)");
  });

  test("renders library footer as a reusable component", () => {
    const html = renderToStaticMarkup(<LibraryFooter name="My Library - Eagle 4.0" />);

    expect(html).toContain('id="libraryFooterName"');
    expect(html).toContain("My Library - Eagle 4.0");
    expect(html).not.toContain("logoutButton");
    expect(html).not.toContain("authFooterMessage");
  });

  test("renders authenticated account controls in a responsive side menu", () => {
    setSearchControlsState({
      allFoldersTotal: 99,
      filtersOpen: false,
      folders: [
        { id: "parent", name: "Parent", imageCount: 10, depth: 0 },
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
    setLibraryFooterName("My Library - Eagle 4.0.0");
    const html = renderAccountSideMenu();

    expect(html).toContain('id="accountSideMenu"');
    expect(html).toContain("My Library");
    expect(html).toContain("Eagle 4.0.0");
    expect(html).not.toContain("Media Preview");
    expect(html).toContain('id="authAccountLabel"');
    expect(html).toContain('id="authUserLabel"');
    expect(html).toContain('id="authRoleLabel"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("lucide-user-round");
    expect(html).toContain("Smart Folders");
    expect(html).toContain("Folders");
    expect(html).toContain("Theme");
    expect(html.indexOf("Smart Folders")).toBeLessThan(html.indexOf("Folders"));
    expect(html).toContain('id="themeModeGroup"');
    expect(html).toContain('aria-label="Theme color"');
    expect(html).toContain("Light");
    expect(html).toContain("Dark");
    expect(html).not.toContain("Auto");
    expect(html).not.toContain("lucide-monitor");
    expect(html).toContain("lucide-sun");
    expect(html).toContain("lucide-moon");
    expect(html.indexOf("Theme")).toBeGreaterThan(html.indexOf("Folders"));
    expect(html).toContain('data-slot="tabs-list"');
    expect(html).toContain('data-slot="tabs-trigger"');
    expect(html).toContain('aria-label="Folder tree"');
    expect(html).toContain("All folders");
    expect(html).toContain("All folders (99)");
    expect(html).toContain("Uncategorized");
    expect(html).toContain("Large Images");
    expect(html).toContain("Large Images (42)");
    expect(html).toContain("Needs Review");
    expect(html).toContain("lucide-folder-cog");
    expect(html).toContain("lucide-layout-grid");
    expect(html).not.toContain("No folders loaded");
    expect(html).toContain("Parent");
    expect(html).toContain("Child");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("calc(0.5rem + 1 * 0.875rem)");
    expect(html).toContain('data-slot="sidebar"');
    expect(html).toContain('data-variant="inset"');
    expect(html).toContain('data-sidebar="menu-button"');
    expect(html).toContain("data-active:bg-transparent");
    expect(html).toContain("data-active:text-sidebar-foreground");
    expect(html).toContain("text-sidebar-primary");
    expect(html).toContain("group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]");
    expect(html).toContain("group-data-[collapsible=icon]:!size-8");
    expect(html).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(html).toContain("shrink-0 px-2 pb-2 pt-1");
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

      expect(getThemeState()).toEqual({ preference: "dark", resolved: "dark" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(true);
      expect(dom.window.localStorage.getItem("eagle-media-preview-theme")).toBe("dark");

      setThemePreference("light");
      expect(getThemeState()).toEqual({ preference: "light", resolved: "light" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(false);
      expect(dom.window.localStorage.getItem("eagle-media-preview-theme")).toBe("light");

      initializeThemeState();
      expect(getThemeState()).toEqual({ preference: "light", resolved: "light" });
      expect(dom.window.document.documentElement.classList.contains("dark")).toBe(false);
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

  test("renders advanced filters as a reusable component", () => {
    const html = renderToStaticMarkup(
      <AdvancedFilters
        filtersOpen
        hasActiveFilters
        selectedExt="jpg"
        selectedLimit={60}
        selectedRating="3"
      />,
    );

    expect(html).toContain('id="advancedFilters"');
    expect(html).not.toContain('hidden=""');
    expect(html).not.toContain('id="folderSelect"');
    expect(html).toContain('id="pageSizeSelect"');
    expect(html).toContain('id="resetFiltersButton"');
    expect(html).toContain('aria-label="Reset filters"');
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
    const empty = renderToStaticMarkup(<ResultStateView kind="empty" hasActiveFilters={true} onClearFilters={() => {}} />);
    const libraryEmpty = renderToStaticMarkup(<ResultStateView kind="empty" hasActiveFilters={false} onClearFilters={() => {}} />);
    const error = renderToStaticMarkup(
      <ResultStateView
        kind="message"
        className="error"
        title="Eagle connection lost"
        text="The preview server could not reach Eagle while loading items."
        detail="Make sure Eagle is running."
      />,
    );

    expect(message).toContain("Loading");
    expect(empty).toContain("Clear filters");
    expect(libraryEmpty).toContain("Library is empty");
    expect(error).toContain("Eagle connection lost");
    expect(error).toContain("Make sure Eagle is running.");
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
    expect(html).toContain("grid");
    expect(html).toContain("[grid-auto-flow:dense]");
    expect(html).toContain("[grid-auto-rows:4px]");
    expect(html).toContain("max-[540px]:grid-cols-3");
    expect(html).toContain("is-empty");
    expect(html).not.toContain("column-count");
  });

  test("renders result list as reusable media items", () => {
    const html = renderToStaticMarkup(
      <ResultList
        items={[{ id: "item-1", name: "Sample.mp4", ext: "mp4", width: 120, height: 80, duration: 125, star: 4 }]}
        viewMode="tiles"
        onOpenPreview={() => {}}
      />,
    );

    expect(html).toContain("tile-item");
    expect(html).toContain("thumb-loading");
    expect(html).toContain("grid-row-end:span");
    expect(html).toContain("2:05");
    expect(html).not.toContain("file-badge");
    expect(html).not.toContain("rating-star");
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
        tagInput.onkeydown?.(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
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
        folderInput.onkeydown?.(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
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
        folderInput.onkeydown?.(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
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
    const audio = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.mp3", ext: "mp3" }} kind="audio" />);
    const image = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.jpg" }} kind="image" />);
    const text = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.txt" }} kind="text" />);
    const pdf = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.pdf", ext: "pdf" }} kind="pdf" />);
    const unsupported = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", ext: "avi" }} kind="unsupported" />);

    expect(video).toContain("video-player");
    expect(video).toContain("Playback position");
    expect(video).toContain("Sample");
    expect(video).not.toContain("Sample.mp4");
    expect(video).toContain("transition-opacity");
    expect(video).toContain("cursor-pointer");
    expect(video).toContain("Toggle video controls");
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
    expect(unsupported).toContain("unsupported-thumb");
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
