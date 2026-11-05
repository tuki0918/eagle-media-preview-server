import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as api from "../api";
import { getSearchControlsState, setSearchControlsState } from "../searchControlsState";
import * as actions from "../shellActions";
import { getShellView, setShellView } from "../shellVisibility";
import { parseUploadTags, UploadButton } from "./UploadDialog";

const previousState = getSearchControlsState();
const previousShellView = getShellView();

afterEach(() => {
  setSearchControlsState(previousState);
  setShellView(previousShellView);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderButton(canUpload: boolean, selectedFolderId = "") {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  for (const name of ["window", "document", "navigator", "Node", "HTMLElement", "CustomEvent"] as const) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setShellView("viewer");
  setSearchControlsState({
    ...previousState,
    canUpload,
    selectedFolderId,
    folders: [{ id: "F1", name: "Travel", depth: 0, imageCount: 2 }],
  });
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.querySelector("#root")!;
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<TooltipProvider><UploadButton /></TooltipProvider>);
  });
  const query = <T extends Element = HTMLElement>(selector: string) => dom.window.document.querySelector<T>(selector);
  return {
    dom,
    query,
    async open() {
      await act(async () => query("#uploadButton")!.click());
    },
    async choose(...names: string[]) {
      const input = query<HTMLInputElement>("#uploadFileInput")!;
      const files = names.map((name) => new dom.window.File(["data"], name));
      Object.defineProperty(input, "files", { configurable: true, value: files });
      await act(async () => {
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    },
    async start() {
      await act(async () => query("#uploadStartButton")!.click());
    },
    statuses() {
      return Array.from(dom.window.document.querySelectorAll("li")).map((row) => row.getAttribute("data-status"));
    },
    async unmount() {
      await act(async () => root.unmount());
    },
  };
}

test("the upload button only appears for admins", async () => {
  const ui = await renderButton(false);
  expect(ui.query("#uploadButton")).toBeNull();
  await ui.unmount();
});

test("the dialog starts on the open folder, but not on a filter that isn't a real folder", async () => {
  const inFolder = await renderButton(true, "F1");
  await inFolder.open();
  expect(inFolder.query<HTMLSelectElement>("#uploadFolder")!.value).toBe("F1");
  await inFolder.unmount();

  const uncategorized = await renderButton(true, "__uncategorized__");
  await uncategorized.open();
  expect(uncategorized.query<HTMLSelectElement>("#uploadFolder")!.value).toBe("");
  await uncategorized.unmount();
});

test("files upload one at a time, and only failed ones are sent again", async () => {
  const sent: string[] = [];
  let failNext = true;
  vi.spyOn(api, "uploadFile").mockImplementation(async (file) => {
    sent.push(file.name);
    if (file.name === "b.png" && failNext) {
      failNext = false;
      throw new Error("Eagle said no");
    }
  });
  const finished = vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png", "b.png", "c.png");
  await ui.start();

  expect(sent).toEqual(["a.png", "b.png", "c.png"]);
  expect(ui.statuses()).toEqual(["done", "failed", "done"]);
  expect(ui.dom.window.document.body.textContent).toContain("Eagle said no");
  expect(finished).toHaveBeenCalledTimes(1);

  await ui.start();
  expect(sent).toEqual(["a.png", "b.png", "c.png", "b.png"]);
  expect(ui.statuses()).toEqual(["done", "done", "done"]);
  await ui.unmount();
});

test("an expired session stops the remaining uploads", async () => {
  const sent: string[] = [];
  vi.spyOn(api, "uploadFile").mockImplementation(async (file) => {
    sent.push(file.name);
    throw new api.ApiError(401, "Authentication required");
  });
  vi.spyOn(actions, "uploadError").mockReturnValue(true);
  const finished = vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png", "b.png");
  await ui.start();

  expect(sent).toEqual(["a.png"]);
  expect(finished).not.toHaveBeenCalled();
  await ui.unmount();
});

test("the list shows its count, with the Upload button below it once there is a file to send", async () => {
  vi.spyOn(api, "uploadFile").mockResolvedValue(undefined as never);
  vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  const ui = await renderButton(true);
  await ui.open();
  expect(ui.query("#uploadStartButton")).toBeNull();
  expect(ui.query("#uploadDialog footer")).toBeNull();

  await ui.choose("a.png");
  expect(ui.query("#uploadDialog header #uploadStartButton")).toBeNull();
  const start = ui.query("#uploadStartButton")!;
  expect(ui.query("#uploadList")!.compareDocumentPosition(start) & ui.dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(ui.query("#uploadDialog footer #uploadStartButton")).toBe(start);
  expect(ui.query("#uploadListTitle")!.textContent).toBe("Upload list1");
  await ui.choose("b.png");
  expect(ui.query("#uploadListCount")!.textContent).toBe("2");

  await ui.start();
  expect(ui.query("#uploadStartButton")).toBeNull();
  expect(ui.query("#uploadCancelButton")).toBeNull();
  await act(async () => ui.query("#uploadCloseButton")!.click());
  expect(ui.query("#uploadDialog")).toBeNull();
  await ui.unmount();
});

test("Cancel stops the upload and leaves the dialog open, with Close and Upload to go on from there", async () => {
  vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  vi.spyOn(api, "uploadFile").mockImplementation((_file, { signal } = {}) => new Promise((_resolve, reject) => {
    signal!.addEventListener("abort", () => reject(new Error("aborted")));
  }) as never);
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png");
  expect(ui.query("#uploadCancelButton")).toBeNull();
  expect(ui.query("#uploadCloseButton")).toBeNull();

  await ui.start();
  expect(ui.statuses()).toEqual(["uploading"]);
  expect(ui.query("#uploadCloseButton")).toBeNull();

  await act(async () => ui.query("#uploadCancelButton")!.click());
  expect(ui.statuses()).toEqual(["pending"]);
  expect(ui.query("#uploadCancelButton")).toBeNull();
  expect(ui.query("#uploadCloseButton")).not.toBeNull();
  expect(ui.query<HTMLButtonElement>("#uploadStartButton")!.disabled).toBe(false);
  await ui.unmount();
});

test("CLEAR LIST appears once everything is sent, and keeps the folder and tags for the next files", async () => {
  vi.spyOn(api, "uploadFile").mockResolvedValue(undefined as never);
  vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png");
  expect(ui.query("#uploadClearButton")).toBeNull();
  await act(async () => {
    const select = ui.query<HTMLSelectElement>("#uploadFolder")!;
    Object.getOwnPropertyDescriptor(ui.dom.window.HTMLSelectElement.prototype, "value")!.set!.call(select, "F1");
    select.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true }));
  });

  await ui.start();
  expect(ui.query("#uploadClearButton")).not.toBeNull();
  expect(ui.query("#uploadCloseButton")).not.toBeNull();

  await ui.choose("b.png");
  expect(ui.query("#uploadClearButton")).toBeNull();
  expect(ui.query("#uploadCloseButton")).not.toBeNull();
  await ui.start();

  await act(async () => ui.query("#uploadClearButton")!.click());
  expect(ui.query("#uploadList")).toBeNull();
  expect(ui.query("#uploadDialog footer")).toBeNull();
  expect(ui.query("#uploadDialog")).not.toBeNull();
  expect(ui.query<HTMLSelectElement>("#uploadFolder")!.value).toBe("F1");
  expect(ui.dom.window.document.activeElement).toBe(ui.query("#uploadDropZone"));
  await ui.unmount();
});

