import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdvancedFilters } from "./SearchControls";
import { ResultStateView } from "./ResultState";

function parse(html: string) {
  return new JSDOM(html).window.document;
}

describe("experimental sort controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("shows the sort menu only when the server offers it", () => {
    const without = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen />));
    expect(without.querySelector("#sortSelect")).toBeNull();

    const withSort = parse(renderToStaticMarkup(<AdvancedFilters filtersOpen sortAvailable selectedSort="name" selectedOrder="desc" />));
    expect(withSort.querySelector("#sortSelect")?.getAttribute("aria-label")).toBe("Sort (experimental): Name ↓");

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

  test("shows a Cancel button under the loading message and calls it", async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
    for (const name of ["window", "document", "navigator", "Node", "Element", "HTMLElement"] as const) {
      vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
    }
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const onClick = vi.fn();
    const { createRoot } = await import("react-dom/client");
    let root: Root | undefined;
    try {
      const container = dom.window.document.querySelector("#root")!;
      root = createRoot(container);
      await act(async () => {
        root?.render(<ResultStateView kind="message" className="loading" text="Preparing sort… 5 / 10 items" action={{ label: "Cancel", onClick }} />);
      });
      expect(container.textContent).toContain("Preparing sort… 5 / 10 items");
      const button = [...container.querySelectorAll("button")].find((element) => element.textContent === "Cancel")!;
      await act(async () => {
        button.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);

      await act(async () => {
        root?.render(<ResultStateView kind="message" className="loading" text="Loading" />);
      });
      expect(container.querySelector("button")).toBeNull();
    } finally {
      await act(async () => {
        root?.unmount();
      });
      dom.window.close();
    }
  });
});
