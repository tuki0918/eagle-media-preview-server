import { afterEach, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { setThemePreference } from "./themeState";

let dom: JSDOM | undefined;
afterEach(() => {
  vi.unstubAllGlobals();
  dom?.window.close();
});

// index.html's tags: one per device setting.
const INDEX_HEAD = `<!doctype html><head>
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0f1012" media="(prefers-color-scheme: dark)" />
</head>`;

function themeColorTags() {
  return Array.from(dom!.window.document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
    .map((tag) => ({ content: tag.content, media: tag.getAttribute("media") }));
}

test("the theme-color tag follows the viewer's theme, not the device's setting", () => {
  dom = new JSDOM(INDEX_HEAD, { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);

  setThemePreference("dark");
  expect(themeColorTags()).toEqual([{ content: "#0f1012", media: null }]);
  const darkTag = dom.window.document.querySelector('meta[name="theme-color"]');

  setThemePreference("light");
  expect(themeColorTags()).toEqual([{ content: "#ffffff", media: null }]);
  // A new tag, so an installed app on iOS notices the change.
  expect(dom.window.document.querySelector('meta[name="theme-color"]')).not.toBe(darkTag);
});
