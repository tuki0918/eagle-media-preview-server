import { StrictMode, act } from "react";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SlideshowDialog, SlideshowPlayer } from "./Slideshow";
import type { EagleItem } from "../types";
import type { SlideshowQuery, SlideshowSettings } from "../slideshow";

const query: SlideshowQuery = { query: "filtered", tags: ["alpha"], folderId: "folder-1", smartFolderId: "", ext: "", rating: "" };
const settings: SlideshowSettings = { seconds: 3, effect: "fade", loop: false, showTitle: true };
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
  await act(async () => { root.render(<StrictMode><SlideshowPlayer query={query} settings={options} onClose={close} /></StrictMode>); });
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
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  const seconds = document.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { seconds.value = "10"; seconds.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const titleToggle = Array.from(document.querySelectorAll<HTMLLabelElement>("label")).find((label) => label.textContent?.includes("Show title"))!.querySelector<HTMLInputElement>("input")!;
  expect(titleToggle.checked).toBe(true);
  await act(async () => { titleToggle.click(); });
  const start = Array.from(document.querySelectorAll("button")).find((element) => element.textContent === "START")!;
  await act(async () => { start.click(); });
  expect(fullscreen).toHaveBeenCalledOnce();
  expect(document.querySelector('[aria-label="Slideshow player"]')).not.toBeNull();
  expect(JSON.parse(window.localStorage.getItem("eagleSlideshowSettings")!).seconds).toBe(10);
  expect(JSON.parse(window.localStorage.getItem("eagleSlideshowSettings")!).showTitle).toBe(false);
  await click("Close slideshow");
  expect(close).toHaveBeenCalledOnce();
});

test("shows loading immediately after START until the first request and image are ready", async () => {
  let resolvePage!: (response: Response) => void;
  const page = new Promise<Response>((resolve) => { resolvePage = resolve; });
  vi.stubGlobal("fetch", vi.fn(async () => (await page).clone()));
  await act(async () => { root.render(<StrictMode><SlideshowDialog query={query} onClose={close} /></StrictMode>); });
  const start = Array.from(document.querySelectorAll("button")).find((element) => element.textContent === "START")!;
  await act(async () => { start.click(); });
  expect(fullscreen).toHaveBeenCalledOnce();
  const player = document.querySelector('[aria-label="Slideshow player"]')!;
  expect(player.getAttribute("aria-busy")).toBe("true");
  expect(player.querySelector('[role="status"]')?.textContent).toContain("Loading slide");
  expect(player.querySelector("img")).toBeNull();

  await act(async () => {
    resolvePage(new Response(JSON.stringify({ items: [{ id: "first", ext: "jpg" }], total: 1 })));
  });
  expect(player.getAttribute("aria-busy")).toBe("true");
  expect(player.querySelector('[role="status"]')?.textContent).toContain("Loading slide");
  const image = player.querySelector("img")!;
  expect(image.getAttribute("src")).toBe("/file/first");
  await act(async () => { image.dispatchEvent(new dom.window.Event("load")); });
  expect(player.getAttribute("aria-busy")).toBe("false");
  expect(player.querySelector('[aria-label="Loading slide"]')).toBeNull();
});

test("replaces startup loading with a retryable error when the initial request fails", async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("Server unavailable"));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => { root.render(<StrictMode><SlideshowDialog query={query} onClose={close} /></StrictMode>); });
  const start = Array.from(document.querySelectorAll("button")).find((element) => element.textContent === "START")!;
  await act(async () => { start.click(); });
  const player = document.querySelector('[aria-label="Slideshow player"]')!;
  expect(player.getAttribute("aria-busy")).toBe("false");
  expect(player.querySelector('[aria-label="Loading slide"]')).toBeNull();
  expect(player.querySelector('[role="alert"]')?.textContent).toContain("Server unavailable");

  fetcher.mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "retry", ext: "jpg" }], total: 1 })));
  const retry = Array.from(player.querySelectorAll("button")).find((element) => element.textContent === "Retry")!;
  await act(async () => { retry.click(); });
  expect(player.getAttribute("aria-busy")).toBe("true");
  expect(player.querySelector('[aria-label="Loading slide"]')).not.toBeNull();
  expect(player.querySelector('[role="alert"]')).toBeNull();
  await act(async () => { player.querySelector("img")!.dispatchEvent(new dom.window.Event("load")); });
  expect(player.getAttribute("aria-busy")).toBe("false");
  expect(player.querySelector('[aria-label="Loading slide"]')).toBeNull();
});

