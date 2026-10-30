import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setFolderCoverFetcher } from "../folderCovers";
import type { EagleItem } from "../types";
import { FolderCover } from "./FolderCover";
import { setMediaFallbackCheck } from "../api";

let dom: JSDOM;
let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(async () => {
  dom = new JSDOM("<!doctype html><div id=\"root\"></div>", { url: "http://localhost/" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = dom.window.document.querySelector("#root") as HTMLDivElement;
  const { createRoot } = await import("react-dom/client");
  root = createRoot(container);
});

afterEach(async () => {
  try {
    await act(async () => root?.unmount());
  } finally {
    root = undefined;
    setFolderCoverFetcher(null);
    setMediaFallbackCheck(null);
    vi.unstubAllGlobals();
    dom?.window.close();
  }
});

test("falls back from an image thumbnail to the original and then the folder icon", async () => {
  setFolderCoverFetcher(async () => ({ id: "image/one", ext: "png" }));
  await act(async () => root?.render(<FolderCover folderId="folder-one" />));
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/items/image%2Fone/thumb");
  expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  await act(async () => {
    container.querySelector("img")?.dispatchEvent(new dom.window.Event("error"));
  });
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/file/image%2Fone");
  await act(async () => {
    container.querySelector("img")?.dispatchEvent(new dom.window.Event("error"));
  });
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector(".lucide-folder")).not.toBeNull();
});

test("ignores a previous folder's late result and skips requests for empty folders", async () => {
  let finishPrevious!: (item: EagleItem | null) => void;
  const fetcher = vi.fn((folderId: string) => folderId === "previous"
    ? new Promise<EagleItem | null>((resolve) => { finishPrevious = resolve; })
    : Promise.resolve({ id: "current-image", ext: "jpg" }));
  setFolderCoverFetcher(fetcher);
  await act(async () => root?.render(<FolderCover folderId="previous" />));
  await act(async () => root?.render(<FolderCover folderId="current" />));
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/items/current-image/thumb");
  await act(async () => finishPrevious({ id: "previous-image", ext: "jpg" }));
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/items/current-image/thumb");
  await act(async () => root?.render(<FolderCover folderId="empty" empty />));
  expect(container.querySelector("img")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("does not request an original when the media availability check refuses fallback", async () => {
  setFolderCoverFetcher(async () => ({ id: "image", ext: "jpg" }));
  setMediaFallbackCheck(async () => false);
  await act(async () => root?.render(<FolderCover folderId="folder-one" />));
  await act(async () => {
    container.querySelector("img")?.dispatchEvent(new dom.window.Event("error"));
  });
  expect(container.querySelector("img")).toBeNull();
});
