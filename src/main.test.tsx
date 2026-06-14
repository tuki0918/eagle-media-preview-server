import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://127.0.0.1:5173/viewer",
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "HTMLTemplateElement", { configurable: true, value: dom.window.HTMLTemplateElement });
  return dom;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { window?: Window & typeof globalThis }).window;
  delete (globalThis as { navigator?: Navigator }).navigator;
  delete (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
  delete (globalThis as { HTMLTemplateElement?: typeof HTMLTemplateElement }).HTMLTemplateElement;
});

describe("main entrypoint", () => {
  test("renders the React shell before viewerApp initializes", async () => {
    const dom = installDom();
    const initViewer = vi.fn(() => {
      const template = document.querySelector<HTMLTemplateElement>("#cardTemplate");
      expect(template?.content.firstElementChild).not.toBeNull();
      expect(template?.content.firstElementChild?.className).toBe("media-card");
    });
    vi.doMock("./viewerApp", () => ({ initViewer }));

    try {
      await import("./main");
      await vi.waitFor(() => expect(initViewer).toHaveBeenCalledOnce());
    } finally {
      dom.window.close();
    }
  });
});