test("can hide the title while retaining the current position", async () => {
  serve([{ id: "1", name: "Hidden title", ext: "jpg" }]);
  await renderPlayer({ ...settings, showTitle: false });
  await loaded();
  const header = container.querySelector("header")!;
  expect(header.textContent).not.toContain("Hidden title");
  expect(header.textContent).toContain("1 / 1");
});

async function pointer(pointerType: string, type = "pointermove") {
  await act(async () => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, relatedTarget: document.body });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    Object.defineProperty(event, "movementX", { value: type === "pointermove" ? 1 : 0 });
    container.querySelector('[aria-label="Slideshow player"]')!.dispatchEvent(event);
  });
}

test("keeps the title and position visible while revealing other controls on hover and touch", async () => {
  vi.useFakeTimers();
  serve([{ id: "1", name: "Always visible", ext: "jpg" }]);
  await renderPlayer();
  await loaded();
  const footer = container.querySelector("footer")!;
  expect(container.querySelector("header")?.textContent).toContain("Always visible");
  expect(container.querySelector("header")?.textContent).toContain("1 / 1");
  expect(footer.getAttribute("aria-hidden")).toBe("true");
  expect(button("Close slideshow").className).toContain("invisible");
  expect(container.querySelector('[aria-label="Fullscreen slideshow"]')).toBeNull();
  await pointer("mouse");
  expect(footer.getAttribute("aria-hidden")).toBe("false");
  await pointer("mouse", "pointerout");
  expect(footer.getAttribute("aria-hidden")).toBe("true");
  await pointer("touch", "pointerup");
  expect(footer.getAttribute("aria-hidden")).toBe("false");
  await pointer("touch", "pointerup");
  expect(footer.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector("header")?.textContent).toContain("Always visible");
});

