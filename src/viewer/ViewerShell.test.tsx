import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
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

  test("renders selected view mode with blue active styling", () => {
    const html = renderToStaticMarkup(<ResultsStatus total={12} viewMode="grid" />);

    expect(html).toContain('id="gridViewButton"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-blue-600");
    expect(html).toContain("hover:bg-blue-700");
  });

  test("renders login connection controls as reusable components", () => {
    const button = renderToStaticMarkup(<ConnectButton disabled />);
    const message = renderToStaticMarkup(<ConnectMessage isError message="No Eagle" />);

    expect(button).toContain('id="connectButton"');
    expect(button).toContain("disabled");
    expect(message).toContain('id="connectMessage"');
    expect(message).toContain("No Eagle");
    expect(message).toContain("text-app-danger");
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
    expect(body).toContain("bg-[rgba(255,255,255,0.92)]");
    expect(body).toContain("text-app-text-soft");
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
        onSaveMetadata={async () => {}}
      />,
    );
    const actions = renderToStaticMarkup(<PreviewActions item={{ id: "item-1" }} />);

    expect(details).toContain("preview-details-section");
    expect(details).toContain("preview-edit-form");
    expect(actions).toContain("direct-file-link");
    expect(actions).toContain("preview-info-cta");
  });

  test("renders preview metadata as read-only chips without edit permission", () => {
    const details = renderToStaticMarkup(
      <PreviewDetailsPanel
        item={{ id: "item-1", tags: ["alpha"], folders: ["folder-1"] }}
        folders={[{ id: "folder-1", name: "Folder 1" }]}
        detailRows={[{ label: "Type", value: "Image" }]}
        onTagSuggestions={() => []}
        onFolderSuggestions={() => []}
        onSaveMetadata={async () => {}}
      />,
    );

    expect(details).toContain("Tags");
    expect(details).toContain("alpha");
    expect(details).toContain("Categories");
    expect(details).toContain("Folder 1");
    expect(details).not.toContain("preview-edit-form");
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

    expect(statik).toContain("rating-star");
    expect(statik).toContain("rating-star-static");
    expect(statik).toContain('data-active="true"');
    expect(interactive).toContain('aria-pressed="true"');
    expect(interactive).toContain("Rating 2");
  });
});
