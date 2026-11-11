import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { EagleItem } from "../types";
import { COMPACT_LIST_MAX_WIDTH, setListAreaWidth } from "../listColumns";
import { ResultList } from "./ResultList";
import { ViewerDock } from "./ViewerDock";

const item: EagleItem = {
  id: "item-1",
  name: "Clip.mp4",
  ext: "mp4",
  size: 2048,
  width: 1920,
  height: 1080,
  duration: 65,
  star: 3,
  tags: ["a"],
  // Local noon, so the shown date is the same in every time zone.
  modificationTime: new Date(2026, 0, 2, 12).getTime(),
  btime: new Date(2025, 5, 6, 12).getTime(),
  annotation: "Line one\nline   two",
  url: "https://www.example.com/source/page",
};

function headers(html: string) {
  return [...html.matchAll(/<span[^>]*data-list-col="([a-z]+)"[^>]*>([A-Za-z]+)<\/span>/g)]
    .filter((match) => !match[0].includes("row-tags-cell flex"))
    .map((match) => match[2]);
}

test("list view shows the default columns in their usual order", () => {
  const html = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["name", "rating", "tags", "type", "size", "dimensions", "duration", "modified"]} />);
  expect(headers(html)).toEqual(["Tags", "Type", "Size", "Dimensions", "Duration", "Modified"]);
  expect(html).toContain("rating-star");
  expect(html).toContain("--list-cols:minmax(196px,2.2fr) minmax(120px,2fr)");
  expect(html).not.toContain("Annotation");
  expect(html).not.toContain("media-row-compact");
});

test("the thumbnail and name share the first cell", () => {
  const html = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["name", "type"]} />);
  expect(html).toMatch(/list-lead [^>]*><span class="w-11 shrink-0 text-center">Item<\/span><span class="row-name-cell[^>]*>Name<\/span><\/span>/);
  expect(html).toMatch(/list-lead [^>]*><button[^>]*row-thumb[\s\S]*?<\/button><span class="row-name-cell[^>]*><span class="row-file-name[^>]*>Clip\.mp4<\/span><\/span><\/span>/);
});

test("narrow lists use the fixed compact layout, whatever the columns", () => {
  setListAreaWidth(600);
  try {
    const html = renderToStaticMarkup(<ResultList items={[item, { id: "b", name: "Plain.png", ext: "png" }]} viewMode="list" onOpenPreview={() => {}} listColumns={["type"]} />);
    expect(html).not.toContain("media-row-header");
    expect(html).not.toContain("data-list-col");
    expect(html.match(/media-row-compact/g)?.length).toBe(2);
    // Name with its rating stars underneath, for every item.
    expect(html).toMatch(/row-name-cell[^>]*><span class="row-file-name[^>]*>Clip\.mp4<\/span><div class="rating-control/);
    expect(html.match(/class="rating-control/g)?.length).toBe(2);
    expect(html).not.toContain("★3");
    // Details in two lines; the resolution or length only where there is room.
    expect(html).toMatch(/list-compact-details[^>]*><span>MP4 · 2\.0 KB<span class="list-compact-wide-only"> · 1:05<\/span><\/span><span title="[^"]+">2026\/01\/02<\/span><\/span>/);
    expect(html).toMatch(/list-compact-details[^>]*><span>PNG<\/span><\/span>/);
  } finally {
    setListAreaWidth(Number.POSITIVE_INFINITY);
  }
});

test("a list too narrow for the chosen columns shows them as a compact list", () => {
  setListAreaWidth(900);
  try {
    const fits = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["name", "rating", "tags", "type", "size", "dimensions", "duration", "modified"]} />);
    expect(fits).not.toContain("media-row-compact");
    const tooMany = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["name", "rating", "tags", "size", "dimensions", "modified", "created", "annotation", "url"]} />);
    expect(tooMany).toContain("media-row-compact-columns");
    expect(tooMany).not.toContain("media-row-header");
    expect(tooMany).toMatch(/row-file-name[^>]*>Clip\.mp4<\/span><div class="rating-control/);
    // Only the chosen values: file details on one line, dates on the next.
    expect(tooMany).toMatch(/list-compact-details[^>]*><span>2\.0 KB · 1920 x 1080<\/span><span>Modified 2026\/01\/02 · Created 2025\/06\/06<\/span><\/span>/);
    expect(tooMany).toContain('data-list-col="tags"');
    expect(tooMany).toContain('title="Line one line two"');
    expect(tooMany).toContain('href="https://www.example.com/source/page"');

    const nameless = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["size", "dimensions", "modified", "created", "annotation", "url", "tags", "type"]} />);
    expect(nameless).toContain("media-row-compact-columns");
    expect(nameless).not.toContain("row-file-name");
    expect(nameless).not.toContain("rating-control");
  } finally {
    setListAreaWidth(Number.POSITIVE_INFINITY);
  }
});

