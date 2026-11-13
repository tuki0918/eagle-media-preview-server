import { afterEach, expect, test, vi } from "vitest";
import { getLibraryListState, getPickedLibraryId, normalizeLibraryList, refreshLibraryList, setLibraryListState, setPickedLibraryId } from "./libraryListState";

afterEach(() => {
  setLibraryListState({ currentId: "", libraries: [] });
  vi.unstubAllGlobals();
});

function stubStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

test("keeps only well-formed libraries from the server's answer", () => {
  expect(normalizeLibraryList({
    libraries: [
      { id: "a", name: "Photos", status: "ready" },
      { id: "b", name: "", status: "building", loaded: 3, total: 9 },
      { id: "c", name: "Old", status: "weird" },
      { name: "no id" },
      null,
    ],
  })).toEqual([
    { id: "a", name: "Photos", status: "ready" },
    { id: "b", name: "Library", status: "building", loaded: 3, total: 9 },
    { id: "c", name: "Old", status: "ready" },
  ]);
  expect(normalizeLibraryList(null)).toEqual([]);
});

test("a server that doesn't list libraries leaves the list empty", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 })));
  await refreshLibraryList("a");
  expect(getLibraryListState()).toEqual({ currentId: "a", libraries: [] });
});

test("forgets a picked library the server no longer serves", async () => {
  const storage = stubStorage();
  setPickedLibraryId("gone");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ libraries: [{ id: "a", name: "Photos", status: "ready" }] }), { status: 200 })));
  await refreshLibraryList("a");
  expect(getLibraryListState().libraries.map((library) => library.id)).toEqual(["a"]);
  expect(getPickedLibraryId()).toBe("");
  expect(storage.size).toBe(0);
});