test("removing the last row after a cancel goes back to the start", async () => {
  vi.spyOn(api, "uploadFile").mockImplementation((_file, { signal } = {}) => new Promise((_resolve, reject) => {
    signal!.addEventListener("abort", () => reject(new Error("aborted")));
  }) as never);
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png");
  await ui.start();
  await act(async () => ui.query("#uploadCancelButton")!.click());
  await act(async () => ui.query('button[aria-label="Remove a.png"]')!.click());
  expect(ui.query("#uploadDialog footer")).toBeNull();
  await ui.unmount();
});

test("leaving the viewer closes the dialog and stops the upload, and reconnecting doesn't reopen it", async () => {
  let signal: AbortSignal | undefined;
  vi.spyOn(api, "uploadFile").mockImplementation((_file, options = {}) => {
    signal = options.signal;
    return new Promise(() => {}) as never;
  });
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png");
  await ui.start();

  await act(async () => setShellView("login"));
  expect(ui.query("#uploadDialog")).toBeNull();
  expect(signal!.aborted).toBe(true);

  await act(async () => setShellView("viewer"));
  expect(ui.query("#uploadDialog")).toBeNull();
  await ui.unmount();
});

test("a file already sent isn't aborted or put back: cancel only keeps the rest from being sent", async () => {
  vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  let finish = () => {};
  let signal: AbortSignal | undefined;
  const upload = vi.spyOn(api, "uploadFile").mockImplementation((_file, options = {}) => {
    signal = options.signal;
    options.onSent?.();
    return new Promise<void>((resolve) => {
      finish = resolve;
    }) as never;
  });
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png", "b.png");
  await ui.start();
  expect(ui.statuses()).toEqual(["adding", "pending"]);
  expect(ui.query("#uploadList li")!.textContent).toContain("Processing");
  expect(ui.query("#uploadList li [role=progressbar]")!.hasAttribute("aria-valuenow")).toBe(false);

  await act(async () => ui.query("#uploadCancelButton")!.click());
  expect(signal!.aborted).toBe(false);
  expect(ui.query<HTMLButtonElement>("#uploadCancelButton")!.disabled).toBe(true);
  expect(ui.statuses()).toEqual(["adding", "pending"]);

  await act(async () => finish());
  expect(ui.statuses()).toEqual(["done", "pending"]);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(ui.query("#uploadCancelButton")).toBeNull();
  expect(ui.query("#uploadCloseButton")).not.toBeNull();
  expect(actions.uploadsFinished).toHaveBeenCalledTimes(1);
  await ui.unmount();
});