test("without the name, the lead cell keeps the rating, or just the thumbnail", () => {
  const ratingOnly = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["rating", "type"]} />);
  expect(ratingOnly).toContain(">Rating</span>");
  expect(ratingOnly).toContain("rating-star");
  expect(ratingOnly).not.toContain("row-file-name");

  const none = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["type"]} />);
  expect(none).not.toContain("row-name-cell");
  expect(none).not.toContain("rating-star");
  expect(none).toContain('aria-label="Play Clip.mp4"');
});

test("list view renders only the chosen columns, including the extra ones", () => {
  const html = renderToStaticMarkup(<ResultList items={[item]} viewMode="list" onOpenPreview={() => {}} listColumns={["name", "created", "annotation", "url", "type"]} />);
  expect(headers(html)).toEqual(["Type", "Created", "Annotation", "URL"]);
  expect(html).not.toContain("rating-star");
  expect(html).not.toContain(">Tags<");
  expect(html).toContain('title="Line one line two"');
  expect(html).toContain('href="https://www.example.com/source/page" target="_blank" rel="noopener noreferrer">example.com/source/page</a>');
  expect(html).toMatch(/created-cell"[^>]*>2025\/06\/06</);
});

test("non-web URLs and missing values render as plain text", () => {
  const html = renderToStaticMarkup(
    <ResultList items={[{ id: "x", name: "x.png", ext: "png", url: "javascript:alert(1)" }, { id: "y", name: "y.png", ext: "png" }]} viewMode="list" onOpenPreview={() => {}} listColumns={["url", "annotation", "created"]} />,
  );
  expect(html).not.toContain("<a ");
  expect(html).toContain(">javascript:alert(1)</span>");
  expect(html.match(/>-<\/span>/g)?.length).toBe(5);
});

test("the dock offers the column picker in list view and the zoom slider elsewhere", () => {
  const list = renderToStaticMarkup(<ViewerDock viewMode="list" />);
  expect(list).toContain('id="listColumnsButton"');
  expect(list).not.toContain('id="zoomSlider"');
  const grid = renderToStaticMarkup(<ViewerDock viewMode="grid" />);
  expect(grid).not.toContain('id="listColumnsButton"');
  expect(grid).toContain('id="zoomSlider"');
});

test("narrow lists have no column picker, since the compact layout has no columns", () => {
  setListAreaWidth(COMPACT_LIST_MAX_WIDTH - 1);
  try {
    expect(renderToStaticMarkup(<ViewerDock viewMode="list" />)).not.toContain('id="listColumnsButton"');
  } finally {
    setListAreaWidth(Number.POSITIVE_INFINITY);
  }
  setListAreaWidth(COMPACT_LIST_MAX_WIDTH);
  try {
    expect(renderToStaticMarkup(<ViewerDock viewMode="list" />)).toContain('id="listColumnsButton"');
  } finally {
    setListAreaWidth(Number.POSITIVE_INFINITY);
  }
});
