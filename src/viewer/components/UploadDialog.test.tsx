import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, expect, test, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import * as api from "../api";
import { getSearchControlsState, setSearchControlsState } from "../searchControlsState";
import * as actions from "../shellActions";
import { parseUploadTags, UploadButton } from "./UploadDialog";

const previousState = getSearchControlsState();

afterEach(() => {
  setSearchControlsState(previousState);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderButton(canUpload: boolean, selectedFolderId = "") {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  for (const name of ["window", "document", "navigator", "Node", "HTMLElement", "CustomEvent"] as const) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

test("parseUploadTags accepts both comma styles and drops blanks and repeats", () => {
  expect(parseUploadTags(" travel, family、travel, ,")).toEqual(["travel", "family"]);
});
