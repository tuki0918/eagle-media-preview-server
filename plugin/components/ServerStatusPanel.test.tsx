import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { SortIndexProgress } from "./ServerStatusPanel";

function render(sortIndex: Parameters<typeof SortIndexProgress>[0]["sortIndex"]) {
  const doc = new JSDOM(renderToStaticMarkup(<SortIndexProgress sortIndex={sortIndex} />)).window.document;
  return doc.querySelector('[role="progressbar"]')!;
}

describe("Advanced Sort index progress", () => {
  test("shows how far the scan has got", () => {
    const bar = render({ status: "building", loaded: 1234, total: 5000 });
    expect(bar.getAttribute("aria-valuenow")).toBe("24");
    expect(bar.getAttribute("aria-valuetext")).toBe("Scanning library… 1,234 / 5,000 (24%)");
  });

  test("shows activity without a number until the item count is known", () => {
    for (const sortIndex of [null, { status: "building" as const, loaded: 0, total: 0 }]) {
      const bar = render(sortIndex);
      expect(bar.hasAttribute("aria-valuenow")).toBe(false);
      expect(bar.getAttribute("aria-valuetext")).toBe("Scanning library…");
    }
  });

  test("says when the index is ready or failed", () => {
    expect(render({ status: "ready", loaded: 300, total: 300 }).getAttribute("aria-valuetext")).toBe("Ready · 300 items");
    expect(render({ status: "ready", loaded: 1, total: 1 }).getAttribute("aria-valuetext")).toBe("Ready · 1 item");
    expect(render({ status: "failed", loaded: 0, total: 0 }).getAttribute("aria-valuetext")).toBe("Scan failed · retried when a viewer connects");
    expect(render(null).getAttribute("aria-label")).toBe("Advanced Sort Index");
  });
});
