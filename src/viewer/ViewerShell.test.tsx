import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  CardTemplate,
  LoginView,
  PageButtons,
  Pager,
  PreviewDialog,
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
});