test("shows a synthetic image timeline, supports seeking, and does not consume time while paused", async () => {
  vi.useFakeTimers();
  serve([{ id: "1", ext: "jpg" }, { id: "2", ext: "jpg" }]);
  await renderPlayer();
  await loaded();
  await tick(1000);
  expect(container.querySelector('[aria-label="Playback time"]')?.textContent).toBe("0:01 / 0:03");
  await click("Pause slideshow");
  const seek = container.querySelector<HTMLInputElement>('[aria-label="Slide playback position"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(seek, "2.5");
    seek.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await tick(1000);
  expect(seek.value).toBe("2.5");
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/1");
  await click("Resume slideshow");
  await tick(499);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/1");
  await tick(1);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/2");
});

test("audio shows artwork with a single header title and the media's real playback time", async () => {
  serve([{ id: "a", name: "Soundscape", ext: "mp3" }]);
  await renderPlayer();
  const audio = container.querySelector("audio")!;
  Object.defineProperty(audio, "duration", { configurable: true, value: 125 });
  audio.currentTime = 42;
  await act(async () => { audio.dispatchEvent(new dom.window.Event("loadedmetadata")); });
  expect(container.querySelector('[aria-label="Playback time"]')?.textContent).toBe("0:42 / 2:05");
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/items/a/thumb");
  expect((container.textContent?.match(/Soundscape/g) || []).length).toBe(1);
  await loaded("audio");
  const seek = container.querySelector<HTMLInputElement>('[aria-label="Slide playback position"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(seek, "60");
    seek.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  expect(audio.currentTime).toBe(60);
});

test("does not reveal controls on startup hover or overlap the loader with the center button", async () => {
  serve([{ id: "1", ext: "jpg" }]);
  await renderPlayer();
  expect(container.querySelector('[aria-label="Loading slide"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Pause slideshow"]')).toBeNull();
  await pointer("mouse", "pointerover");
  expect(container.querySelector("footer")?.getAttribute("aria-hidden")).toBe("true");
  await pointer("mouse");
  expect(container.querySelector("footer")?.getAttribute("aria-hidden")).toBe("false");
  expect(container.querySelector('[aria-label="Pause slideshow"]')).toBeNull();
  await loaded();
  expect(container.querySelector('[aria-label="Pause slideshow"]')).not.toBeNull();
});

test("preloads the next image and promotes the same decoded element", async () => {
  serve([{ id: "1", ext: "jpg" }, { id: "2", ext: "jpg" }, { id: "3", ext: "jpg" }]);
  await renderPlayer();
  await loaded();
  const prepared = container.querySelector<HTMLImageElement>('[data-slideshow-preload] img')!;
  expect(prepared.getAttribute("src")).toBe("/file/2");
  await act(async () => { prepared.dispatchEvent(new dom.window.Event("load")); });
  await click("Next slide");
  expect(container.querySelector(".slideshow-frame img")).toBe(prepared);
  expect(container.querySelector('[aria-label="Loading slide"]')).toBeNull();
  expect(container.querySelector('[data-slideshow-preload] img')?.getAttribute("src")).toBe("/file/3");
});

test("prepares video and audio without playing them and retains their buffers on promotion", async () => {
  serve([{ id: "i", ext: "jpg" }, { id: "v", ext: "mp4" }, { id: "a", ext: "mp3", noThumbnail: true }]);
  await renderPlayer();
  await loaded();
  const video = container.querySelector<HTMLVideoElement>('[data-slideshow-preload] video')!;
  expect(video.preload).toBe("auto");
  await act(async () => { video.dispatchEvent(new dom.window.Event("canplay")); });
  expect(play).not.toHaveBeenCalled();
  await click("Next slide");
  expect(container.querySelector(".slideshow-frame video")).toBe(video);
  expect(play).toHaveBeenCalled();
  const audio = container.querySelector<HTMLAudioElement>('[data-slideshow-preload] audio')!;
  const played = play.mock.calls.length;
  await act(async () => { audio.dispatchEvent(new dom.window.Event("canplay")); });
  expect(play).toHaveBeenCalledTimes(played);
  await click("Next slide");
  expect(container.querySelector(".slideshow-frame audio")).toBe(audio);
  expect(container.querySelector('[aria-label="Loading slide"]')).toBeNull();
});

test("a failed preload leaves playback intact and is loaded fresh when selected", async () => {
  serve([{ id: "1", ext: "jpg" }, { id: "2", ext: "jpg" }]);
  await renderPlayer();
  await loaded();
  const prepared = container.querySelector('[data-slideshow-preload] img')!;
  await act(async () => { prepared.dispatchEvent(new dom.window.Event("error")); });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[data-slideshow-preload]')).toBeNull();
  await click("Next slide");
  expect(container.querySelector(".slideshow-frame img")).not.toBe(prepared);
  expect(container.querySelector(".slideshow-frame img")?.getAttribute("src")).toBe("/file/2");
  await loaded();
  expect(container.querySelector('[aria-label="Loading slide"]')).toBeNull();
});

function enablePictureInPicture() {
  const handlers = new Map<string, MediaSessionActionHandler | null>();
  let active: HTMLVideoElement | null = null;
  Object.defineProperty(document, "pictureInPictureEnabled", { value: true });
  Object.defineProperty(document, "pictureInPictureElement", { configurable: true, get: () => active });
  const present = (video: HTMLVideoElement | null) => {
    const previous = active;
    active = video;
    previous?.dispatchEvent(new dom.window.Event("leavepictureinpicture"));
    video?.dispatchEvent(new dom.window.Event("enterpictureinpicture"));
  };
  const request = vi.fn(function (this: HTMLVideoElement) {
    present(this);
    return Promise.resolve({} as PictureInPictureWindow);
  });
  dom.window.HTMLVideoElement.prototype.requestPictureInPicture = request;
  const exit = vi.fn(async () => { present(null); });
  document.exitPictureInPicture = exit;
  Object.defineProperty(navigator, "mediaSession", { value: {
    metadata: null,
    setActionHandler: (action: string, handler: MediaSessionActionHandler | null) => handlers.set(action, handler),
  } });
  const automatic = () => handlers.get("enterpictureinpicture")?.({ action: "enterpictureinpicture" as MediaSessionAction });
  return { handlers, request, exit, present, automatic };
}

async function readyVideo(video: HTMLVideoElement) {
  Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
  Object.defineProperty(video, "paused", { configurable: true, value: false });
  Object.defineProperty(video, "duration", { configurable: true, value: 60 });
  await act(async () => {
    video.dispatchEvent(new dom.window.Event("loadedmetadata"));
    video.dispatchEvent(new dom.window.Event("canplay"));
  });
}

test("PiP and media controls follow only the active video, then clear on image slides", async () => {
  const pip = enablePictureInPicture();
  serve([{ id: "first", ext: "mp4" }, { id: "next", ext: "mp4" }, { id: "image", ext: "jpg" }]);
  await renderPlayer();
  const first = container.querySelector<HTMLVideoElement>("video")!;
  expect(button("Picture-in-Picture").disabled).toBe(true);
  await readyVideo(first);
  const automatic = pip.handlers.get("enterpictureinpicture");
  const next = container.querySelector<HTMLVideoElement>('[data-slideshow-preload] video')!;
  await readyVideo(next);
  expect(pip.handlers.get("enterpictureinpicture")).toBe(automatic);
  await act(async () => { await pip.automatic(); });
  expect(pip.request.mock.contexts).toEqual([first]);
  expect(button("Exit Picture-in-Picture").getAttribute("aria-pressed")).toBe("true");
  await click("Next slide");
  expect(pip.exit).toHaveBeenCalledOnce();
  expect(container.querySelector(".slideshow-frame video")).toBe(next);
  await act(async () => { await pip.automatic(); });
  expect(pip.request.mock.contexts).toEqual([first, next]);
  await click("Next slide");
  expect(pip.exit).toHaveBeenCalledTimes(2);
  expect(container.querySelector('button[aria-label$="Picture-in-Picture"]')).toBeNull();
  expect(pip.handlers.get("enterpictureinpicture")).toBeNull();
  expect(pip.handlers.get("play")).toBeNull();
});

test("native PiP pause/play updates the slideshow without letting preload or navigation pause the next item", async () => {
  enablePictureInPicture();
  serve([{ id: "first", ext: "mp4" }, { id: "next", ext: "mp4" }]);
  await renderPlayer();
  const first = container.querySelector<HTMLVideoElement>("video")!;
  await readyVideo(first);
  const next = container.querySelector<HTMLVideoElement>('[data-slideshow-preload] video')!;
  await readyVideo(next);
  await act(async () => { first.dispatchEvent(new dom.window.Event("pause")); });
  expect(button("Resume slideshow")).toBeTruthy();
  await act(async () => { first.dispatchEvent(new dom.window.Event("play")); });
  expect(button("Pause slideshow")).toBeTruthy();
  await act(async () => { next.dispatchEvent(new dom.window.Event("pause")); });
  expect(button("Pause slideshow")).toBeTruthy();
  vi.mocked(dom.window.HTMLMediaElement.prototype.pause).mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new dom.window.Event("pause"));
  });
  await click("Next slide");
  expect(button("Pause slideshow")).toBeTruthy();
});

