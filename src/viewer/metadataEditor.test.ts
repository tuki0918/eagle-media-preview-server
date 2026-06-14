import { afterEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { metadataChipPicker, previewEditActions, previewEditField } from "./metadataEditor";
import type { MetadataSuggestion } from "./metadata";

function withDocument() {
  const dom = new JSDOM("<!doctype html><body></body>");
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

describe("metadata editor helpers", () => {
  test("renders selected chips and adds a typed tag with Enter", () => {
    const { cleanup } = withDocument();
    try {
      const picker = metadataChipPicker({
        kind: "tag",
        initialValues: [" alpha ", "alpha", ""],
        placeholder: "Add tag",
        inputLabel: "Add tag",
        labelForValue: (value) => value,
        getSuggestions: () => [],
        normalizeValue: (value) => String(value || "").trim(),
      });
      document.body.append(picker.element);

      expect([...picker.element.querySelectorAll(".preview-edit-chip span")].map((node) => node.textContent)).toContain("alpha");
      const input = picker.element.querySelector<HTMLInputElement>(".preview-chip-input");
      expect(input).toBeTruthy();
      input!.value = "beta";
      input!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(picker.values()).toEqual(["alpha", "beta"]);
    } finally {
      cleanup();
    }
  });

  test("adds the first suggestion for category picker Enter", async () => {
    const { cleanup } = withDocument();
    try {
      const suggestions: MetadataSuggestion[] = [
        { value: "folder-1", label: "Folder 1", meta: "10 items" },
      ];
      const picker = metadataChipPicker({
        kind: "category",
        initialValues: [],
        placeholder: "Add category",
        inputLabel: "Add category",
        labelForValue: (value) => value,
        getSuggestions: () => suggestions,
        normalizeValue: (value) => String(value || "").trim(),
      });
      document.body.append(picker.element);

      const input = picker.element.querySelector<HTMLInputElement>(".preview-chip-input");
      input!.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
      await Promise.resolve();
      input!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      expect(picker.values()).toEqual(["folder-1"]);
    } finally {
      cleanup();
    }
  });

  test("renders edit field and actions rows", () => {
    const { cleanup } = withDocument();
    try {
      const control = document.createElement("input");
      const field = previewEditField("Tags", control);
      expect(field.className).toBe("preview-edit-row");
      expect(field.textContent).toBe("Tags");
      expect(field.contains(control)).toBe(true);

      const saveButton = document.createElement("button");
      const status = document.createElement("span");
      const actions = previewEditActions(saveButton, status);
      expect(actions.className).toBe("preview-edit-actions");
      expect(actions.contains(saveButton)).toBe(true);
      expect(actions.contains(status)).toBe(true);
    } finally {
      cleanup();
    }
  });
});
