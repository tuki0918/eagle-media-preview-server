import { JSDOM } from "jsdom";
import { afterEach, expect, test, vi } from "vitest";
import { revealMetadataSuggestions } from "./revealMetadataSuggestions";

let dom: JSDOM;
afterEach(() => {
  vi.unstubAllGlobals();
  dom?.window.close();
});

function setup({ mobile = true, inputTop = 550, listBottom = 820, viewportHeight = 700 } = {}) {
  dom = new JSDOM('<aside class="preview-info"><button class="preview-info-handle"></button><input><div role="listbox"></div></aside>');
  const panel = dom.window.document.querySelector<HTMLElement>("aside")!;
  const input = dom.window.document.querySelector<HTMLInputElement>("input")!;
  const list = dom.window.document.querySelector<HTMLElement>('[role="listbox"]')!;
  const bounds = (top: number, bottom: number) => ({ top, bottom, height: bottom - top } as DOMRect);
  panel.getBoundingClientRect = () => bounds(96, 844);
  panel.querySelector("button")!.getBoundingClientRect = () => bounds(96, 140);
  input.getBoundingClientRect = () => bounds(inputTop, inputTop + 36);
  list.getBoundingClientRect = () => bounds(inputTop + 40, listBottom);
  const scrollBy = vi.fn();
  panel.scrollBy = scrollBy;
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: mobile }),
    innerHeight: 844,
    visualViewport: { offsetTop: 0, height: viewportHeight },
  });
  return { input, list, scrollBy };
}

test("reveals the suggestions within the keyboard-visible viewport by scrolling the panel", () => {
  const { input, list, scrollBy } = setup();
  revealMetadataSuggestions(input, list);
  expect(scrollBy).toHaveBeenCalledWith({ top: 136, behavior: "auto" });
});

test("includes bottom breathing room even when the list itself is already visible", () => {
  const { input, list, scrollBy } = setup({ listBottom: 690 });
  revealMetadataSuggestions(input, list);
  expect(scrollBy).toHaveBeenCalledWith({ top: 6, behavior: "auto" });
});

test("keeps the input below the sticky handle when the whole list cannot fit", () => {
  const { input, list, scrollBy } = setup({ inputTop: 180, viewportHeight: 400 });
  revealMetadataSuggestions(input, list);
  expect(scrollBy).toHaveBeenCalledWith({ top: 32, behavior: "auto" });
});

test("does not scroll when the suggestions are already visible", () => {
  const { input, list, scrollBy } = setup({ listBottom: 650 });
  revealMetadataSuggestions(input, list);
  expect(scrollBy).not.toHaveBeenCalled();
});

test("does not change desktop scrolling", () => {
  const { input, list, scrollBy } = setup({ mobile: false });
  revealMetadataSuggestions(input, list);
  expect(scrollBy).not.toHaveBeenCalled();
});

test("brings an input hidden under the sticky handle back into view", () => {
  const { input, list, scrollBy } = setup({ inputTop: 120, listBottom: 400 });
  revealMetadataSuggestions(input, list);
  expect(scrollBy).toHaveBeenCalledWith({ top: -28, behavior: "auto" });
});
