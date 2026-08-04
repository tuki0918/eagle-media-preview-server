import { afterEach, describe, expect, test } from "vitest";
import {
  clearSelection,
  getSelectionState,
  setItemsSelected,
  toggleSelection,
} from "./selectionState";

describe("media selection state", () => {
  afterEach(() => {
    clearSelection();
  });

  test("toggles items by stable Eagle id", () => {
    const item = { id: "item-1", name: "Photo", ext: "jpg" };

    toggleSelection(item);
    expect(getSelectionState().items).toEqual([item]);
    expect(getSelectionState().ids.has("item-1")).toBe(true);

    toggleSelection({ ...item, name: "Updated photo" });
    expect(getSelectionState().items).toEqual([]);
  });

  test("selects and clears a visible group without touching other pages", () => {
    const firstPage = [{ id: "1" }, { id: "2" }];
    const secondPage = [{ id: "3" }];

    setItemsSelected(secondPage, true);
    setItemsSelected(firstPage, true);
    expect(getSelectionState().items.map((item) => item.id)).toEqual(["3", "1", "2"]);

    setItemsSelected(firstPage, false);
    expect(getSelectionState().items.map((item) => item.id)).toEqual(["3"]);
  });

  test("ignores items without an id", () => {
    toggleSelection({ name: "No id" });
    expect(getSelectionState().items).toEqual([]);
  });
});
