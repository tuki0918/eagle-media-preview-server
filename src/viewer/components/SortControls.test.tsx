import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdvancedFilters } from "./SearchControls";

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
