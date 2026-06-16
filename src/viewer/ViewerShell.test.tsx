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
  "folderSelect",
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
  "resultCount",
  "tilesViewButton",
  "gridViewButton",
  "tableViewButton",
  "prevButton",
  "nextButton",
  "pageButtons",
  "libraryFooterName",
  "previewDialog",
  "previewMeta",
  "previewBody",
  "previewOriginalName",
  "previewRating",
  "previewDetails",
  "previewActions",
  "toggleInfoPreview",
  "fullscreenPreview",
  "closePreview",
  "backPreview",
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

    expect(html).toContain('id="gridViewButton"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-primary");
    expect(html).toContain("text-primary-foreground");
  });

  test("renders login connection controls as reusable components", () => {
    const button = renderToStaticMarkup(<ConnectButton disabled />);
    const message = renderToStaticMarkup(<ConnectMessage isError message="No Eagle" />);

    expect(button).toContain('id="connectButton"');
    expect(button).toContain("disabled");
    expect(message).toContain('id="connectMessage"');
    expect(message).toContain("No Eagle");
    expect(message).toContain("text-destructive");
    expect(message).toContain("text-left");
    expect(message).toContain("lucide-circle-alert");
    expect(message).toContain('role="alert"');
    expect(message).not.toContain("fixed bottom-");
  });

  test("exports independently renderable shell components", () => {
    const components = [
      { Component: LoginView, expectedId: "loginView" },
      { Component: SearchControls, expectedId: "advancedFilters" },
      { Component: ResultsStatus, expectedId: "resultCount" },
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
      expect(renderToStaticMarkup(<Component />)).toContain(`id="${expectedId}"`);
    }
  });

  test("renders preview close as a top-left back action without a visible swipe handle", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain("fixed inset-0");
    expect(html).toContain("m-0");
    expect(html).toContain("max-h-none");
    expect(html).toContain("max-w-none");
    expect(html).not.toContain("preview-close-swipe-handle");
    expect(html).not.toContain("Swipe down to close preview");
    expect(html).toContain('id="closePreview"');
    expect(html).toContain("left-2.5");
    expect(html).toContain("m15 18-6-6 6-6");
  });

  test("renders preview drawer button with responsive panel icons", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain('id="toggleInfoPreview"');
    expect(html).toContain("hidden max-[540px]:block");
    expect(html).toContain("block max-[540px]:hidden");
    expect(html).toContain('d="M15 3v18"');
    expect(html).toContain('d="m10 15-3-3 3-3"');
    expect(html).toContain('d="M3 9h18"');
    expect(html).toContain('d="m9 14 3-3 3 3"');
  });

  test("renders desktop preview info drawer from the right edge", () => {
    const html = renderToStaticMarkup(<PreviewDialog />);

    expect(html).toContain("preview-info");
    expect(html).toContain("right-0");
    expect(html).toContain("z-[6]");
    expect(html).toContain("border-l");
    expect(html).toContain("translate-x-full");
    expect(html).toContain("shadow-none");
  });

  test("renders video preview layout edge to edge under overlay controls", () => {
    setPreviewDialogState({ infoOpen: false, mode: "video", open: true });
    const html = renderToStaticMarkup(<PreviewDialog />);
    resetPreviewDialogState();

    expect(html).toContain("h-dvh max-h-dvh bg-[#05070a]");
    expect(html).not.toContain("pt-[calc(60px+env(safe-area-inset-top))]");
    expect(html).toContain("fixed left-2.5 top-[calc(10px+env(safe-area-inset-top))]");
    expect(html).toContain("rounded-full");
    expect(html).toContain("bg-[rgba(15,23,42,0.48)]");
    expect(html).toContain('id="fullscreenPreview"');
  });

  test("renders image preview actions with media-style controls", () => {
    setPreviewDialogState({ infoOpen: false, mode: "image", open: true });
    const dialog = renderToStaticMarkup(<PreviewDialog />);
    resetPreviewDialogState();
    const body = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.jpg" }} kind="image" />);

    expect(dialog).toContain("rounded-full");
    expect(dialog).toContain("bg-[rgba(15,23,42,0.48)]");
    expect(body).toContain("image-toolbar");
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

    expect(dialog).toContain("pointer-events-none opacity-0");
    expect(dialog).toContain('id="closePreview"');
    expect(dialog).toContain('id="toggleInfoPreview"');
    expect(body).toContain("image-toolbar");
    expect(body).toContain("pointer-events-none opacity-0");
  });

  test("hides video overlay buttons when video controls are toggled off", () => {
    setPreviewDialogState({ infoOpen: false, mode: "video", open: true });
    setVideoOverlayControlsVisible(false);
    const html = renderToStaticMarkup(<PreviewDialog />);
    resetPreviewDialogState();
    setVideoOverlayControlsVisible(true);

    expect(html).toContain("pointer-events-none opacity-0");
    expect(html).toContain('id="closePreview"');
    expect(html).toContain('id="toggleInfoPreview"');
    expect(html).toContain('id="fullscreenPreview"');
  });

  test("renders page buttons as a reusable component", () => {
    const html = renderToStaticMarkup(<PageButtons current={2} pages={[1, 2, "...", 8]} onSelect={() => {}} />);

    expect(html).toContain('data-active="true"');
    expect(html).toContain("page-ellipsis");
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
    setLoginConnectState({
      authenticated: true,
      authRequired: true,
      disabled: false,
      isError: false,
      message: "",
      user: { role: "editor", username: "ed" },
    });
    const html = renderAccountSideMenu();

    expect(html).toContain('id="accountMenuButton"');
    expect(html).toContain('id="accountSideMenu"');
    expect(html).toContain('id="authAccountLabel"');
    expect(html).toContain('id="authUserLabel"');
    expect(html).toContain('id="authRoleLabel"');
    expect(html).toContain('id="logoutButton"');
    expect(html).toContain('data-slot="sidebar"');
    expect(html).toContain('data-variant="sidebar"');
    expect(html).toContain('data-sidebar="menu-button"');
    expect(html).toContain("grid-cols-[auto_minmax(0,1fr)_auto_auto]");
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
  });

  test("renders advanced filters as a reusable component", () => {
    const html = renderToStaticMarkup(
      <AdvancedFilters
        filtersOpen
        folders={[{ id: "folder-1", name: "Folder 1", imageCount: 8, depth: 0 }]}
        selectedExt="jpg"
        selectedFolderId="folder-1"
        selectedLimit={60}
        selectedRating="3"
      />,
    );

    expect(html).toContain('id="advancedFilters"');
    expect(html).not.toContain("hidden");
    expect(html).toContain('id="folderSelect"');
    expect(html).toContain('id="pageSizeSelect"');
    expect(html).toContain('value="folder-1"');
    expect(html).toContain("Folder 1 (8)");
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

    expect(message).toContain("Loading");
    expect(empty).toContain("Clear filters");
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
    const actions = renderToStaticMarkup(<PreviewActions item={{ id: "item-1" }} />);

    expect(details).toContain("preview-details-section");
    expect(details).toContain("preview-edit-form");
    expect(details).toContain("preview-edit-save");
    expect(details).toContain("disabled");
    expect(actions).toContain("direct-file-link");
    expect(actions).toContain("preview-info-cta");
  });

  test("disables preview metadata save after successful save", async () => {
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

      const saveButton = container.querySelector(".preview-edit-save");
      const tagInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "Add tag");
      const form = container.querySelector("form");
      if (!(saveButton instanceof dom.window.HTMLButtonElement) || !(tagInput instanceof dom.window.HTMLInputElement) || !(form instanceof dom.window.HTMLFormElement)) {
        throw new Error("Missing metadata editor controls");
      }

      expect(saveButton.disabled).toBe(true);
      expect(saveButton.getAttribute("aria-label")).toBe("No metadata changes");
      expect(saveButton.title).toBe("No metadata changes");
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(tagInput, "beta");
        tagInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      });

      expect(saveButton.disabled).toBe(false);
      expect(saveButton.getAttribute("aria-label")).toBe("Save metadata");
      await act(async () => {
        form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(savedPatches).toEqual([{ tags: ["alpha", "beta"], folders: ["folder-1"] }]);
      expect(saveButton.disabled).toBe(true);
      expect(container.querySelector(".preview-edit-status")?.textContent).toBe("Saved");
      expect(container.textContent).toContain("beta-saved");
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

  test("locks preview metadata controls while saving", async () => {
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

      const saveButton = container.querySelector(".preview-edit-save");
      const removeButton = container.querySelector(".preview-edit-chip button");
      const tagInput = Array.from(container.querySelectorAll("input")).find((input) => input.placeholder === "Add tag");
      const form = container.querySelector("form");
      if (!(saveButton instanceof dom.window.HTMLButtonElement)
        || !(removeButton instanceof dom.window.HTMLButtonElement)
        || !(tagInput instanceof dom.window.HTMLInputElement)
        || !(form instanceof dom.window.HTMLFormElement)) {
        throw new Error("Missing metadata editor controls");
      }

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(tagInput, "beta");
        tagInput.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      });

      expect(saveButton.disabled).toBe(false);
      act(() => {
        form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(form.getAttribute("aria-busy")).toBe("true");
      expect(saveButton.disabled).toBe(true);
      expect(saveButton.textContent).toBe("Saving");
      expect(saveButton.getAttribute("aria-label")).toBe("Saving metadata");
      expect(saveButton.title).toBe("Saving metadata");
      expect(tagInput.disabled).toBe(true);
      expect(removeButton.disabled).toBe(true);

      await act(async () => {
        resolveSave?.({ tags: ["alpha", "beta"], folders: ["folder-1"] });
      });

      expect(form.getAttribute("aria-busy")).toBe("false");
      expect(tagInput.disabled).toBe(false);
      expect(removeButton.disabled).toBe(false);
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
    expect(details).toContain("Categories");
    expect(details).toContain("Folder 1");
    expect(details).not.toContain("preview-edit-form");
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
    const unsupported = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", ext: "avi" }} kind="unsupported" />);

    expect(video).toContain("video-player");
    expect(video).toContain("Playback position");
    expect(video).toContain("transition-opacity");
    expect(video).toContain("cursor-pointer");
    expect(video).toContain("Toggle video controls");
    expect(audio).toContain("audio-player-shell");
    expect(audio).toContain("audio-artwork");
    expect(audio).toContain("Playback speed");
    expect(image).toContain("image-viewport");
    expect(image).toContain("image-toolbar");
    expect(text).toContain("text-preview");
    expect(unsupported).toContain("unsupported-thumb");
  });

  test("renders rating stars as reusable static and interactive controls", () => {
    const statik = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 3 }} />);
    const interactive = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive onSelect={() => {}} />);
    const disabled = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive disabled onSelect={() => {}} />);
    const saving = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive disabled disabledLabel="Saving rating" onSelect={() => {}} />);

    expect(statik).toContain("rating-star");
    expect(statik).toContain("rating-star-static");
    expect(statik).toContain('data-active="true"');
    expect(statik).toContain('aria-label="Rating (read only)"');
    expect(statik).toContain('title="Rating 1 (read only)"');
    expect(interactive).toContain('aria-pressed="true"');
    expect(interactive).toContain('aria-label="Rating"');
    expect(interactive).toContain("Rating 2");
    expect(disabled).toContain("disabled");
    expect(saving).toContain('aria-label="Saving rating"');
    expect(saving).toContain('title="Saving rating"');
  });
});