test.each([
  ["no answer", new Error("The connection to the server was lost")],
  ["a timeout from Eagle", new api.ApiError(504, "Eagle request timed out")],
  ["a library switch", new api.ApiError(409, "The library changed", "LIBRARY_CHANGED")],
])("after the file is sent, %s leaves the result unknown and the file isn't sent again", async (_name, failure) => {
  vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  const upload = vi.spyOn(api, "uploadFile").mockImplementation(async (_file, options = {}) => {
    options.onSent?.();
    throw failure;
  });
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png");
  await ui.start();

  expect(ui.statuses()).toEqual(["unknown"]);
  expect(ui.query("#uploadList li")!.textContent).toContain("Check the library");
  expect(ui.query("#uploadStartButton")).toBeNull();
  expect(ui.query("#uploadClearButton")).not.toBeNull();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(actions.uploadsFinished).toHaveBeenCalledTimes(1);

  await act(async () => ui.query('button[aria-label="Remove a.png"]')!.click());
  expect(ui.statuses()).toEqual([]);
  await ui.unmount();
});

test.each([
  ["a connection lost while sending", new Error("The connection to the server was lost"), false],
  ["a refusal after sending", new api.ApiError(403, "Uploading is not allowed for this viewer"), true],
  ["a library switch while sending", new api.ApiError(409, "The library changed", "LIBRARY_CHANGED"), false],
  ["a full disk after sending", new api.ApiError(507, "There isn't enough disk space"), true],
])("%s can be sent again", async (_name, failure, sent) => {
  vi.spyOn(actions, "uploadsFinished").mockImplementation(() => {});
  vi.spyOn(api, "uploadFile").mockImplementation(async (_file, options = {}) => {
    if (sent) options.onSent?.();
    throw failure;
  });
  const ui = await renderButton(true);
  await ui.open();
  await ui.choose("a.png");
  await ui.start();

  expect(ui.statuses()).toEqual(["failed"]);
  expect(ui.query("#uploadStartButton")).not.toBeNull();
  expect(actions.uploadsFinished).not.toHaveBeenCalled();
  await ui.unmount();
});

test("clicking outside the dialog doesn't close it", async () => {
  const ui = await renderButton(true);
  await ui.open();
  const dialog = ui.query("#uploadDialog")!;
  await act(async () => {
    dialog.dispatchEvent(new ui.dom.window.MouseEvent("click", { bubbles: true, clientX: 1, clientY: 1 }));
  });
  expect(ui.query("#uploadDialog")).not.toBeNull();
  await ui.unmount();
});

test("a file over the limit is marked straight away and never sent", async () => {
  const upload = vi.spyOn(api, "uploadFile").mockResolvedValue(undefined as never);
  const ui = await renderButton(true);
  await ui.open();
  const input = ui.query<HTMLInputElement>("#uploadFileInput")!;
  const file = new ui.dom.window.File(["data"], "huge.mov");
  Object.defineProperty(file, "size", { value: 2 * 1024 * 1024 * 1024 + 1 });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true }));
  });

  expect(ui.statuses()).toEqual(["failed"]);
  expect(ui.dom.window.document.body.textContent).toContain("2 GB");
  expect(ui.query("#uploadStartButton")).toBeNull();
  expect(upload).not.toHaveBeenCalled();
  await ui.unmount();
});

test("images and videos get a thumbnail that is released with the dialog, and other files an icon", async () => {
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation((file) => `blob:${(file as File).name}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const ui = await renderButton(true);
  await ui.open();
  const input = ui.query<HTMLInputElement>("#uploadFileInput")!;
  const { File } = ui.dom.window;
  const files = [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.mp4", { type: "video/mp4" }), new File(["c"], "c.zip", { type: "application/zip" })];
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => {
    input.dispatchEvent(new ui.dom.window.Event("change", { bubbles: true }));
  });

  expect(ui.query<HTMLImageElement>("li img")!.getAttribute("src")).toBe("blob:a.png");
  expect(ui.query<HTMLVideoElement>("li video")!.getAttribute("src")).toBe("blob:b.mp4#t=0.1");
  expect(create).toHaveBeenCalledTimes(2);

  await act(async () => {
    ui.query("li img")!.dispatchEvent(new ui.dom.window.Event("error"));
  });
  expect(ui.query("li img")).toBeNull();

  await ui.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:a.png");
  expect(revoke).toHaveBeenCalledWith("blob:b.mp4");
});

test("parseUploadTags accepts both comma styles and drops blanks and repeats", () => {
  expect(parseUploadTags(" travel, family、travel, ,")).toEqual(["travel", "family"]);
});
