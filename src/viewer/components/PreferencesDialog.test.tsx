import { act } from "react";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountSideMenu } from "./AccountSideMenu";
import { getThemeState, setThemePreference } from "../themeState";
import { getSearchControlsState, setSearchControlsState } from "../searchControlsState";
import { getSubfoldersVisible, setSubfoldersVisible } from "../subfolderVisibilityState";
import { getItemActionsVisible, setItemActionsVisible } from "../itemActionsVisibilityState";
import * as actions from "../shellActions";

async function withPreferences(run: (ui: {
  dom: JSDOM;
  container: Element;
  choose: (label: string) => Promise<void>;
  click: (label: string) => Promise<void>;
  open: () => Promise<void>;
  pageSize: ReturnType<typeof vi.spyOn>;
}) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const previous = { theme: getThemeState().preference, search: getSearchControlsState(), subfolders: getSubfoldersVisible(), actions: getItemActionsVisible() };
  let root: Root | undefined;
  try {
    for (const name of ["window", "document", "navigator", "Node", "HTMLElement", "CustomEvent"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setThemePreference("light");
    setSubfoldersVisible(false);
    setItemActionsVisible(true);
    setSearchControlsState({ ...previous.search, selectedLimit: 30 });
    const pageSize = vi.spyOn(actions, "changePageSize").mockImplementation((value) => {
      setSearchControlsState({ ...getSearchControlsState(), selectedLimit: Number(value) });
    });
    const { createRoot } = await import("react-dom/client");
    const container = dom.window.document.querySelector("#root")!;
    root = createRoot(container);
    await act(async () => { root?.render(<TooltipProvider><SidebarProvider><AccountSideMenu /></SidebarProvider></TooltipProvider>); });
    const open = async () => {
      await act(async () => { container.querySelector<HTMLButtonElement>("#authAccountLabel")!.click(); });
      await act(async () => { container.querySelector<HTMLButtonElement>('[aria-controls="preferencesDialog"]')!.click(); });
    };
    const click = async (label: string) => {
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>("#preferencesDialog button")).find((node) => node.getAttribute("aria-label") === label || node.textContent === label)!;
      expect(button).toBeDefined();
      await act(async () => { button.click(); });
    };
    const choose = async (label: string) => {
      const button = container.querySelector<HTMLButtonElement>(`#preferencesDialog [aria-label="${label}"]`)!;
      await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true, button: 0 })); });
    };
    await open();
    await run({ dom, container, choose, click, open, pageSize });
  } finally {
    await act(async () => root?.unmount());
    setThemePreference(previous.theme);
    setSubfoldersVisible(previous.subfolders);
    setItemActionsVisible(previous.actions);
    setSearchControlsState(previous.search);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  }
}

function expectOriginalSettings() {
  expect(getThemeState().preference).toBe("light");
  expect(getSearchControlsState().selectedLimit).toBe(30);
  expect(getSubfoldersVisible()).toBe(false);
  expect(getItemActionsVisible()).toBe(true);
}

test("applies all preferences together only when Done is pressed", async () => {
  await withPreferences(async ({ dom, container, choose, click, pageSize }) => {
    const storage = { ...dom.window.localStorage };
    for (const label of ["Dark", "240 items per page", "Show subfolders", "Hide item detail panel actions"]) await choose(label);
    expectOriginalSettings();
    expect({ ...dom.window.localStorage }).toEqual(storage);
    expect(pageSize).not.toHaveBeenCalled();
    await click("Done");
    expect(container.querySelector("#preferencesDialog")).toBeNull();
    expect(getThemeState().preference).toBe("dark");
    expect(getSubfoldersVisible()).toBe(true);
    expect(getItemActionsVisible()).toBe(false);
    expect(getSearchControlsState().selectedLimit).toBe(240);
    expect(pageSize).toHaveBeenCalledExactlyOnceWith(240);
  });
});

test.each(["Cancel", "Close preferences", "Escape", "Backdrop"])("discards draft settings and a pending reset on %s", async (dismiss) => {
  await withPreferences(async ({ dom, container, choose, click, open, pageSize }) => {
    dom.window.localStorage.setItem("eagleSidebarWidth", "352");
    const storage = { ...dom.window.localStorage };
    await click("Reset to default");
    await choose("Dark");
    await choose("240 items per page");
    const dialog = container.querySelector<HTMLDialogElement>("#preferencesDialog")!;
    if (dismiss === "Escape") {
      await act(async () => { dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })); });
    } else if (dismiss === "Backdrop") {
      await act(async () => { dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, clientX: -1, clientY: -1 })); });
    } else await click(dismiss);
    expectOriginalSettings();
    expect(pageSize).not.toHaveBeenCalled();
    expect({ ...dom.window.localStorage }).toEqual(storage);
    expect(container.querySelector("#preferencesDialog")).toBeNull();
    await open();
    expect(container.querySelector('#preferencesDialog [aria-label="Light"]')?.getAttribute("data-state")).toBe("active");
    expect(container.querySelector('#preferencesDialog [aria-label="30 items per page"]')?.getAttribute("data-state")).toBe("active");
  });
});

test("applies a pending reset with the final selected values without an intermediate page reload", async () => {
  await withPreferences(async ({ dom, choose, click, pageSize }) => {
    dom.window.localStorage.setItem("eagleSidebarWidth", "352");
    await click("Reset to default");
    await choose("Dark");
    await choose("240 items per page");
    expectOriginalSettings();
    expect(dom.window.localStorage.getItem("eagleSidebarWidth")).toBe("352");
    await click("Done");
    expect(getThemeState().preference).toBe("dark");
    expect(dom.window.localStorage.getItem("eagleSidebarWidth")).toBeNull();
    expect(pageSize).toHaveBeenCalledExactlyOnceWith(240);
  });
});
