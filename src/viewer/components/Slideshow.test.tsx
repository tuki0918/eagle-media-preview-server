import { StrictMode, act } from "react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SlideshowDialog, SlideshowPlayer } from "./Slideshow";
import type { EagleItem } from "../types";
import type { SlideshowQuery, SlideshowSettings } from "../slideshow";

const query: SlideshowQuery = { query: "filtered", tags: ["alpha"], folderId: "folder-1", smartFolderId: "", ext: "", rating: "" };
const settings: SlideshowSettings = { seconds: 3, effect: "fade", loop: false };
let dom: JSDOM;
let root: import("react-dom/client").Root;
let container: HTMLElement;
let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
let close: ReturnType<typeof vi.fn<() => void>>;
let fullscreen: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://library.local/" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  play = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(dom.window.HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(dom.window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  fullscreen = vi.fn().mockRejectedValue(new Error("Fullscreen unavailable"));
  dom.window.HTMLElement.prototype.requestFullscreen = fullscreen;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const { createRoot } = await import("react-dom/client");
  container = dom.window.document.querySelector<HTMLElement>("#root")!;
  root = createRoot(container);
  close = vi.fn();
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.window.close();
});

function serve(items: EagleItem[]) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const params = new URLSearchParams(String(input).split("?")[1]);
    const offset = Number(params.get("offset"));
    return new Response(JSON.stringify({ items: items.slice(offset, offset + 30), total: items.length }), { headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
async function renderPlayer(options = settings) {
  await act(async () => { root.render(<StrictMode><SlideshowPlayer query={query} settings={options} onClose={close} onFullscreen={() => {}} /></StrictMode>); });
}
function button(label: string) {
  const element = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
async function loaded(selector = "img") {
  await act(async () => { container.querySelector(selector)!.dispatchEvent(new dom.window.Event(selector === "img" ? "load" : "canplay", { bubbles: true })); });
}
async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

test("counts image display time after loading and preserves remaining time through pause and resume", async () => {
  vi.useFakeTimers();
  serve([{ id: "1", ext: "jpg" }, { id: "2", ext: "jpg" }]);
  await renderPlayer();
  await tick(4000);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/1");
  await loaded();
  await tick(1000);
  await click("Pause slideshow");
  await tick(10000);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/1");
  await click("Resume slideshow");
  await tick(1999);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/1");
  await tick(1);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/2");
  await loaded();
  await tick(2999);
  expect(container.textContent).not.toContain("Slideshow complete");
  await tick(1);
  expect(container.textContent).toContain("Slideshow complete");
});

test("waits for video and audio endings, and provides a user gesture when autoplay is blocked", async () => {
  vi.useFakeTimers();
  serve([{ id: "v", ext: "mp4" }, { id: "a", ext: "mp3", noThumbnail: true }, { id: "i", ext: "jpg" }]);
  play.mockRejectedValueOnce(new Error("Autoplay blocked"));
  await renderPlayer();
  await loaded("video");
  expect(container.textContent).toContain("Tap to play");
  await click("Resume slideshow");
  expect(container.textContent).not.toContain("Tap to play");
  await tick(5000);
  expect(container.querySelector("video")).not.toBeNull();
  await act(async () => { container.querySelector("video")!.dispatchEvent(new dom.window.Event("ended")); });
  await loaded("audio");
  expect(play).toHaveBeenCalled();
  await tick(5000);
  expect(container.querySelector("audio")).not.toBeNull();
  await act(async () => { container.querySelector("audio")!.dispatchEvent(new dom.window.Event("ended")); });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/i");
});

test("moves across pagination and back without changing the browser URL", async () => {
  const fetcher = serve(Array.from({ length: 32 }, (_, index) => ({ id: String(index), ext: "jpg" })));
  const url = window.location.href;
  await renderPlayer();
  for (let index = 0; index < 31; index += 1) await click("Next slide");
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/31");
  await click("Previous slide");
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/30");
  expect(fetcher.mock.calls.some(([url]) => String(url).includes("offset=30"))).toBe(true);
  expect(window.location.href).toBe(url);
});

test("loops back to the first image", async () => {
  vi.useFakeTimers();
  serve([{ id: "first", ext: "jpg" }]);
  await renderPlayer({ ...settings, loop: true });
  await loaded();
  await tick(3000);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/first");
  expect(container.textContent).not.toContain("Slideshow complete");
  await loaded();
  await tick(2999);
  expect(container.textContent).not.toContain("Slideshow complete");
});

test("pauses on a media error and allows skipping the failed item", async () => {
  vi.useFakeTimers();
  serve([{ id: "bad", ext: "jpg" }, { id: "good", ext: "jpg" }]);
  await renderPlayer();
  await act(async () => { container.querySelector("img")!.dispatchEvent(new dom.window.Event("error")); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to play");
  await tick(10000);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/bad");
  const skip = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === "Skip")!;
  await act(async () => { skip.click(); });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/good");
});

test("opens settings, saves the choices, falls back from unavailable fullscreen, and closes", async () => {
  serve([{ id: "1", ext: "jpg" }]);
  await act(async () => { root.render(<StrictMode><SlideshowDialog query={query} onClose={close} /></StrictMode>); });
  expect(document.querySelector("dialog")?.open).toBe(true);
  const seconds = document.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { seconds.value = "10"; seconds.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const start = Array.from(document.querySelectorAll("button")).find((element) => element.textContent === "Start slideshow")!;
  await act(async () => { start.click(); });
  expect(fullscreen).toHaveBeenCalledOnce();
  expect(document.querySelector('[aria-label="Slideshow player"]')).not.toBeNull();
  expect(JSON.parse(window.localStorage.getItem("eagleSlideshowSettings")!).seconds).toBe(10);
  await click("Close slideshow");
  expect(close).toHaveBeenCalledOnce();
});
