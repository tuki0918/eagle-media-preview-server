import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";

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
  test.each(["ready", "failed", "unreachable"])("renders the shell and reports startup state: %s", async (startup) => {
    const dom = installDom();
    let root: Root | undefined;
    vi.doMock("react-dom/client", async (importOriginal) => {
      const client = await importOriginal<typeof import("react-dom/client")>();
      return {
        ...client,
        createRoot: (...args: Parameters<typeof client.createRoot>) => {
          root = client.createRoot(...args);
          return root;
        },
      };
    });
    const initViewer = vi.fn(async () => {
      const template = document.querySelector<HTMLTemplateElement>("#cardTemplate");
      expect(template?.content.firstElementChild).not.toBeNull();
      expect(template?.content.firstElementChild?.className).toBe("media-card");
      if (startup === "failed") throw new Error("Viewer bundle unavailable");
      if (startup === "unreachable") {
        const { getLoginConnectState, setLoginConnectState } = await import("./viewer/loginConnectState");
        setLoginConnectState({ ...getLoginConnectState(), serverStatus: "error" });
      }
    });
    vi.doMock("./viewerApp", () => ({ initViewer }));

    try {
      await import("./main");
      await vi.waitFor(() => expect(initViewer).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(document.body.dataset.appState).toBe(startup === "ready" ? "ready" : "failed"));
    } finally {
      try {
        root?.unmount();
      } finally {
        vi.doUnmock("react-dom/client");
        dom.window.close();
      }
    }
  });
});
