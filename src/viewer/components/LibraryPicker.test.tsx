import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountSideMenu } from "./AccountSideMenu";
import { getLibraryListState, setLibraryListState, type LibraryListState } from "../libraryListState";
import * as actions from "../shellActions";

async function withSideMenu(list: LibraryListState, run: (ui: { container: Element; fetchCalls: string[] }) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const previous = getLibraryListState();
  const fetchCalls: string[] = [];
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "HTMLElement", "CustomEvent"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Opening the picker asks for the list again; it answers with the same libraries.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify({ libraries: list.libraries }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    setLibraryListState(list);
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<TooltipProvider><SidebarProvider><AccountSideMenu /></SidebarProvider></TooltipProvider>); });
    await run({ container, fetchCalls });
  } finally {
    await act(async () => root?.unmount());
    setLibraryListState(previous);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  }
}

test("has no library picker on a server with one library", async () => {
  await withSideMenu({ currentId: "a", libraries: [{ id: "a", name: "Photos", status: "ready" }] }, async ({ container }) => {
    expect(container.querySelector("#libraryPickerButton")).toBeNull();
  });
});

test("lists the server's libraries and opens the one picked", async () => {
  const change = vi.spyOn(actions, "changeLibrary").mockImplementation(() => {});
  await withSideMenu({
    currentId: "a",
    libraries: [
      { id: "a", name: "Photos", status: "ready" },
      { id: "b", name: "Work", status: "building", loaded: 25, total: 100 },
      { id: "c", name: "Archive", status: "failed" },
    ],
  }, async ({ container, fetchCalls }) => {
    await act(async () => { container.querySelector<HTMLButtonElement>("#libraryPickerButton")!.click(); });
    expect(fetchCalls).toEqual(["/api/libraries"]);
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('#libraryPickerMenu [role="menuitemradio"]'));
    expect(items.map((item) => item.textContent)).toEqual(["Photos", "WorkReading… 25%", "ArchiveCan't be read right now"]);
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(items[2].disabled).toBe(true);

    await act(async () => { items[0].click(); });
    expect(change).not.toHaveBeenCalled();
    await act(async () => { container.querySelector<HTMLButtonElement>("#libraryPickerButton")!.click(); });
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('#libraryPickerMenu [role="menuitemradio"]')[1].click(); });
    expect(change).toHaveBeenCalledWith("b");
    expect(container.querySelector("#libraryPickerMenu")).toBeNull();
  });
});
