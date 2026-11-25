import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import type { PanelLibrarySortIndex } from "../service/standalonePanel.cjs";
import { LibrarySortIndexes } from "./LibrarySortIndexes";

function render(libraries: PanelLibrarySortIndex[]) {
  return new JSDOM(renderToStaticMarkup(<LibrarySortIndexes libraries={libraries} />)).window.document;
}

test("shows a named progress bar directly for one library", () => {
  const doc = render([{ id: "photos", name: "Photos", status: "building", loaded: 12, total: 40 }]);
  expect(doc.querySelector("details")).toBeNull();
  expect(doc.body.textContent).toContain("Photos");
  const bar = doc.querySelector('[role="progressbar"]')!;
  expect(bar.getAttribute("aria-label")).toBe("Advanced Sort Index for Photos");
  expect(bar.getAttribute("aria-valuenow")).toBe("30");
});

test("summarizes multiple libraries and shows each library's status when expanded", () => {
  const doc = render([
    { id: "photos", name: "Photos", status: "ready", loaded: 500, total: 500 },
    { id: "work", name: "Work", status: "building", loaded: 0, total: 0 },
    { id: "archive", name: "Archive", status: "waiting" },
    { id: "legacy", name: "Legacy", status: "failed", reason: "Unsupported library format" },
    { id: "travel", name: "Travel", status: "unavailable", reason: "Library folder was not found" },
  ]);
  const details = doc.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")?.textContent).toContain("1 / 5 libraries ready · 1 scanning · 1 waiting · 1 failed · 1 unavailable");
  expect(details.querySelector("summary [role=progressbar]")).toBeNull();
  details.querySelector("summary")?.click();
  expect(details.open).toBe(true);
  const rows = Array.from(details.querySelectorAll("li"));
  expect(rows[0].textContent).toMatch(/Photos.*Ready/);
  expect(rows[1].querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
  expect(rows[2].textContent).toMatch(/Archive.*Waiting to scan/);
  expect(rows[3].textContent).toMatch(/Legacy.*Scan failed.*Unsupported library format/);
  expect(rows[4].textContent).toMatch(/Travel.*Unavailable.*Library folder was not found/);
});
