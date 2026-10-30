import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { PreviewBodyHost } from "../PreviewBody";
import { clearPreviewBodyState, setPreviewBodyState } from "../../previewBodyState";
import * as actions from "../../shellActions";
import { ImagePreview } from "./ImagePreview";
import { setImageOverlayControlsVisible } from "../../imageOverlayState";
import { setEagleStatus } from "../../eagleStatusState";
import { setMediaFallbackCheck } from "../../api";

test("shows the offline notice instead of a spinner and reloads once the server is back", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    setEagleStatus("online");
    await act(async () => { root?.render(<ImagePreview item={{ id: "photo", name: "Photo", ext: "jpg" }} srcKind="file" />); });
    const pendingImage = container.querySelector("img")!;
    expect(container.querySelector(".loading-spinner")).not.toBeNull();

    await act(async () => { setEagleStatus("offline"); });
    expect(container.querySelector(".loading-spinner")).toBeNull();
    expect(container.querySelector(".preview-notice")?.textContent).toBe("Can't reach the media server right now.");

    await act(async () => { setEagleStatus("online"); });
    expect(container.querySelector(".preview-notice")).toBeNull();
    expect(container.querySelector(".loading-spinner")).not.toBeNull();
    expect(container.querySelector("img")).not.toBe(pendingImage);
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      setEagleStatus("checking");
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});

test("ignores a fallback decision that arrives after the back-online reload", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    let decide!: (allowed: boolean) => void;
    setMediaFallbackCheck(() => new Promise((resolve) => { decide = resolve; }));
    setEagleStatus("online");
    await act(async () => { root?.render(<ImagePreview item={{ id: "photo", name: "Photo", ext: "jpg" }} srcKind="file" />); });
    const failedImage = container.querySelector("img")!;

    // The original fails while the server blips; the fallback check is still pending.
    await act(async () => { failedImage.dispatchEvent(new dom.window.Event("error")); });
    await act(async () => { setEagleStatus("offline"); });
    await act(async () => { setEagleStatus("online"); });
    const reloadedImage = container.querySelector("img")!;
    expect(reloadedImage).not.toBe(failedImage);

    // The stale answer must not mark the reloaded image as failed.
    await act(async () => { decide(false); });
    expect(container.querySelector(".preview-notice")).toBeNull();
    expect(container.querySelector("img")).toBe(reloadedImage);
    expect(reloadedImage.getAttribute("src")).toContain("/file");
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      setMediaFallbackCheck(null);
      setEagleStatus("checking");
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});

test.each([
  { imageWidth: 1200, imageHeight: 600, viewportWidth: 400, viewportHeight: 700 },
  { imageWidth: 600, imageHeight: 1200, viewportWidth: 800, viewportHeight: 400 },
  { imageWidth: 800, imageHeight: 400, viewportWidth: 800, viewportHeight: 400 },
  { imageWidth: 200, imageHeight: 100, viewportWidth: 800, viewportHeight: 600 },
])("Fit reaches a viewport edge while initial display keeps its margin: %o", async (size) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<ImagePreview item={{ id: "photo", name: "Photo", ext: "jpg" }} srcKind="file" />); });
    const image = container.querySelector("img")!;
    const viewport = container.querySelector<HTMLElement>(".image-viewport")!;
    Object.defineProperties(image, {
      naturalWidth: { value: size.imageWidth },
      naturalHeight: { value: size.imageHeight },
    });
    let viewportWidth = size.viewportWidth;
    Object.defineProperties(viewport, {
      clientWidth: { get: () => viewportWidth },
      clientHeight: { value: size.viewportHeight },
    });
    const scale = () => Number(image.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    const edgeScale = Math.min(size.viewportWidth / size.imageWidth, size.viewportHeight / size.imageHeight);
    await act(async () => { image.dispatchEvent(new dom.window.Event("load")); });
    expect(scale()).toBeCloseTo(edgeScale * 0.96);
    const fit = container.querySelector<HTMLButtonElement>('[aria-label="Fit"]')!;
    await act(async () => { fit.click(); });
    expect(scale()).toBeCloseTo(edgeScale);
    expect(image.style.transform).toContain("translate3d(0px, 0px, 0)");
    expect(Math.max(size.imageWidth * scale() / size.viewportWidth, size.imageHeight * scale() / size.viewportHeight)).toBeCloseTo(1);
    // Fit uses the current viewport, including after the available space changes.
    viewportWidth /= 2;
    await act(async () => { fit.click(); });
    expect(scale()).toBeCloseTo(Math.min(viewportWidth / size.imageWidth, size.viewportHeight / size.imageHeight));
    expect(container.querySelector('[aria-label="Actual size"]')).toBeNull();
    const zoom = container.querySelector<HTMLSelectElement>('[aria-label="Image zoom percentage"]')!;
    for (const value of ["0.25", "0.5", "1", "2"]) {
      await act(async () => {
        zoom.value = value;
        zoom.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
      expect(scale()).toBe(Number(value));
      expect(image.style.transform).toContain("translate3d(0px, 0px, 0)");
    }
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click(); });
    expect(scale()).toBeCloseTo(2.36);
    expect(zoom.selectedOptions[0].textContent).toBe("236%");
    await act(async () => { fit.click(); });
    expect(scale()).toBeCloseTo(Math.min(viewportWidth / size.imageWidth, size.viewportHeight / size.imageHeight));
    expect(zoom.selectedOptions[0].textContent).toBe(`${Math.round(scale() * 100)}%`);
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      setImageOverlayControlsVisible(true);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});


