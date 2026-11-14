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

// Waits (in act, up to a second) until `ready` holds: on a slow machine a menu closed by the last
// pick may still be closing, and a new one may not have rendered its items yet.
async function waitFor(ready: () => boolean, what: string) {
  for (let waited = 0; !ready(); waited += 10) {
    if (waited >= 1000) throw new Error(`Timed out waiting for ${what}`);
    await act(async () => new Promise((resolveWait) => setTimeout(resolveWait, 10)));
  }
}

async function openSortMenu() {
  const trigger = document.querySelector<HTMLButtonElement>("#sortSelect")!;
  // A menu that is still open (closing after the last pick) would take this press as "close".
  await waitFor(() => trigger.getAttribute("aria-expanded") !== "true", "the sort menu to close");
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  });
  await waitFor(() => document.querySelectorAll('[role="menuitemradio"]').length > 0, "the sort menu items");
}

async function pick(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((element) => element.textContent?.includes(label));
  if (!item) throw new Error(`Missing menu item: ${label}`);
  await act(async () => item.click());
}

function directionButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`#sortDirection button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing direction button: ${label}`);
  return button;
}

test("picking a sort starts it in its default direction", async () => {
  const changeSort = vi.spyOn(actions, "changeSort").mockImplementation(() => {});
  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable selectedSort="filesize" selectedOrder="asc" />));

  await openSortMenu();
  expect(document.body.textContent).toContain("Experimental");
  await pick("Name");
  expect(changeSort).toHaveBeenLastCalledWith("name", "");

  await openSortMenu();
  await pick("Default order");
  expect(changeSort).toHaveBeenLastCalledWith("", "");
});

test("the direction buttons beside the menu name and switch the direction", async () => {
  const changeSort = vi.spyOn(actions, "changeSort").mockImplementation(() => {});
  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable selectedSort="filesize" selectedOrder="" />));

  // File size starts largest first, which is stored as "".
  expect(directionButton("Largest first").getAttribute("aria-pressed")).toBe("true");
  expect(directionButton("Smallest first").getAttribute("aria-pressed")).toBe("false");
  await act(async () => directionButton("Smallest first").click());
  expect(changeSort).toHaveBeenLastCalledWith("filesize", "asc");

  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable selectedSort="filesize" selectedOrder="asc" />));
  await act(async () => directionButton("Largest first").click());
  expect(changeSort).toHaveBeenLastCalledWith("filesize", "");
});

test("the menu lists only what to sort by, and the direction is off for the default order", async () => {
  await act(async () => root.render(<AdvancedFilters filtersOpen sortAvailable />));
  expect([...document.querySelectorAll<HTMLButtonElement>("#sortDirection button")].every((button) => button.disabled)).toBe(true);
  await openSortMenu();
  const labels = [...document.querySelectorAll('[role="menuitemradio"]')].map((element) => element.textContent);
  expect(labels).toContain("Default order");
  expect(labels).toContain("Date added");
  expect(labels.some((label) => /Ascending|Descending|first/.test(label ?? ""))).toBe(false);
});
