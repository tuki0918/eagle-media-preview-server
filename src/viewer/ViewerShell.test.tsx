import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  CardTemplate,
  FolderOptions,
  LoginView,
  PageButtons,
  Pager,
  PreviewActions,
  PreviewBody,
  PreviewDialog,
  PreviewDetailsPanel,
  RatingStars,
  ResultList,
  ResultStateView,
  ResultsStatus,
  SearchControls,
  TagChips,
  TagSuggestions,
  ViewerAppShell,
  ViewerShellLayout,
} from "./ViewerShell";
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
  "resetFiltersButtonHost",
  "resetFiltersButton",
  "toggleFiltersButtonHost",
  "toggleFiltersButton",
  "advancedFilters",
  "resultsStatusHost",
  "grid",
  "tilesSentinel",
  "resultCount",
  "tilesViewButton",
  "gridViewButton",
  "tableViewButton",
  "prevButton",
  "nextButton",
  "pagerHost",
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

  test("exports independently renderable shell components", () => {
    const components = [
      { Component: LoginView, expectedId: "loginView" },
      { Component: SearchControls, expectedId: "advancedFilters" },
      { Component: ResultsStatus, expectedId: "resultCount" },
      { Component: Pager, expectedId: "pageButtons" },
      { Component: PreviewDialog, expectedId: "previewDialog" },
      { Component: CardTemplate, expectedId: "cardTemplate" },
      { Component: ViewerShellLayout, expectedId: "viewerShell" },
    ] as const;

    for (const { Component, expectedId } of components) {
      expect(renderToStaticMarkup(<Component />)).toContain(`id="${expectedId}"`);
    }
  });

  test("renders page buttons as a reusable component", () => {
    const html = renderToStaticMarkup(<PageButtons current={2} pages={[1, 2, "...", 8]} onSelect={() => {}} />);

    expect(html).toContain('data-active="true"');
    expect(html).toContain('class="page-ellipsis"');
  });

  test("renders tag chips as a reusable component", () => {
    const html = renderToStaticMarkup(<TagChips tags={["alpha"]} onRemove={() => {}} />);

    expect(html).toContain('class="tag-chip"');
    expect(html).toContain("Remove tag alpha");
  });

  test("renders folder options as a reusable component", () => {
    const html = renderToStaticMarkup(<FolderOptions folders={[{ id: "folder-1", name: "Folder 1", imageCount: 8, depth: 1 }]} />);

    expect(html).toContain("All folders");
    expect(html).toContain("Uncategorized");
    expect(html).toContain("  Folder 1 (8)");
  });

  test("renders tag suggestions as a reusable component", () => {
    const html = renderToStaticMarkup(<TagSuggestions items={[{ name: "alpha", count: 12 }]} onSelect={() => {}} />);

    expect(html).toContain('class="tag-suggestion"');
    expect(html).toContain('class="tag-suggestion-count"');
  });

  test("renders result state as a reusable component", () => {
    const message = renderToStaticMarkup(<ResultStateView kind="message" text="Loading" />);
    const empty = renderToStaticMarkup(<ResultStateView kind="empty" hasActiveFilters={true} onClearFilters={() => {}} />);

    expect(message).toContain("Loading");
    expect(empty).toContain("Clear filters");
  });

  test("renders result list as reusable media items", () => {
    const html = renderToStaticMarkup(
      <ResultList
        items={[{ id: "item-1", name: "Sample.jpg", ext: "jpg", width: 120, height: 80, star: 4 }]}
        viewMode="tiles"
        onOpenPreview={() => {}}
      />,
    );

    expect(html).toContain('class="tile-item thumb-loading"');
    expect(html).toContain('data-ext="jpg"');
    expect(html).toContain('data-active="true"');
  });

  test("renders preview info as reusable detail and action components", () => {
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
    const actions = renderToStaticMarkup(<PreviewActions item={{ id: "item-1" }} />);

    expect(details).toContain('class="preview-details-section"');
    expect(details).toContain('class="preview-edit-form"');
    expect(actions).toContain('class="direct-file-link preview-info-cta"');
  });

  test("renders preview body media variants", () => {
    const image = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.jpg" }} kind="image" />);
    const text = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", name: "Sample.txt" }} kind="text" />);
    const unsupported = renderToStaticMarkup(<PreviewBody item={{ id: "item-1", ext: "avi" }} kind="unsupported" />);

    expect(image).toContain('class="image-viewport"');
    expect(image).toContain('class="image-toolbar"');
    expect(text).toContain('class="text-preview"');
    expect(unsupported).toContain('class="unsupported-thumb"');
  });

  test("renders rating stars as reusable static and interactive controls", () => {
    const statik = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 3 }} />);
    const interactive = renderToStaticMarkup(<RatingStars className="rating-control" item={{ star: 2 }} interactive onSelect={() => {}} />);

    expect(statik).toContain('class="rating-star rating-star-static"');
    expect(statik).toContain('data-active="true"');
    expect(interactive).toContain('aria-pressed="true"');
    expect(interactive).toContain("Rating 2");
  });
});
