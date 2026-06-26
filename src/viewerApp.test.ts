import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function installDom() {
  const dom = new JSDOM('<!doctype html><form id="connectForm"><input name="username"><input name="password"></form>', {
    url: "http://127.0.0.1:5173/viewer",
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "history", { configurable: true, value: dom.window.history });
  Object.defineProperty(globalThis, "location", { configurable: true, value: dom.window.location });
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: dom.window.FormData });
  Object.defineProperty(globalThis, "HTMLInputElement", { configurable: true, value: dom.window.HTMLInputElement });
  return dom;
}

describe("viewer app data refresh", () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.resetModules();
    dom = installDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dom.window.close();
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { window?: Window & typeof globalThis }).window;
    delete (globalThis as { history?: History }).history;
    delete (globalThis as { location?: Location }).location;
    delete (globalThis as { FormData?: typeof FormData }).FormData;
    delete (globalThis as { HTMLInputElement?: typeof HTMLInputElement }).HTMLInputElement;
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  test("refreshes folder counts after opening a folder", async () => {
    let folderCount = 3;
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      requests.push(url);

      if (url === "/api/auth/status") {
        return jsonResponse({ authenticated: true, required: false });
      }
      if (url === "/api/connect" && options?.method === "POST") {
        return jsonResponse({ app: { version: "1.0" }, library: { name: "Library" } });
      }
      if (url === "/api/folders") {
        return jsonResponse({ items: [{ id: "folder-1", name: "Folder 1", imageCount: folderCount }] });
      }
      if (url === "/api/smart-folders") {
        return jsonResponse({ items: [] });
      }
      if (url.startsWith("/api/items?")) {
        const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
        const total = params.get("folderId") === "folder-1" ? 7 : 11;
        return jsonResponse({ items: [], total });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { changeFolder, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getSearchControlsState } = await import("./viewer/searchControlsState");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));

    submitConnection({
      currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!,
      preventDefault: () => {},
    });
    await vi.waitFor(() => expect(getSearchControlsState().folders[0]?.imageCount).toBe(3));

    folderCount = 7;
    changeFolder({ currentTarget: { value: "folder-1" } });

    await vi.waitFor(() => expect(requests.filter((url) => url === "/api/folders")).toHaveLength(2));
    expect(getSearchControlsState().folders[0]?.imageCount).toBe(7);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
