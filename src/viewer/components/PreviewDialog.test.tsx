import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { PreviewDialog } from "./PreviewDialog";
import { resetPreviewDialogState, setPreviewDialogState } from "../previewDialogState";
import * as actions from "../shellActions";

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