test("a late PiP request is closed after navigating away from its video", async () => {
  const pip = enablePictureInPicture();
  let resolve!: (value: PictureInPictureWindow) => void;
  pip.request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  serve([{ id: "video", ext: "mp4" }, { id: "image", ext: "jpg" }]);
  await renderPlayer();
  const video = container.querySelector<HTMLVideoElement>("video")!;
  await readyVideo(video);
  await click("Picture-in-Picture");
  await click("Next slide");
  await act(async () => { pip.present(video); resolve({} as PictureInPictureWindow); });
  expect(pip.exit).toHaveBeenCalledOnce();
  expect(document.pictureInPictureElement).toBeNull();
  expect(container.querySelector(".slideshow-frame img")?.getAttribute("src")).toBe("/file/image");
});

test.each(["button", "automatic"])("keeps the slideshow open when %s PiP leaves fullscreen before entering PiP", async (trigger) => {
  const pip = enablePictureInPicture();
  let fullscreenElement: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", { get: () => fullscreenElement });
  fullscreen.mockImplementation(function (this: HTMLElement) {
    fullscreenElement = this;
    document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    return Promise.resolve();
  });
  let resolve!: (value: PictureInPictureWindow) => void;
  pip.request.mockImplementationOnce(() => {
    fullscreenElement = null;
    document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    return new Promise((done) => { resolve = done; });
  });
  serve([{ id: "video", ext: "mp4" }]);
  await act(async () => { root.render(<SlideshowDialog query={query} onClose={close} />); });
  const start = Array.from(document.querySelectorAll("button")).find((element) => element.textContent === "START")!;
  await act(async () => { start.click(); });
  const video = document.querySelector<HTMLVideoElement>("video")!;
  await readyVideo(video);
  let opening: unknown;
  await act(async () => {
    if (trigger === "button") button("Picture-in-Picture").click();
    else opening = pip.automatic();
  });
  expect(close).not.toHaveBeenCalled();
  await act(async () => { pip.present(video); resolve({} as PictureInPictureWindow); await opening; });
  expect(button("Exit Picture-in-Picture")).toBeTruthy();
  await click("Exit Picture-in-Picture");
  await act(async () => { document.dispatchEvent(new dom.window.Event("fullscreenchange")); });
  expect(close).not.toHaveBeenCalled();
  // A later regular fullscreen exit keeps the original close behavior.
  fullscreenElement = document.querySelector('[aria-label="Slideshow player"]')!.parentElement;
  await act(async () => { document.dispatchEvent(new dom.window.Event("fullscreenchange")); });
  fullscreenElement = null;
  await act(async () => { document.dispatchEvent(new dom.window.Event("fullscreenchange")); });
  expect(close).toHaveBeenCalledOnce();
});

