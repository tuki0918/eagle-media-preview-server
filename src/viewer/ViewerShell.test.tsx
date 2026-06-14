import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ViewerAppShell } from "./ViewerShell";
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

    expect(html).toContain('class="media-card"');
    expect(html).toContain('class="thumb-button"');
    expect(html).toContain('class="pager"');
    expect(html).toContain('class="rating-control"');
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
});
