// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AdvancedFilters } from "./SearchControls";
import * as actions from "../shellActions";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Radix positions menus with ResizeObserver, which jsdom lacks.
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openSortMenu() {
  const trigger = document.querySelector<HTMLButtonElement>("#sortSelect")!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  });
}

async function pick(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((element) => element.textContent?.includes(label));
  if (!item) throw new Error(`Missing menu item: ${label}`);
  await act(async () => item.click());
}

test("picking a sort resets its direction; picking a direction keeps the sort", async () => {
  const changeSort = vi.spyOn(actions, "changeSort").mockImplementation(() => {});
  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable selectedSort="filesize" selectedOrder="desc" />));

  await openSortMenu();
  expect(document.body.textContent).toContain("Experimental");
  await pick("Name");
  expect(changeSort).toHaveBeenLastCalledWith("name", "");

  await openSortMenu();
  // File size is ascending by default, so that direction is stored as "".
  await pick("Ascending");
  expect(changeSort).toHaveBeenLastCalledWith("filesize", "");

  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable selectedSort="name" selectedOrder="" />));
  await openSortMenu();
  await pick("Descending");
  expect(changeSort).toHaveBeenLastCalledWith("name", "desc");

  await openSortMenu();
  await pick("Default order");
  expect(changeSort).toHaveBeenLastCalledWith("", "");
});

test("the direction choices appear only once a sort is picked", async () => {
  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable />));
  await openSortMenu();
  const labels = [...document.querySelectorAll('[role="menuitemradio"]')].map((element) => element.textContent);
  expect(labels).toContain("Default order");
  expect(labels).toContain("Date added");
  expect(labels.some((label) => label?.includes("Ascending"))).toBe(false);
});
