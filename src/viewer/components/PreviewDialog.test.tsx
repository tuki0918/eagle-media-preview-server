import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { PreviewDialog } from "./PreviewDialog";
import { resetPreviewDialogState, setPreviewDialogState } from "../previewDialogState";
import * as actions from "../shellActions";
import { clearPreviewBodyState, setPreviewBodyState } from "../previewBodyState";
import { setImageOverlayControlsVisible } from "../imageOverlayState";
import { setVideoOverlayControlsVisible } from "../videoOverlayState";

test("drags or taps the details handle without closing the media preview", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const closePreview = vi.spyOn(actions, "closePreview").mockImplementation(() => {});
    const closeInfo = vi.spyOn(actions, "togglePreviewInfo").mockImplementation(() => {});
    setPreviewDialogState({ infoOpen: true, mode: "image", open: true });
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<PreviewDialog />); });
    const handle = container.querySelector<HTMLButtonElement>('[aria-label="Close item details"]')!;
    const panel = container.querySelector<HTMLElement>('[aria-label="Media info"]')!;
    const pointer = async (type: string, clientY: number) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, clientY, button: 0 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      await act(async () => { handle.dispatchEvent(event); });
    };
    await pointer("pointerdown", 100);
    await pointer("pointermove", 140);
    expect(panel.style.transform).toBe("translateY(40px)");
    await pointer("pointerup", 140);
    expect(panel.style.transform).toBe("");
    expect(closeInfo).not.toHaveBeenCalled();
    await pointer("pointerdown", 100);
    await pointer("pointerup", 200);
    expect(closeInfo).toHaveBeenCalledTimes(1);
    await act(async () => { handle.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 1 })); });
    expect(closeInfo).toHaveBeenCalledTimes(1);
    await pointer("pointerdown", 100);
    await pointer("pointermove", 130);
    await pointer("pointercancel", 130);
    expect(panel.style.transform).toBe("");
    await act(async () => { handle.click(); });
    expect(closeInfo).toHaveBeenCalledTimes(2);
    expect(closePreview).not.toHaveBeenCalled();
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      resetPreviewDialogState();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});


test("image taps toggle the touch header and toolbar together without changing other preview modes", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setVideoOverlayControlsVisible(false);
    setPreviewDialogState({ infoOpen: false, mode: "image", open: true });
    setPreviewBodyState({ kind: "image", item: { id: "photo", name: "Photo", ext: "jpg" } });
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<PreviewDialog />); });
    const header = container.querySelector("header")!;
    const dialog = container.querySelector("dialog")!;
    const viewport = container.querySelector<HTMLElement>(".image-viewport")!;
    viewport.setPointerCapture = vi.fn();
    const toolbar = container.querySelector(".image-toolbar")!;
    expect(header.classList.contains("touch:absolute")).toBe(true);
    expect(dialog.classList.contains("touch:grid-rows-[minmax(0,1fr)]")).toBe(true);
    expect(header.classList.contains("touch:opacity-0")).toBe(false);
    const pointer = async (type: string, clientX: number) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, clientX, clientY: 100 });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "touch" } });
      await act(async () => { viewport.dispatchEvent(event); });
    };
    await pointer("pointerdown", 100);
    await pointer("pointerup", 100);
    expect(header.classList.contains("touch:opacity-0")).toBe(true);
    expect(header.classList.contains("touch:pointer-events-none")).toBe(true);
    expect(toolbar.classList.contains("opacity-0")).toBe(true);
    await pointer("pointerdown", 100);
    await pointer("pointerup", 100);
    expect(header.classList.contains("touch:opacity-0")).toBe(false);
    expect(toolbar.classList.contains("opacity-100")).toBe(true);
    await pointer("pointerdown", 100);
    await pointer("pointermove", 120);
    await pointer("pointerup", 120);
    expect(header.classList.contains("touch:opacity-0")).toBe(false);
    await act(async () => {
      setImageOverlayControlsVisible(false);
      setVideoOverlayControlsVisible(true);
      setPreviewDialogState({ infoOpen: false, mode: "video", open: true });
      clearPreviewBodyState();
    });
    expect(header.classList.contains("touch:absolute")).toBe(true);
    expect(header.classList.contains("touch:opacity-0")).toBe(false);
    await act(async () => { setVideoOverlayControlsVisible(false); });
    expect(header.classList.contains("touch:opacity-0")).toBe(true);
    for (const mode of ["audio", "text", "pdf", "url", "unsupported"] as const) {
      await act(async () => { setPreviewDialogState({ infoOpen: false, mode, open: true }); });
      expect(header.classList.contains("touch:absolute")).toBe(false);
      expect(header.classList.contains("touch:opacity-0")).toBe(false);
      expect(dialog.classList.contains("touch:grid-rows-[minmax(0,1fr)]")).toBe(false);
    }
  } finally {
    try { await act(async () => root?.unmount()); }
    finally {
      resetPreviewDialogState();
      clearPreviewBodyState();
      setImageOverlayControlsVisible(true);
      setVideoOverlayControlsVisible(true);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  }
});