test("a rejected PiP transition keeps the player available and releases its fullscreen guard", async () => {
  const pip = enablePictureInPicture();
  let fullscreenElement: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", { get: () => fullscreenElement });
  fullscreen.mockImplementation(function (this: HTMLElement) {
    fullscreenElement = this;
    document.dispatchEvent(new dom.window.Event("fullscreenchange"));
    return Promise.resolve();
  });
  pip.request.mockRejectedValueOnce(new Error("PiP denied"));
  serve([{ id: "video", ext: "mp4" }]);
  await act(async () => { root.render(<SlideshowDialog query={query} onClose={close} />); });
  await act(async () => { Array.from(document.querySelectorAll("button")).find((element) => element.textContent === "START")!.click(); });
  await readyVideo(document.querySelector<HTMLVideoElement>("video")!);
  await click("Picture-in-Picture");
  expect(document.querySelector("footer [role=status]")?.textContent).toContain("Could not change Picture-in-Picture mode");
  fullscreenElement = null;
  await act(async () => { document.dispatchEvent(new dom.window.Event("fullscreenchange")); });
  expect(close).toHaveBeenCalledOnce();
});

test("replaying the same buffered video closes PiP, restarts its timeline, and remains ready", async () => {
  const pip = enablePictureInPicture();
  serve([{ id: "video", ext: "mp4" }]);
  await renderPlayer({ ...settings, loop: true });
  const video = container.querySelector<HTMLVideoElement>("video")!;
  await readyVideo(video);
  await click("Picture-in-Picture");
  video.currentTime = 60;
  await act(async () => { video.dispatchEvent(new dom.window.Event("ended")); });
  expect(pip.exit).toHaveBeenCalledOnce();
  expect(container.querySelector(".slideshow-frame video")).toBe(video);
  expect(video.currentTime).toBe(0);
  expect(container.querySelector('[aria-label="Loading slide"]')).toBeNull();
  expect(button("Pause slideshow")).toBeTruthy();
});

test.each(["ended", "error"])("clears the media session when the current video reports %s", async (event) => {
  const pip = enablePictureInPicture();
  serve([{ id: "video", ext: "mp4" }]);
  await renderPlayer();
  const video = container.querySelector<HTMLVideoElement>("video")!;
  await readyVideo(video);
  await click("Picture-in-Picture");
  await act(async () => { video.dispatchEvent(new dom.window.Event(event)); });
  expect(pip.exit).toHaveBeenCalledOnce();
  expect(pip.handlers.get("enterpictureinpicture")).toBeNull();
  expect(pip.handlers.get("play")).toBeNull();
});
