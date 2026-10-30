import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { PdfPreview } from "./SimplePreviews";

afterEach(() => vi.unstubAllGlobals());

function mockWindow({ touch = false, standalone = false } = {}) {
  vi.stubGlobal("window", {
    location: { href: "https://library.local/" },
    navigator: {},
    matchMedia: (query: string) => ({
      matches: (query === "(hover: none) and (pointer: coarse)" && touch) || (query === "(display-mode: standalone)" && standalone),
    }),
  });
}

test("touch browsers offer opening the PDF directly, since inline previews show only the first page", () => {
  mockWindow({ touch: true });
  const html = renderToStaticMarkup(<PdfPreview item={{ id: "item 1", name: "doc.pdf" }} />);
  expect(html).toContain("<iframe");
  expect(html).toContain('href="https://library.local/file/item%201"');
  expect(html).toContain("Open file");
});

test("desktop browsers keep the inline PDF viewer only", () => {
  mockWindow();
  const html = renderToStaticMarkup(<PdfPreview item={{ id: "item 1", name: "doc.pdf" }} />);
  expect(html).toContain("<iframe");
  expect(html).not.toContain("Open file");
  expect(html).not.toContain("PDF is not supported");
});

test("touch standalone apps show the first page with an unsupported notice instead of the open link", () => {
  mockWindow({ touch: true, standalone: true });
  const html = renderToStaticMarkup(<PdfPreview item={{ id: "item 1", name: "doc.pdf" }} />);
  expect(html).toContain("<iframe");
  expect(html).toContain("PDF is not supported in this app.");
  expect(html).not.toContain("Open file");
  expect(html).not.toContain("href=");
});

test("desktop standalone apps keep the inline PDF viewer only", () => {
  mockWindow({ standalone: true });
  const html = renderToStaticMarkup(<PdfPreview item={{ id: "item 1", name: "doc.pdf" }} />);
  expect(html).not.toContain("PDF is not supported");
});
