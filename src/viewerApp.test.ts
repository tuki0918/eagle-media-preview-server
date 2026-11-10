import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function installDom() {
  const dom = new JSDOM('<!doctype html><main id="startupFallback"><h1 id="startupTitle"></h1><p id="startupMessage"></p></main><form id="connectForm"><input name="username"><input name="password"></form>', {
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

  test.each(["folder=folder-1", "smartFolder=smart-1"])("opens All without filters or a pending search from %s", async (folder) => {
    history.replaceState(null, "", `/viewer?${folder}&q=old&tag=alpha&ext=jpg&rating=5&filters=1`);
    vi.spyOn(dom.window, "scrollTo").mockImplementation(() => {});
    const requests: string[] = [];
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect") return jsonResponse({ app: { version: "1.0" }, library: { name: "Library" } });
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 10 });
      throw new Error(`Unexpected request: ${url}`);
    }) });
    const { initViewer } = await import("./viewerApp");
    const { changeSearchQuery, openAllItems, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getSearchControlsState } = await import("./viewer/searchControlsState");
    await initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault() {} });
    await vi.waitFor(() => expect(requests.some((url) => url.startsWith("/api/items?"))).toBe(true));

    vi.useFakeTimers();
    changeSearchQuery({ currentTarget: { value: "pending query" } });
    const before = requests.length;
    openAllItems();
    await vi.advanceTimersByTimeAsync(250);
    expect(getSearchControlsState()).toMatchObject({ section: "items", searchQuery: "", selectedFolderId: "", selectedSmartFolderId: "", selectedExt: "", selectedRating: "", hasActiveFilters: false, filtersOpen: false });
    const itemRequests = requests.slice(before).filter((url) => url.startsWith("/api/items?"));
    expect(itemRequests).toHaveLength(1);
    expect([...new URLSearchParams(itemRequests[0].split("?")[1]).keys()].sort()).toEqual(["limit", "offset"]);
    expect(new URLSearchParams(itemRequests[0].split("?")[1]).get("offset")).toBe("0");
    for (const key of ["q", "tag", "folder", "smartFolder", "ext", "rating", "filters"]) {
      expect(new URLSearchParams(window.location.search).has(key)).toBe(false);
    }
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

  test("closes the filter panel on a pointer down outside it", async () => {
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: vi.fn(async () => jsonResponse({ authenticated: false, required: true })) });
    document.body.insertAdjacentHTML(
      "beforeend",
      '<section class="controls"><select id="extSelect"></select></section><button id="toggleFiltersButton"></button><div id="outside"></div>',
    );

    const { initViewer } = await import("./viewerApp");
    const { handleSearchOutsidePointerDown, toggleFilters } = await import("./viewer/shellActions");
    const { getSearchControlsState } = await import("./viewer/searchControlsState");
    initViewer();

    await vi.waitFor(() => {
      toggleFilters();
      expect(getSearchControlsState().filtersOpen).toBe(true);
    });

    handleSearchOutsidePointerDown(document.querySelector("#extSelect"));
    handleSearchOutsidePointerDown(document.querySelector("#toggleFiltersButton"));
    expect(getSearchControlsState().filtersOpen).toBe(true);

    handleSearchOutsidePointerDown(document.querySelector("#outside"));
    expect(getSearchControlsState().filtersOpen).toBe(false);
    expect(new URLSearchParams(window.location.search).get("filters")).toBeNull();
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

  test("loads the library extensions once the type menu is first opened, showing them as they are found", async () => {
    let itemTypeAnswers = 0;
    let finishScan: () => void = () => {};
    const scanFinished = new Promise<void>((resolve) => {
      finishScan = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) {
        itemTypeAnswers += 1;
        if (itemTypeAnswers === 1) return jsonResponse({ complete: false, items: [{ ext: "JPG", count: 1000 }] });
        await scanFinished;
        return jsonResponse({ complete: true, items: [{ ext: "JPG", count: 1000 }, { ext: "PDF", count: 1 }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { openMediaTypes, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    const { getSearchControlsState } = await import("./viewer/searchControlsState");
    const itemTypeCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/item-types"));
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(itemTypeCalls()).toHaveLength(0);

    expect(getSearchControlsState().availableExtsLoading).toBe(false);
    openMediaTypes();
    expect(getSearchControlsState().availableExtsLoading).toBe(true);
    openMediaTypes();
    await vi.waitFor(() => expect(getSearchControlsState().availableExts).toEqual(["jpg"]));
    expect(getSearchControlsState().availableExtsLoading).toBe(true);
    finishScan();
    await vi.waitFor(() => expect(getSearchControlsState().availableExts).toEqual(["jpg", "pdf"]));
    expect(getSearchControlsState().availableExtsLoading).toBe(false);
    openMediaTypes();
    // One request for the partial answer, one more until the scan completed.
    expect(itemTypeCalls()).toHaveLength(2);
  });

  test("shows the offline page on startup when the open library is not shared", async () => {
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: false, required: true });
      if (url === "/api/library-status") return jsonResponse({ libraryStatus: "not_shared" });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    await initViewer();

    expect(document.body.dataset.appState).toBe("failed");
    expect(document.querySelector("#startupMessage")?.textContent).toBe("This library isn't shared right now. Please try again later.");
    expect(requests).toEqual(["/api/auth/status", "/api/library-status"]);
  });

  test("stays on the sign-in screen at startup when the library is shared or the check is unavailable", async () => {
    for (const response of [jsonResponse({ libraryStatus: "shared" }), errorResponse(404, { error: "Not found" })]) {
      vi.resetModules();
      delete document.body.dataset.appState;
      Object.defineProperty(globalThis, "fetch", { configurable: true, value: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/status") return jsonResponse({ authenticated: false, required: true });
        if (url === "/api/library-status") return response;
        throw new Error(`Unexpected request: ${url}`);
      }) });
      const { initViewer } = await import("./viewerApp");
      const { getShellView } = await import("./viewer/shellVisibility");
      await initViewer();
      expect(document.body.dataset.appState).toBeUndefined();
      expect(getShellView()).toBe("login");
    }
  });

  test("shows the offline page when the server stops sharing the open library", async () => {
    let health: unknown = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    let connectResponse: Response = jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return connectResponse;
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));

    health = { app: { version: "1.0" }, library: null, libraryStatus: "not_shared" };
    const { canFallbackMedia } = await import("./viewer/api");
    const healthCallsBefore = fetchMock.mock.calls.filter(([url]) => url === "/api/health").length;
    // A grid can report many failed thumbnails at once. Share one health request
    // and refuse every original-file fallback after discovering the unshared library.
    expect(await Promise.all(Array.from({ length: 20 }, () => canFallbackMedia()))).toEqual(Array(20).fill(false));
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/health")).toHaveLength(healthCallsBefore + 1);
    await vi.waitFor(() => expect(document.body.dataset.appState).toBe("failed"));
    expect(getShellView()).toBe("login");
    expect(document.querySelector("#startupTitle")?.textContent).toBe("Media Library is offline");
    expect(document.querySelector("#startupMessage")?.textContent).toBe("This library isn't shared right now. Please try again later.");
    const { getResultSurfaceState } = await import("./viewer/resultSurfaceState");
    const { getTagListState } = await import("./viewer/tagListState");
    expect(getResultSurfaceState()).toMatchObject({ kind: "message", text: "" });
    expect(getTagListState().overview).toBeNull();
    const callsAfterOffline = fetchMock.mock.calls.length;
    expect(await canFallbackMedia()).toBe(false);
    window.dispatchEvent(new window.Event("online"));
    expect(fetchMock.mock.calls).toHaveLength(callsAfterOffline);

    document.body.dataset.appState = "ready";

    connectResponse = errorResponse(503, { error: "The library open in Eagle is not shared", code: "LIBRARY_NOT_SHARED" });
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(document.body.dataset.appState).toBe("failed"));
    expect(getShellView()).toBe("login");
  });

  test("keeps a signed-in user on the connect screen when the open library isn't shared with them", async () => {
    const forbiddenMessage = "Your account can't open the library that's open right now. Ask the person who set up this media library for access, or sign in as another user.";
    let health: unknown = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    let connectResponse: Response = errorResponse(403, { error: "Your account can't open the library that is open in Eagle", code: "LIBRARY_FORBIDDEN" });
    let signedIn = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: signedIn, required: true, user: signedIn ? { role: "viewer", username: "bob" } : null });
      if (url === "/api/library-status") return jsonResponse({ libraryStatus: "shared" });
      if (url === "/api/auth/logout" && options?.method === "POST") {
        signedIn = false;
        return jsonResponse({ authenticated: false, required: true });
      }
      if (url === "/api/connect" && options?.method === "POST") return connectResponse;
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { submitConnection, submitLogout } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    const connect = () => submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));

    // Connect is refused: the visitor stays signed in on the connect screen with the reason, not the offline page.
    connect();
    await vi.waitFor(() => expect(getLoginConnectState().message).toBe(forbiddenMessage));
    expect(getLoginConnectState()).toMatchObject({ authenticated: true, isError: true });
    expect(getShellView()).toBe("login");
    expect(document.body.dataset.appState).not.toBe("failed");

    // Once a library they may open is open, Connect works again.
    connectResponse = jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
    connect();
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));

    // Eagle switches to a library the user may not open: the next health check sends them back.
    health = { app: { version: "1.0" }, library: null, libraryStatus: "forbidden" };
    const { canFallbackMedia } = await import("./viewer/api");
    expect(await canFallbackMedia()).toBe(false);
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(getLoginConnectState()).toMatchObject({ authenticated: true, isError: true, message: forbiddenMessage });
    const { getResultSurfaceState } = await import("./viewer/resultSurfaceState");
    expect(getResultSurfaceState()).toMatchObject({ kind: "message", text: "" });

    // "Sign in as another user" signs out and shows the sign-in form.
    submitLogout();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(false));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/auth/logout" && init?.method === "POST")).toBe(true);
  });

  test("shows the no-access message at startup when a saved session can't open the library", async () => {
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: true, user: { role: "viewer", username: "bob" } });
      if (url === "/api/library-status") return jsonResponse({ libraryStatus: "forbidden" });
      throw new Error(`Unexpected request: ${url}`);
    }) });
    const { initViewer } = await import("./viewerApp");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    await initViewer();
    expect(getShellView()).toBe("login");
    expect(document.body.dataset.appState).not.toBe("failed");
    expect(getLoginConnectState()).toMatchObject({ authenticated: true, isError: true });
    expect(getLoginConnectState().message).toMatch(/can't open the library/);
  });

  test("decides a media fallback requested while the tab is hidden once it is shown again", async () => {
    const health = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

    try {
      const { initViewer } = await import("./viewerApp");
      const { submitConnection } = await import("./viewer/shellActions");
      const { getLoginConnectState } = await import("./viewer/loginConnectState");
      const { getShellView } = await import("./viewer/shellVisibility");
      const { canFallbackMedia } = await import("./viewer/api");
      initViewer();
      await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
      submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
      await vi.waitFor(() => expect(getShellView()).toBe("viewer"));

      visibility = "hidden";
      let decided: boolean | undefined;
      const fallbacks = Promise.all([canFallbackMedia(), canFallbackMedia()]).then((results) => {
        decided = results.every(Boolean);
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(decided).toBeUndefined();

      const healthCallsBefore = fetchMock.mock.calls.filter(([url]) => url === "/api/health").length;
      visibility = "visible";
      document.dispatchEvent(new window.Event("visibilitychange"));
      await fallbacks;
      expect(decided).toBe(true);
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/health")).toHaveLength(healthCallsBefore + 1);
    } finally {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  test("drops a hidden-tab media fallback when the user signs out before the tab is shown", async () => {
    let signedIn = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: signedIn, required: true, user: { username: "eagle", role: "viewer" } });
      if (url === "/api/auth/logout" && options?.method === "POST") {
        signedIn = false;
        return jsonResponse({ authenticated: false, required: true });
      }
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/health") {
        return signedIn
          ? jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" })
          : errorResponse(401, { error: "Authentication required" });
      }
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

    try {
      const { initViewer } = await import("./viewerApp");
      const { submitConnection, submitLogout } = await import("./viewer/shellActions");
      const { getLoginConnectState } = await import("./viewer/loginConnectState");
      const { getShellView } = await import("./viewer/shellVisibility");
      const { canFallbackMedia } = await import("./viewer/api");
      initViewer();
      await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
      submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
      await vi.waitFor(() => expect(getShellView()).toBe("viewer"));

      visibility = "hidden";
      const fallback = canFallbackMedia();
      submitLogout();
      await vi.waitFor(() => expect(getShellView()).toBe("login"));
      // Signing out releases the waiter without waiting for the tab to be shown.
      expect(await fallback).toBe(false);

      const callsAfterLogout = fetchMock.mock.calls.length;
      visibility = "visible";
      document.dispatchEvent(new window.Event("visibilitychange"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetchMock.mock.calls.slice(callsAfterLogout).map(([url]) => String(url))).not.toContain("/api/health");
      expect(getLoginConnectState().message).not.toMatch(/expired/i);
    } finally {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  test("returns to the connect screen when health polling sees a different shared library", async () => {
    let health: unknown = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    const { getLibraryName } = await import("./viewer/libraryNameState");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getLibraryName()).toBe("A"));

    health = { app: { version: "1.0" }, library: { id: "lib-b", name: "B" }, libraryStatus: "shared" };
    window.dispatchEvent(new window.Event("online"));
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(getLoginConnectState()).toMatchObject({ isError: false, message: "The media server switched to a different library." });
    expect(getLibraryName()).toBe("");
    expect(requests.filter((url) => url === "/api/connect")).toHaveLength(1);
  });

  test("checks the library when a preview opens, since the browser may answer it from its cache", async () => {
    let health: unknown = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [{ id: "item1", name: "Photo", ext: "jpg" }], total: 1 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { handleUrlPop, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));

    health = { app: { version: "1.0" }, library: { id: "lib-b", name: "B" }, libraryStatus: "shared" };
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    window.history.pushState(null, "", "/?item=item1");
    handleUrlPop();
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(getLoginConnectState().message).toBe("The media server switched to a different library.");
  });

  test("returns to the connect screen as soon as a response comes from a different library", async () => {
    let responseLibraryId = "lib-a";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const tagged = (body: unknown) => ({ ...jsonResponse(body), headers: new Headers({ "X-Library-Id": responseLibraryId }) }) as Response;
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return tagged({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/folders" || url === "/api/smart-folders") return tagged({ items: [] });
      if (url.startsWith("/api/items?")) return tagged({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return tagged({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { openAllItems, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getShellView()).toBe("viewer");

    responseLibraryId = "lib-b";
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    openAllItems();
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(getLoginConnectState().message).toBe("The media server switched to a different library.");
  });

  test("re-checks the library when the server refuses an answer with 409", async () => {
    let health: unknown = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    let refuseItems = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return refuseItems ? errorResponse(409, { error: "The library open in Eagle has changed", code: "LIBRARY_CHANGED" }) : jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { openAllItems, submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));

    refuseItems = true;
    health = { app: { version: "1.0" }, library: { id: "lib-b", name: "B" }, libraryStatus: "shared" };
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    openAllItems();
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(getLoginConnectState().message).toBe("The media server switched to a different library.");
  });

  test("sends the connected library id and returns to the connect screen when a pinned media load fails", async () => {
    let health: unknown = { app: { version: "1.0" }, library: { id: "lib-a", name: "A" }, libraryStatus: "shared" };
    const libraryHeaders: Array<string | undefined> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/items?") || url === "/api/folders") libraryHeaders.push((options?.headers as Record<string, string> | undefined)?.["X-Library-Id"]);
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect" && options?.method === "POST") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib-a", name: "A" } });
      if (url === "/api/health") return jsonResponse(health);
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/item-types")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const { initViewer } = await import("./viewerApp");
    const { submitConnection } = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getShellView } = await import("./viewer/shellVisibility");
    const { mediaUrl } = await import("./viewer/api");
    initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault: () => {} });
    await vi.waitFor(() => expect(getShellView()).toBe("viewer"));
    await vi.waitFor(() => expect(libraryHeaders.length).toBeGreaterThan(0));
    expect(libraryHeaders.every((value) => value === "lib-a")).toBe(true);
    expect(mediaUrl("ITEM1", "thumb")).toBe("/api/items/ITEM1/thumb?library=lib-a");

    health = { app: { version: "1.0" }, library: { id: "lib-b", name: "B" }, libraryStatus: "shared" };
    const image = document.createElement("img");
    image.setAttribute("src", mediaUrl("ITEM1", "thumb"));
    document.body.append(image);
    image.dispatchEvent(new window.Event("error"));
    await vi.waitFor(() => expect(getShellView()).toBe("login"));
    expect(getLoginConnectState().message).toBe("The media server switched to a different library.");
    expect(mediaUrl("ITEM1", "thumb")).toBe("/api/items/ITEM1/thumb");
  });
});