test.each(["native", "unsupported", "rejected"] as const)("image fullscreen lifecycle with %s support", async (support) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  let nativeSurface: Element | null = null;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    Object.defineProperty(dom.window.document, "fullscreenElement", { get: () => nativeSurface });
    const request = vi.fn(function (this: HTMLElement) {
      if (support === "rejected") return Promise.reject(new Error("Unavailable"));
      nativeSurface = this;
      dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
      return Promise.resolve();
    });
    const exit = vi.fn(() => {
      nativeSurface = null;
      dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
      return Promise.resolve();
    });
    dom.window.document.exitFullscreen = exit;
    if (support !== "unsupported") dom.window.HTMLElement.prototype.requestFullscreen = request;
    setPreviewBodyState({ kind: "image", item: { id: "one", ext: "jpg" } });
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<PreviewBodyHost />); });
    const surface = container.querySelector<HTMLElement>("#previewBody")!;
    const click = async (label: string) => {
      const button = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
      expect(button).not.toBeNull();
      await act(async () => { button.click(); });
    };
    await click("Full screen");
    expect(surface.classList.contains("!fixed")).toBe(true);
    expect(nativeSurface).toBe(support === "native" ? surface : null);
    await act(async () => { setPreviewBodyState({ kind: "image", item: { id: "two", ext: "jpg" } }); });
    expect(container.querySelector("#previewBody")).toBe(surface);
    expect(container.querySelector('[aria-label="Exit full screen"]')).not.toBeNull();
    expect(exit).not.toHaveBeenCalled();
    const escape = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await act(async () => { dom.window.document.dispatchEvent(escape); });
    expect(escape.defaultPrevented).toBe(true);
    expect(surface.classList.contains("!fixed")).toBe(false);
    expect(nativeSurface).toBeNull();
    await click("Full screen");
    await click("Exit full screen");
    expect(surface.classList.contains("!fixed")).toBe(false);
    await click("Full screen");
    if (support === "native") {
      await act(async () => {
        nativeSurface = null;
        dom.window.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
      });
      expect(surface.classList.contains("!fixed")).toBe(false);
      await click("Full screen");
    }
    await act(async () => { setPreviewBodyState({ kind: "text", item: { id: "text", ext: "txt" } }); });
    expect(surface.classList.contains("!fixed")).toBe(false);
    expect(nativeSurface).toBeNull();
    await act(async () => { setPreviewBodyState({ kind: "image", item: { id: "three", ext: "jpg" } }); });
    await click("Full screen");
    await act(async () => { root?.unmount(); });
    root = undefined;
    expect(nativeSurface).toBeNull();
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      clearPreviewBodyState();
      setImageOverlayControlsVisible(true);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});

test("fitted images stay centered during swipes, while zoomed images can be dragged", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const step = vi.spyOn(actions, "stepPreview").mockImplementation(() => {});
    const close = vi.spyOn(actions, "closePreview").mockImplementation(() => {});
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<ImagePreview item={{ id: "photo", ext: "jpg" }} srcKind="file" />); });
    const image = container.querySelector("img")!;
    const viewport = container.querySelector<HTMLElement>(".image-viewport")!;
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    Object.defineProperties(viewport, { clientWidth: { value: 600 }, clientHeight: { value: 500 } });
    viewport.setPointerCapture = vi.fn();
    await act(async () => { image.dispatchEvent(new dom.window.Event("load")); });
    const pointer = async (type: string, clientX: number, pointerType = "touch", pointerId = 1) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, clientX, clientY: 100 });
      Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } });
      await act(async () => { viewport.dispatchEvent(event); });
    };
    for (const fit of [false, true]) {
      if (fit) await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Fit"]')!.click(); });
      const initial = image.style.transform;
      await pointer("pointerdown", 200);
      await pointer("pointermove", 100);
      expect(image.style.transform).toBe(initial);
      await pointer("pointerup", 100);
      expect(step).toHaveBeenLastCalledWith(1);
    }
    expect(step).toHaveBeenCalledTimes(2);
    await act(async () => {
      const zoom = container.querySelector<HTMLSelectElement>('[aria-label="Image zoom percentage"]')!;
      zoom.value = "1";
      zoom.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    for (const pointerType of ["touch", "mouse"]) {
      await pointer("pointerdown", 100, pointerType);
      await pointer("pointermove", 200, pointerType);
      await pointer("pointerup", 200, pointerType);
    }
    expect(image.style.transform).toContain("translate3d(200px, 0px, 0)");
    expect(step).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled();
    for (let index = 0; index < 10; index++) {
      await act(async () => { viewport.dispatchEvent(new dom.window.WheelEvent("wheel", { deltaY: 100, cancelable: true })); });
    }
    expect(image.style.transform).toContain("translate3d(0px, 0px, 0)");
    const beforePinch = Number(image.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    await pointer("pointerdown", 100, "touch", 1);
    await pointer("pointerdown", 200, "touch", 2);
    await pointer("pointermove", 400, "touch", 2);
    await pointer("pointerup", 400, "touch", 2);
    await pointer("pointerup", 100, "touch", 1);
    expect(Number(image.style.transform.match(/scale\(([^)]+)\)/)?.[1])).toBeCloseTo(beforePinch * 3);
    expect(step).toHaveBeenCalledTimes(2);
    await pointer("pointerdown", 100);
    await pointer("pointercancel", 100);
    expect(container.querySelector(".image-toolbar")!.classList.contains("opacity-100")).toBe(true);
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      setImageOverlayControlsVisible(true);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});
