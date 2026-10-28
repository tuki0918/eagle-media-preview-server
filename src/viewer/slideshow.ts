import { ApiError } from "./api";
import { browserImageExts, playableAudioExts, playableVideoExts } from "./constants";
import { itemQueryParams, type ItemQueryState } from "./itemQuery";
import type { EagleItem, LoadItemsResponse } from "./types";

export type SlideshowEffect = "none" | "fade" | "slide";
export interface SlideshowSettings { seconds: number; effect: SlideshowEffect; loop: boolean }
export const DEFAULT_SLIDESHOW_SETTINGS: SlideshowSettings = { seconds: 5, effect: "fade", loop: false };
export const SLIDESHOW_SETTINGS_KEY = "eagleSlideshowSettings";
export const SLIDESHOW_PAGE_SIZE = 30;
export type SlideshowQuery = Omit<ItemQueryState, "offset" | "limit">;

export function readSlideshowSettings(): SlideshowSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SLIDESHOW_SETTINGS_KEY) || "null");
    return {
      seconds: [3, 5, 10, 15, 30, 60].includes(saved?.seconds) ? saved.seconds : 5,
      effect: ["none", "fade", "slide"].includes(saved?.effect) ? saved.effect : "fade",
      loop: saved?.loop === true,
    };
  } catch { return { ...DEFAULT_SLIDESHOW_SETTINGS }; }
}

export function saveSlideshowSettings(settings: SlideshowSettings) {
  try { window.localStorage.setItem(SLIDESHOW_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
}

export function slideshowMediaKind(item: EagleItem) {
  const ext = String(item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) return "video";
  if (playableAudioExts.has(ext)) return "audio";
  return browserImageExts.has(ext) ? "image" : "thumbnail";
}

type PageLoader = (params: URLSearchParams, signal: AbortSignal) => Promise<LoadItemsResponse>;
async function fetchPage(params: URLSearchParams, signal: AbortSignal): Promise<LoadItemsResponse> {
  const response = await fetch(`/api/items?${params}`, { credentials: "same-origin", signal });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data?.error || `HTTP ${response.status}`);
  return data;
}

/** Independent pagination: the viewer's page, scroll position and loaded items stay intact. */
export class SlideshowSource {
  total: number | null = null;
  private query: SlideshowQuery;
  private pages = new Map<number, EagleItem[]>();
  private pending = new Map<number, { promise: Promise<EagleItem[]>; controller: AbortController }>();
  private activePage = 0;
  private disposed = false;

  constructor(query: SlideshowQuery, private loader: PageLoader = fetchPage) {
    this.query = { ...query, tags: [...query.tags] };
  }

  async itemAt(index: number): Promise<EagleItem | null> {
    if (this.disposed) throw new Error("Slideshow closed");
    if (index < 0 || (this.total !== null && index >= this.total)) return null;
    const page = Math.floor(index / SLIDESHOW_PAGE_SIZE);
    this.activePage = page;
    this.prune();
    const item = await this.peek(index);
    // Prefetch metadata for only the following page; failures are retried on demand.
    if (this.total !== null && (page + 1) * SLIDESHOW_PAGE_SIZE < this.total) {
      void this.page(page + 1).catch(() => {});
    }
    return item;
  }

  /** Read a neighboring item without moving or pruning the playback cursor. */
  async peek(index: number): Promise<EagleItem | null> {
    if (this.disposed) throw new Error("Slideshow closed");
    if (index < 0 || (this.total !== null && index >= this.total)) return null;
    const items = await this.page(Math.floor(index / SLIDESHOW_PAGE_SIZE));
    const item = items[index % SLIDESHOW_PAGE_SIZE];
    if (!item && !(this.total !== null && index >= this.total)) {
      throw new Error("The list has changed. Close the slideshow and start again.");
    }
    return item ?? null;
  }

  dispose() {
    this.disposed = true;
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.pages.clear();
  }

  private prune() {
    for (const page of this.pages.keys()) {
      if (Math.abs(page - this.activePage) > 1) this.pages.delete(page);
    }
    for (const [page, request] of this.pending) {
      if (Math.abs(page - this.activePage) > 1) {
        request.controller.abort();
        this.pending.delete(page);
      }
    }
  }

  private page(page: number): Promise<EagleItem[]> {
    const cached = this.pages.get(page);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(page);
    if (pending) return pending.promise;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const params = itemQueryParams({ ...this.query, offset: page * SLIDESHOW_PAGE_SIZE, limit: SLIDESHOW_PAGE_SIZE });
    const promise = this.loader(params, controller.signal).then((data) => {
      if (this.disposed || controller.signal.aborted) throw new Error("Slideshow request cancelled");
      if (!Array.isArray(data?.items) || !Number.isFinite(data.total) || Number(data.total) < 0) {
        throw new Error("Unable to read the slideshow list. Please retry.");
      }
      this.total = Number(data.total);
      if (Math.abs(page - this.activePage) <= 1) this.pages.set(page, data.items);
      return data.items;
    }).finally(() => {
      clearTimeout(timer);
      if (this.pending.get(page)?.promise === promise) this.pending.delete(page);
    });
    this.pending.set(page, { promise, controller });
    return promise;
  }
}
