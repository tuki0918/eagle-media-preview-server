import { afterEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { directFileLink, directFileUrl, extensionPill, previewChipList, tableCell } from "./dom";

function withDocument(url = "http://127.0.0.1:5173/viewer?x=1") {
  const dom = new JSDOM("<!doctype html><body></body>", { url });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  return {
    cleanup: () => {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
      dom.window.close();
    },
  };
}

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { window?: Window & typeof globalThis }).window;
});

describe("viewer DOM helpers", () => {
  test("renders table cells and extension pills", () => {
    const { cleanup } = withDocument();
    try {
      const cell = tableCell("Value", "value-cell", "Full value");
      expect(cell.outerHTML).toBe('<span class="value-cell" title="Full value">Value</span>');

      const pill = extensionPill({ ext: "jpg" });
      expect(pill.className).toBe("ext-pill");
      expect(pill.textContent).toBe("JPG");
      expect(pill.dataset.ext).toBe("jpg");
    } finally {
      cleanup();
    }
  });

  test("builds direct file links without connection query state", () => {
    const { cleanup } = withDocument();
    try {
      expect(directFileUrl({ id: "item 1" }, "http://localhost/viewer?connectionId=abc")).toBe("http://localhost/file/item%201");
      const link = directFileLink({ id: "item 1" });
      expect(link.className).toBe("direct-file-link");
      expect(link.textContent).toBe("Open file");
      expect(link.target).toBe("_blank");
      expect(link.href).toBe("http://127.0.0.1:5173/file/item%201");
    } finally {
      cleanup();
    }
  });

  test("renders preview chip lists", () => {
    const { cleanup } = withDocument();
    try {
      const list = previewChipList(["alpha", "beta"]);
      expect(list.className).toBe("preview-chip-list");
      expect([...list.querySelectorAll(".preview-chip")].map((chip) => chip.textContent)).toEqual(["alpha", "beta"]);
    } finally {
      cleanup();
    }
  });
});
