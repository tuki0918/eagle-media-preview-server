import { afterEach, describe, expect, test, vi } from "vitest";
import { clearFolderCovers, loadFolderCover, setFolderCoverFetcher } from "./folderCovers";
import type { EagleItem } from "./types";

afterEach(() => {
  setFolderCoverFetcher(null);
  vi.unstubAllGlobals();
});

describe("folder covers", () => {
  test("shares requests per folder and keeps smart folder covers separate", async () => {
    const fetcher = vi.fn(async (folderId: string, smart: boolean) => ({ id: `${folderId}-${smart}` }));
    setFolderCoverFetcher(fetcher);
    const first = loadFolderCover("folder-one");
    expect(loadFolderCover("folder-one")).toBe(first);
    const smart = loadFolderCover("folder-one", true);
    expect(smart).not.toBe(first);
    expect(await first).toEqual({ id: "folder-one-false" });
    expect(await smart).toEqual({ id: "folder-one-true" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(loadFolderCover("folder-one")).toBe(first);
  });

  test("requests the first item with the correct normal or smart folder parameter", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [{ id: "cover", ext: "jpg" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadFolderCover("folder & 1")).toEqual({ id: "cover", ext: "jpg" });
    expect(await loadFolderCover("smart/1", true)).toEqual({ id: "cover", ext: "jpg" });
    const firstUrl = new URL(String(fetcher.mock.calls[0]?.[0]), "http://localhost");
    expect(firstUrl.pathname).toBe("/api/items");
    expect(Object.fromEntries(firstUrl.searchParams)).toEqual({ offset: "0", limit: "1", folderId: "folder & 1" });
    const smartUrl = new URL(String(fetcher.mock.calls[1]?.[0]), "http://localhost");
    expect(Object.fromEntries(smartUrl.searchParams)).toEqual({ offset: "0", limit: "1", smartFolderId: "smart/1" });
  });

  test("limits concurrent requests while completing every queued cover", async () => {
    const pending: Array<() => void> = [];
    let inFlight = 0;
    let peak = 0;
    let finished = 0;
    const fetcher = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => pending.push(resolve));
      inFlight -= 1;
      finished += 1;
      return null;
    });
    setFolderCoverFetcher(fetcher);
    const covers = Array.from({ length: 7 }, (_, index) => loadFolderCover(`folder-${index}`));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    while (finished < covers.length) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
      pending.splice(0).forEach((resolve) => resolve());
      await Promise.resolve();
    }
    expect(await Promise.all(covers)).toEqual(Array(7).fill(null));
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(peak).toBe(4);
  });

  test("retries failed requests and clears cached successful covers", async () => {
    const fetcher = vi.fn<((folderId: string, smart: boolean) => Promise<EagleItem | null>)>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue({ id: "cover" });
    setFolderCoverFetcher(fetcher);
    expect(await loadFolderCover("folder-one")).toBeNull();
    expect(await loadFolderCover("folder-one")).toEqual({ id: "cover" });
    clearFolderCovers();
    expect(await loadFolderCover("folder-one")).toEqual({ id: "cover" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test("does not request root or empty folders and caches folders without an item", async () => {
    const fetcher = vi.fn(async () => null);
    setFolderCoverFetcher(fetcher);
    expect(await loadFolderCover("")).toBeNull();
    expect(await loadFolderCover("   ")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const empty = loadFolderCover("empty-folder");
    expect(await empty).toBeNull();
    expect(loadFolderCover("empty-folder")).toBe(empty);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
