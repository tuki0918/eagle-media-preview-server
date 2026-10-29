import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { PreviewActions } from "./components/PreviewInfo";
import { setConnectedLibraryId } from "./api";
import { directFileUrl, isStandaloneApp } from "./fileLinks";

afterEach(() => vi.unstubAllGlobals());

function mockWindow(displayMode: boolean, iosStandalone = false) {
  vi.stubGlobal("window", {
    location: { href: "https://library.local/" },
    navigator: { standalone: iosStandalone },
    matchMedia: (query: string) => ({ matches: query === "(display-mode: standalone)" && displayMode }),
  });
}

test("regular browsers keep direct file viewing", () => {
  mockWindow(false);
  const html = renderToStaticMarkup(<PreviewActions item={{ id: "item 1" }} />);
  expect(html).toContain('href="https://library.local/file/item%201"');
  expect(html).toContain("Open file");
  expect(html).not.toContain("download=");
});

test("direct file links carry the connected library id", () => {
  setConnectedLibraryId("lib-a");
  try {
    expect(directFileUrl({ id: "item 1" }, "https://library.local/")).toBe("https://library.local/file/item%201?library=lib-a");
  } finally {
    setConnectedLibraryId("");
  }
});

test.each([[true, false], [false, true]])("standalone apps disable direct file viewing (%s, %s)", (displayMode, iosStandalone) => {
  mockWindow(displayMode, iosStandalone);
  expect(isStandaloneApp()).toBe(true);
  const html = renderToStaticMarkup(<PreviewActions item={{ id: "item 1" }} />);
  expect(html).toMatch(/<button[^>]*disabled=""/);
  expect(html).toContain("Open file");
  expect(html).not.toContain("Unavailable in PWA");
  expect(html).not.toContain("href=");
  expect(html).not.toContain("Download file");
  const adminHtml = renderToStaticMarkup(<PreviewActions canManageLibrary item={{ id: "item 1" }} />);
  expect(adminHtml).toMatch(/<button[^>]*disabled=""/);
  expect(adminHtml).toContain("Open file");
  expect(adminHtml).toContain("More admin actions");
  expect(adminHtml).toMatch(/<button(?![^>]*\sdisabled=)[^>]*aria-label="More admin actions"/);
});
