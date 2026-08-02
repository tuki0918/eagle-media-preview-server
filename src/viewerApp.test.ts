import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function installDom() {
  const dom = new JSDOM('<!doctype html><form id="connectForm"><input name="username"><input name="password"></form>', {
    url: "http://127.0.0.1:5173/viewer",
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
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
    vi.useRealTimers();
    vi.restoreAllMocks();
    dom.window.close();
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { window?: Window & typeof globalThis }).window;
    delete (globalThis as { navigator?: Navigator }).navigator;
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

  test("synchronizes preview state when the native dialog closes", async () => {
    const item = { id: "item-1", name: "Preview", ext: "jpg" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") {
        return jsonResponse({ authenticated: true, required: false });
      }
      if (url === "/api/connect" && options?.method === "POST") {
        return jsonResponse({ app: { version: "1.0" }, library: { name: "Library" } });
      }
      if (url === "/api/folders" || url === "/api/smart-folders") {
        return jsonResponse({ items: [] });
      }
      if (url.startsWith("/api/items?")) {
        return jsonResponse({ items: [item], total: 1 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { handlePreviewClose, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getPreviewDialogState } = await import("./viewer/previewDialogState");
    const { getPreviewInfoState } = await import("./viewer/previewInfoState");
    const { getResultSurfaceState } = await import("./viewer/resultSurfaceState");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));

    submitConnection({
      currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!,
      preventDefault: () => {},
    });
    await vi.waitFor(() => expect(getResultSurfaceState().kind).toBe("list"));
    const results = getResultSurfaceState();
    if (results.kind !== "list") throw new Error("Missing result list");
    results.onOpenPreview(item);

    expect(getPreviewDialogState().open).toBe(true);
    expect(getPreviewInfoState()?.item.id).toBe("item-1");
    expect(new URLSearchParams(window.location.search).get("item")).toBe("item-1");

    handlePreviewClose();

    expect(getPreviewDialogState().open).toBe(false);
    expect(getPreviewInfoState()).toBeNull();
    expect(new URLSearchParams(window.location.search).has("item")).toBe(false);
  });

  test("does not render a completed rating save into a different preview", async () => {
    const items = [
      { id: "item-a", name: "A", ext: "jpg", star: 1 },
      { id: "item-b", name: "B", ext: "jpg", star: 2 },
    ];
    let resolveRating: ((response: Response) => void) | undefined;
    const ratingResponse = new Promise<Response>((resolve) => {
      resolveRating = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") {
        return jsonResponse({
          authenticated: true,
          required: false,
          permissions: { manageLibrary: true, read: true, writeMetadata: true, writeRating: true },
        });
      }
      if (url === "/api/connect" && options?.method === "POST") {
        return jsonResponse({ app: { version: "1.0" }, library: { name: "Library" } });
      }
      if (url === "/api/folders" || url === "/api/smart-folders") {
        return jsonResponse({ items: [] });
      }
      if (url.startsWith("/api/items?")) {
        return jsonResponse({ items, total: items.length });
      }
      if (url === "/api/items/item-a/star" && options?.method === "POST") {
        return ratingResponse;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { closePreview, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getPreviewRatingState } = await import("./viewer/previewRatingState");
    const { getResultSurfaceState } = await import("./viewer/resultSurfaceState");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));

    submitConnection({
      currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!,
      preventDefault: () => {},
    });
    await vi.waitFor(() => expect(getResultSurfaceState().kind).toBe("list"));
    let results = getResultSurfaceState();
    if (results.kind !== "list") throw new Error("Missing result list");
    results.onOpenPreview(items[0]);
    getPreviewRatingState().onSelect(5);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/item-a/star",
      expect.objectContaining({ method: "POST" }),
    ));

    closePreview();
    results = getResultSurfaceState();
    if (results.kind !== "list") throw new Error("Missing result list");
    results.onOpenPreview(items[1]);
    expect(getPreviewRatingState().item?.id).toBe("item-b");

    resolveRating?.(jsonResponse({ star: 5 }));
    await vi.waitFor(() => {
      const currentResults = getResultSurfaceState();
      if (currentResults.kind !== "list") throw new Error("Missing result list");
      expect(currentResults.items.find((item) => item.id === "item-a")?.star).toBe(5);
    });

    expect(getPreviewRatingState().item?.id).toBe("item-b");
    expect(getPreviewRatingState().item?.star).toBe(2);
  });

  test("cancels a pending search when browser history is restored", async () => {
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
      if (url === "/api/folders" || url === "/api/smart-folders") {
        return jsonResponse({ items: [] });
      }
      if (url.startsWith("/api/items?")) {
        return jsonResponse({ items: [], total: 2 });
      }
      if (url.startsWith("/api/tags?")) {
        return jsonResponse({ items: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { changeSearchQuery, handleUrlPop, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getSearchControlsState } = await import("./viewer/searchControlsState");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));

    submitConnection({
      currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!,
      preventDefault: () => {},
    });
    await vi.waitFor(() => expect(requests.some((url) => url.startsWith("/api/items?"))).toBe(true));
    const itemRequestCount = requests.filter((url) => url.startsWith("/api/items?")).length;

    vi.useFakeTimers();
    changeSearchQuery({ currentTarget: { value: "stale query" } });
    history.replaceState(null, "", "/viewer?q=restored");
    handleUrlPop();
    vi.advanceTimersByTime(220);

    expect(getSearchControlsState().searchQuery).toBe("restored");
    expect(new URLSearchParams(window.location.search).get("q")).toBe("restored");
    const nextItemRequests = requests.filter((url) => url.startsWith("/api/items?")).slice(itemRequestCount);
    expect(nextItemRequests).toHaveLength(1);
    expect(new URLSearchParams(nextItemRequests[0].split("?")[1]).get("q")).toBe("restored");
    expect(requests.some((url) => url.includes("q=stale+query"))).toBe(false);
  });

  test("cancels a pending search as soon as logout starts", async () => {
    const requests: string[] = [];
    let resolveLogout: ((response: Response) => void) | undefined;
    const logoutResponse = new Promise<Response>((resolve) => {
      resolveLogout = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/auth/status") {
        return jsonResponse({ authenticated: true, required: false });
      }
      if (url === "/api/connect" && options?.method === "POST") {
        return jsonResponse({ app: { version: "1.0" }, library: { name: "Library" } });
      }
      if (url === "/api/auth/logout" && options?.method === "POST") {
        return logoutResponse;
      }
      if (url === "/api/folders" || url === "/api/smart-folders") {
        return jsonResponse({ items: [] });
      }
      if (url.startsWith("/api/items?")) {
        return jsonResponse({ items: [], total: 2 });
      }
      if (url.startsWith("/api/tags?")) {
        return jsonResponse({ items: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { changeSearchQuery, submitConnection, submitLogout } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));

    submitConnection({
      currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!,
      preventDefault: () => {},
    });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));
    const itemRequestCount = requests.filter((url) => url.startsWith("/api/items?")).length;

    vi.useFakeTimers();
    changeSearchQuery({ currentTarget: { value: "stale query" } });
    submitLogout();
    vi.advanceTimersByTime(220);

    expect(requests.filter((url) => url.startsWith("/api/items?"))).toHaveLength(itemRequestCount);
    expect(requests.some((url) => url.includes("q=stale+query"))).toBe(false);

    vi.useRealTimers();
    resolveLogout?.(jsonResponse({ authenticated: false, required: true }));
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
