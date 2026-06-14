import { afterEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { nextStarValue, renderRating } from "./rating";

function withDocument() {
  const dom = new JSDOM("<!doctype html><div id=\"rating\"></div>");
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  return {
    container: dom.window.document.querySelector("#rating") as HTMLElement,
    cleanup: () => {
      globalThis.document = previousDocument;
      dom.window.close();
    },
  };
}

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

describe("viewer rating helper", () => {
  test("renders static rating stars with active state", () => {
    const { container, cleanup } = withDocument();
    try {
      renderRating(container, { star: 3 }, { interactive: false });
      const stars = [...container.querySelectorAll(".rating-star")];
      expect(stars).toHaveLength(5);
      expect(stars.map((star) => star.getAttribute("data-active"))).toEqual(["true", "true", "true", "false", "false"]);
      expect(stars.every((star) => star.getAttribute("aria-hidden") === "true")).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("renders interactive stars and emits toggled values", () => {
    const { container, cleanup } = withDocument();
    try {
      const selected: number[] = [];
      renderRating(container, { star: 2 }, { interactive: true, onSelect: (value) => selected.push(value) });
      const stars = [...container.querySelectorAll<HTMLButtonElement>("button.rating-star")];
      expect(stars).toHaveLength(5);
      expect(stars[1].getAttribute("aria-pressed")).toBe("true");
      stars[1].click();
      stars[4].click();
      expect(selected).toEqual([0, 5]);
    } finally {
      cleanup();
    }
  });

  test("toggles the current rating off", () => {
    expect(nextStarValue(4, 4)).toBe(0);
    expect(nextStarValue(4, 2)).toBe(2);
  });
});
