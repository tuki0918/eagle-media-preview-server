import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdvancedFilters, mediaTypeOptions } from "./SearchControls";
import { MEDIA_TYPE_OPTIONS } from "../shellConfig";

function parse(html: string) {
  return new JSDOM(html).window.document;
}

describe("experimental sort controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("shows the sort menu disabled, with progress, while the server prepares its index", () => {
    const doc = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen sortPreparing="Preparing sort… 40%" selectedSort="name" />));
    const trigger = doc.querySelector<HTMLButtonElement>("#sortSelect");
    expect(trigger?.disabled).toBe(true);
    expect(trigger?.getAttribute("aria-label")).toBe("Sort (experimental): Preparing sort… 40%");
    for (const button of doc.querySelectorAll<HTMLButtonElement>("#sortDirection button")) expect(button.disabled).toBe(true);
  });

  test("doesn't open the sort menu while the server prepares its index", async () => {
    // Browsers still deliver pointerdown to a disabled button, and the menu opens on pointerdown.
    async function pressSort(props: { sortAvailable?: boolean; sortPreparing?: string }, how: "keyboard" | "pointer") {
      const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
      for (const name of ["window", "document", "navigator", "Node", "HTMLElement", "CustomEvent"] as const) {
        vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
      }
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const { createRoot } = await import("react-dom/client");
      const root = createRoot(dom.window.document.querySelector("#root")!);
      await act(async () => root.render(<AdvancedFilters filtersOpen selectedSort="name" {...props} />));
      const trigger = dom.window.document.querySelector<HTMLButtonElement>("#sortSelect")!;
      await act(async () => {
        trigger.dispatchEvent(how === "pointer"
          ? new dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 })
          : new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      });
      const state = trigger.getAttribute("data-state");
      await act(async () => root.unmount());
      return state;
    }

    for (const how of ["pointer", "keyboard"] as const) {
      expect(await pressSort({ sortPreparing: "Preparing sort… 40%" }, how)).toBe("closed");
      expect(await pressSort({ sortAvailable: true }, how)).toBe("open");
    }
  });

  test("shows the sort menu only when the server offers it", () => {
    const without = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen />));
    expect(without.querySelector("#sortSelect")).toBeNull();

    const withSort = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen sortAvailable selectedSort="name" selectedOrder="desc" />));
    expect(withSort.querySelector("#sortSelect")?.getAttribute("aria-label")).toBe("Sort (experimental): Name");
    expect(withSort.querySelector('#sortDirection [aria-pressed="true"]')?.getAttribute("aria-label")).toBe("Z → A");

    const defaultOrder = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen sortAvailable />));
    expect(defaultOrder.querySelector("#sortSelect")?.textContent).toBe("Default order");
    expect(defaultOrder.body.textContent).not.toMatch(/Eagle/);
  });

  test("keeps reset last; phones stack type, rating, then sort beside reset", () => {
    const doc = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen sortAvailable hasResettableFilters />));
    const row = doc.querySelector("#advancedFilters")!;
    const cells = [...row.children];
    expect(cells.map((cell) => cell.querySelector("button")?.id)).toEqual(["extSelect", "ratingSelect", "sortSelect", "resetFiltersButton"]);
    expect(row.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]");
    expect(row.className).toContain("max-[540px]:grid-cols-[minmax(0,1fr)_auto]");
    expect(cells[0].className).toContain("max-[540px]:col-span-2");
    expect(cells[1].className).toContain("max-[540px]:col-span-2");
    expect(cells[2].className).not.toContain("col-span");

    // Without the sort menu, phones keep rating next to reset.
    const plain = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen hasResettableFilters />)).querySelector("#advancedFilters")!;
    expect([...plain.children].map((cell) => cell.querySelector("button")?.id)).toEqual(["extSelect", "ratingSelect", "resetFiltersButton"]);
    expect(plain.children[1].className).not.toContain("col-span");
  });

});

describe("type menu options", () => {
  test("offers only All types for a folder found to hold none, but the defaults when the types are unknown", () => {
    expect(mediaTypeOptions([], "", false, true)).toEqual([]);
    expect(mediaTypeOptions([], "", true, false)).toEqual([]);
    expect(mediaTypeOptions([], "", false, false)).toEqual([...MEDIA_TYPE_OPTIONS]);
    expect(mediaTypeOptions(["png"], "", false, true)).toEqual(["png"]);
    // The chosen type stays offered so it can be seen and changed.
    expect(mediaTypeOptions([], "mp4", false, true)).toEqual(["mp4"]);
  });
});
