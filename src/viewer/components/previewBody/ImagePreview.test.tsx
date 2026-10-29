import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { ImagePreview } from "./ImagePreview";
import { setImageOverlayControlsVisible } from "../../imageOverlayState";

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
