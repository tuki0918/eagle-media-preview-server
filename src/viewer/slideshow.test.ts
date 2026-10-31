import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_SLIDESHOW_SETTINGS, readSlideshowSettings, saveSlideshowSettings, SlideshowSource, slideshowMediaKind, type SlideshowQuery } from "./slideshow";
import type { EagleItem, LoadItemsResponse } from "./types";

const query: SlideshowQuery = { query: "blue sky", tags: ["design"], folderId: "folder-1", smartFolderId: "", ext: "", rating: "5" };
const items: EagleItem[] = Array.from({ length: 95 }, (_, index) => ({ id: String(index), name: `Image ${index}`, ext: "jpg" }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function loaderFor(total = items.length) {
  return vi.fn(async (params: URLSearchParams): Promise<LoadItemsResponse> => {
    const offset = Number(params.get("offset"));
    return { items: items.slice(offset, offset + Number(params.get("limit"))), total };
  });
}

test("crosses pages, prefetches the next page, and retains a snapshot of every filter", async () => {
  const loader = loaderFor();
  const original = { ...query, tags: [...query.tags] };
  const source = new SlideshowSource(original, loader);
  original.tags.push("later");
  original.query = "changed";
  try {
    expect((await source.itemAt(0))?.id).toBe("0");
    expect((await source.itemAt(29))?.id).toBe("29");
    expect((await source.itemAt(30))?.id).toBe("30");
    expect((await source.itemAt(60))?.id).toBe("60");
    expect((await source.itemAt(94))?.id).toBe("94");
    expect(await source.itemAt(95)).toBeNull();
    expect(await source.itemAt(-1)).toBeNull();
    expect(source.total).toBe(95);
    for (const [params] of loader.mock.calls) {
      expect(params.get("q")).toBe("blue sky");
      expect(params.getAll("tags")).toEqual(["design"]);
      expect(params.get("folderId")).toBe("folder-1");
      expect(params.get("rating")).toBe("5");
      expect(params.get("limit")).toBe("30");
    }
    expect(loader.mock.calls.map(([params]) => params.get("offset"))).toEqual(["0", "30", "60", "90"]);
    // Distant pages are discarded rather than keeping the whole library in memory.
    expect((await source.itemAt(0))?.id).toBe("0");
    expect(loader.mock.calls.filter(([params]) => params.get("offset") === "0")).toHaveLength(2);
  } finally { source.dispose(); }
});

test("smart folders retain smart-folder semantics on every page", async () => {
  const loader = loaderFor();
  const source = new SlideshowSource({ ...query, smartFolderId: "smart-1" }, loader);
  try {
    await source.itemAt(30);
    expect(loader.mock.calls[0][0].get("smartFolderId")).toBe("smart-1");
    expect(loader.mock.calls[0][0].has("folderId")).toBe(false);
  } finally { source.dispose(); }
});

test("a failed prefetch does not interrupt the current slide and is retried on demand", async () => {
  let failNextPage = true;
  const loader = vi.fn(async (params: URLSearchParams) => {
    const offset = Number(params.get("offset"));
    if (offset === 30 && failNextPage) { failNextPage = false; throw new Error("offline"); }
    return { items: items.slice(offset, offset + 30), total: items.length };
  });
  const source = new SlideshowSource(query, loader);
  try {
    expect((await source.itemAt(0))?.id).toBe("0");
    await Promise.resolve(); await Promise.resolve();
    expect((await source.itemAt(30))?.id).toBe("30");
    expect(loader.mock.calls.filter(([params]) => params.get("offset") === "30")).toHaveLength(2);
  } finally { source.dispose(); }
});

test("cancels outstanding requests when closed and ignores late responses", async () => {
  let resolve!: (value: LoadItemsResponse) => void;
  let signal!: AbortSignal;
  const source = new SlideshowSource(query, (_params, requestedSignal) => {
    signal = requestedSignal;
    return new Promise((done) => { resolve = done; });
  });
  const pending = source.itemAt(0);
  source.dispose();
  expect(signal.aborted).toBe(true);
  resolve({ items, total: items.length });
  await expect(pending).rejects.toThrow("cancelled");
  await expect(source.itemAt(0)).rejects.toThrow("closed");
});

test("rejects malformed or changed pages instead of silently ending playback", async () => {
  const source = new SlideshowSource(query, async () => ({ items: [], total: 30 }));
  await expect(source.itemAt(0)).rejects.toThrow("list has changed");
  source.dispose();
  const malformed = new SlideshowSource(query, async () => ({}));
  await expect(malformed.itemAt(0)).rejects.toThrow("Unable to read");
  malformed.dispose();
});

test("settings tolerate unavailable storage and validate persisted values", () => {
  expect(readSlideshowSettings()).toEqual(DEFAULT_SLIDESHOW_SETTINGS);
  const values = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  saveSlideshowSettings({ seconds: 10, effect: "slide", loop: true, showTitle: false, blurBackground: false });
  expect(readSlideshowSettings()).toEqual({ seconds: 10, effect: "slide", loop: true, showTitle: false, blurBackground: false });
  values.set("eagleSlideshowSettings", '{"seconds":10,"effect":"slide","loop":true}');
  expect(readSlideshowSettings()).toEqual({ seconds: 10, effect: "slide", loop: true, showTitle: true, blurBackground: true });
  values.set("eagleSlideshowSettings", '{"seconds":0,"effect":"invalid","loop":"true"}');
  expect(readSlideshowSettings()).toEqual(DEFAULT_SLIDESHOW_SETTINGS);
});

test("classifies mixed media and uses static thumbnails for other files", () => {
  for (const [ext, kind] of [["jpg", "image"], ["GIF", "image"], ["mp4", "video"], ["m4a", "audio"], ["pdf", "thumbnail"], ["psd", "thumbnail"]]) {
    expect(slideshowMediaKind({ ext })).toBe(kind);
  }
});
