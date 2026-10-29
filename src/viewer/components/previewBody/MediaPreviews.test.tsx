import { act, useRef } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { MediaControls } from "./MediaPreviews";

type PresentationMode = "inline" | "picture-in-picture";

async function withPlayer(
  mode: "standard" | "safari" | "unsupported",
  run: (player: {
    dom: JSDOM;
    container: Element;
    video: HTMLVideoElement;
    request: ReturnType<typeof vi.fn>;
    exit: ReturnType<typeof vi.fn>;
    button: () => HTMLButtonElement | null;
    metadata: (ready: number, event?: string) => Promise<void>;
    present: (active: boolean) => Promise<void>;
    unmount: () => Promise<void>;
  }) => Promise<void>,
  variant: "video" | "audio" = "video",
  safariSupportReadyState = 1,
) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  let readyState = 0;
  let active: HTMLVideoElement | null = null;
  let presentationMode: PresentationMode = "inline";
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const proto = dom.window.HTMLVideoElement.prototype;
    Object.defineProperty(proto, "readyState", { configurable: true, get: () => readyState });
    Object.defineProperty(dom.window.document, "pictureInPictureEnabled", { configurable: true, value: mode !== "unsupported" });
    Object.defineProperty(dom.window.document, "pictureInPictureElement", { configurable: true, get: () => active });
    const request = vi.fn(function (this: HTMLVideoElement) {
      active = this;
      this.dispatchEvent(new dom.window.Event("enterpictureinpicture"));
      return Promise.resolve({} as PictureInPictureWindow);
    });
    const exit = vi.fn(() => {
      const previous = active;
      active = null;
      previous?.dispatchEvent(new dom.window.Event("leavepictureinpicture"));
      return Promise.resolve();
    });
    Object.defineProperty(proto, "requestPictureInPicture", { configurable: true, value: request });
    Object.defineProperty(dom.window.document, "exitPictureInPicture", { configurable: true, value: exit });
    if (mode === "safari") {
      Object.defineProperties(proto, {
        webkitPresentationMode: { configurable: true, get: () => presentationMode },
        webkitSupportsPresentationMode: { configurable: true, value: () => readyState >= safariSupportReadyState },
        webkitSetPresentationMode: {
          configurable: true,
          value: function (this: HTMLVideoElement, next: PresentationMode) {
            presentationMode = next;
            this.dispatchEvent(new dom.window.Event("webkitpresentationmodechanged"));
          },
        },
      });
    }
    function Player() {
      const mediaRef = useRef<HTMLVideoElement | null>(null);
      return <div><video ref={mediaRef} /><MediaControls mediaRef={mediaRef} variant={variant} item={{ id: "clip", name: "Clip", ext: "mp4" }} /></div>;
    }
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root!.render(<Player />); });
    const video = container.querySelector("video")!;
    const unmount = async () => {
      await act(async () => { root?.unmount(); });
      root = undefined;
    };
    await run({
      dom, container, video, request, exit,
      button: () => container.querySelector('button[aria-label$="Picture-in-Picture"]'),
      metadata: async (ready, event) => {
        readyState = ready;
        await act(async () => { video.dispatchEvent(new dom.window.Event(event ?? (ready ? "loadedmetadata" : "emptied"))); });
      },
      present: async (isActive) => {
        active = isActive ? video : null;
        presentationMode = isActive ? "picture-in-picture" : "inline";
        await act(async () => { video.dispatchEvent(new dom.window.Event(mode === "safari" ? "webkitpresentationmodechanged" : isActive ? "enterpictureinpicture" : "leavepictureinpicture")); });
      },
      unmount,
    });
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
}

test("offers PiP only for supported video controls", async () => {
  await withPlayer("unsupported", async ({ button }) => { expect(button()).toBeNull(); });
  await withPlayer("standard", async ({ button }) => { expect(button()).toBeNull(); }, "audio");
});

test("waits for metadata, follows browser PiP changes, and closes PiP when the preview closes", async () => {
  await withPlayer("standard", async ({ button, metadata, present, request, exit, unmount }) => {
    expect(button()?.disabled).toBe(true);
    await metadata(1);
    expect(button()?.disabled).toBe(false);
    await act(async () => { button()!.click(); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    expect(button()?.getAttribute("aria-label")).toBe("Exit Picture-in-Picture");
    await present(false);
    expect(button()?.getAttribute("aria-pressed")).toBe("false");
    await metadata(0);
    expect(button()?.disabled).toBe(true);
    await present(true);
    await unmount();
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

test("detects Safari PiP after metadata and follows its native presentation events", async () => {
  await withPlayer("safari", async ({ button, metadata, present, request }) => {
    expect(button()).toBeNull();
    await metadata(1);
    expect(button()?.disabled).toBe(false);
    await act(async () => { button()!.click(); });
    expect(request).not.toHaveBeenCalled();
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    await present(false);
    expect(button()?.getAttribute("aria-label")).toBe("Picture-in-Picture");
  });
});

test("reports rejected requests, ignores repeat clicks, and closes a late request after unmount", async () => {
  await withPlayer("standard", async ({ button, metadata, request, container, video, dom, exit, unmount }) => {
    await metadata(1);
    request.mockRejectedValueOnce(new Error("permission denied"));
    await act(async () => { button()!.click(); });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Could not change Picture-in-Picture mode");
    expect(button()?.disabled).toBe(false);
    let resolveRequest!: (value: PictureInPictureWindow) => void;
    request.mockImplementationOnce(() => new Promise<PictureInPictureWindow>((resolve) => { resolveRequest = resolve; }));
    await act(async () => {
      button()!.click();
      button()!.click();
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(button()?.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')).toBeNull();
    await unmount();
    Object.defineProperty(dom.window.document, "pictureInPictureElement", { configurable: true, value: video });
    await act(async () => { resolveRequest({} as PictureInPictureWindow); });
    expect(exit).toHaveBeenCalledTimes(1);
  });
});


test.each(["loadeddata", "canplay", "playing", "resize"])("shows Safari PiP when support becomes available after metadata on %s", async (event) => {
  await withPlayer("safari", async ({ button, metadata, request }) => {
    await metadata(1);
    expect(button()).toBeNull();
    await metadata(3, event);
    expect(button()?.disabled).toBe(false);
    await act(async () => { button()!.click(); });
    expect(request).not.toHaveBeenCalled();
    expect(button()?.getAttribute("aria-pressed")).toBe("true");
    await metadata(0);
    expect(button()).toBeNull();
  }, "video", 3);
});