describe("viewer app experimental sort", () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.resetModules();
    dom = installDom();
    vi.spyOn(dom.window, "scrollTo").mockImplementation(() => {});
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

  // Serves a signed-in viewer; `items` answers /api/items requests (all of them, sorted or not).
  function serveViewer({ features, items }: { features?: { sort?: boolean }; items: (params: URLSearchParams) => unknown }) {
    const requests: Array<{ method: string; url: string }> = [];
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ method: init?.method || "GET", url });
      if (url === "/api/auth/status") return jsonResponse({ authenticated: true, required: false });
      if (url === "/api/connect") return jsonResponse({ app: { version: "1.0" }, library: { id: "lib", name: "Library" }, ...(features ? { features } : {}) });
      if (url === "/api/folders" || url === "/api/smart-folders") return jsonResponse({ items: [] });
      if (url.startsWith("/api/items?")) return jsonResponse(items(new URLSearchParams(url.split("?")[1])));
      if (url === "/api/sort-index/cancel") return jsonResponse({ cancelled: true });
      return jsonResponse({ items: [], total: 0 });
    }) });
    const listRequests = () => requests.filter((request) => request.url.startsWith("/api/items?") && new URLSearchParams(request.url.split("?")[1]).get("limit") !== "1");
    return { listRequests, requests };
  }

  async function connectViewer() {
    const { initViewer } = await import("./viewerApp");
    const shellActions = await import("./viewer/shellActions");
    const { getLoginConnectState } = await import("./viewer/loginConnectState");
    const { getResultSurfaceState } = await import("./viewer/resultSurfaceState");
    const { getSearchControlsState } = await import("./viewer/searchControlsState");
    await initViewer();
    await vi.waitFor(() => expect(getLoginConnectState().authenticated).toBe(true));
    shellActions.submitConnection({ currentTarget: document.querySelector<HTMLFormElement>("#connectForm")!, preventDefault() {} });
    return { getResultSurfaceState, getSearchControlsState, shellActions };
  }

  test("shows progress with Cancel while the server indexes, then the sorted list", async () => {
    history.replaceState(null, "", "/viewer?sort=name");
    let sortedRequests = 0;
    serveViewer({
      features: { sort: true },
      items: (params) => {
        if (params.get("sort") !== "name") return { items: [], total: 2 };
        sortedRequests += 1;
        return sortedRequests === 1
          ? { items: [{ id: "eagle-order" }], total: 1, sort: { status: "indexing", loaded: 5, total: 10 } }
          : { items: [{ id: "a" }, { id: "b" }], total: 2, sort: { status: "ready" } };
      },
    });
    const { getResultSurfaceState, getSearchControlsState } = await connectViewer();

    await vi.waitFor(() => expect(getResultSurfaceState()).toMatchObject({ kind: "message", className: "loading", text: "Preparing sort… 5 / 10 items" }));
    const surface = getResultSurfaceState();
    expect(surface.kind === "message" && surface.action?.label).toBe("Cancel");
    expect(getSearchControlsState()).toMatchObject({ sortAvailable: true, selectedSort: "name" });
    // Eagle's order is never shown in between; the list appears once the server is ready.
    await vi.waitFor(() => {
      const next = getResultSurfaceState();
      expect(next.kind === "list" && next.items.map((item) => item.id)).toEqual(["a", "b"]);
    }, { timeout: 4000 });
    expect(sortedRequests).toBe(2);
  });

  test("Cancel tells the server to stop and goes back to the default order", async () => {
    history.replaceState(null, "", "/viewer?sort=name&order=desc");
    const { listRequests, requests } = serveViewer({
      features: { sort: true },
      items: (params) => params.get("sort")
        ? { items: [], total: 0, sort: { status: "indexing", loaded: 1, total: 10 } }
        : { items: [{ id: "default" }], total: 1 },
    });
    const { getResultSurfaceState, getSearchControlsState } = await connectViewer();
    await vi.waitFor(() => expect(getResultSurfaceState()).toMatchObject({ kind: "message", className: "loading" }));
    const surface = getResultSurfaceState();
    if (surface.kind !== "message" || !surface.action) throw new Error("Missing Cancel action");
    surface.action.onClick();

    await vi.waitFor(() => expect(requests.some((request) => request.method === "POST" && request.url === "/api/sort-index/cancel")).toBe(true));
    await vi.waitFor(() => {
      const next = getResultSurfaceState();
      expect(next.kind === "list" && next.items.map((item) => item.id)).toEqual(["default"]);
    });
    const last = listRequests().at(-1)!;
    expect(new URLSearchParams(last.url.split("?")[1]).has("sort")).toBe(false);
    expect(new URLSearchParams(window.location.search).has("sort")).toBe(false);
    expect(new URLSearchParams(window.location.search).has("order")).toBe(false);
    expect(getSearchControlsState()).toMatchObject({ selectedSort: "", selectedOrder: "" });
  });

  test("ignores a sort in the URL when the server doesn't offer sorting", async () => {
    history.replaceState(null, "", "/viewer?sort=name");
    const { listRequests } = serveViewer({ items: () => ({ items: [{ id: "x" }], total: 1 }) });
    const { getResultSurfaceState, getSearchControlsState } = await connectViewer();
    await vi.waitFor(() => expect(getResultSurfaceState().kind).toBe("list"));
    for (const request of listRequests()) {
      expect(new URLSearchParams(request.url.split("?")[1]).has("sort")).toBe(false);
    }
    expect(getSearchControlsState()).toMatchObject({ sortAvailable: false, selectedSort: "", hasResettableFilters: false });
  });

  test("Reset filters and the library title clear the sort like a filter; picking a sort asks for it", async () => {
    history.replaceState(null, "", "/viewer?sort=name&ext=png");
    const { listRequests } = serveViewer({
      features: { sort: true },
      items: (params) => ({ items: [{ id: "x" }], total: 1, ...(params.get("sort") ? { sort: { status: "ready" } } : {}) }),
    });
    const { getResultSurfaceState, getSearchControlsState, shellActions } = await connectViewer();
    await vi.waitFor(() => expect(getResultSurfaceState().kind).toBe("list"));
    expect(getSearchControlsState()).toMatchObject({ selectedSort: "name", hasResettableFilters: true });
    const lastParams = () => new URLSearchParams(listRequests().at(-1)!.url.split("?")[1]);
    expect(lastParams().get("sort")).toBe("name");

    shellActions.resetFilters();
    await vi.waitFor(() => expect(lastParams().has("sort")).toBe(false));
    expect(lastParams().has("ext")).toBe(false);
    expect(getSearchControlsState()).toMatchObject({ selectedSort: "", hasResettableFilters: false });

    shellActions.changeSort("filesize", "desc");
    await vi.waitFor(() => expect(lastParams().get("sort")).toBe("filesize"));
    expect(lastParams().get("order")).toBe("desc");
    expect(new URLSearchParams(window.location.search).get("sort")).toBe("filesize");
    // Sorting alone counts as resettable, but not as narrowing the results.
    expect(getSearchControlsState()).toMatchObject({ hasResettableFilters: true, hasActiveFilters: false });

    shellActions.openAllItems();
    await vi.waitFor(() => expect(lastParams().has("sort")).toBe(false));
    expect(new URLSearchParams(window.location.search).has("sort")).toBe(false);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function errorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}
