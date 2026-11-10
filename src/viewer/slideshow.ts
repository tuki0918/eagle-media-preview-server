import { ApiError, connectedLibraryHeaders } from "./api";
import { browserImageExts, playableAudioExts, playableVideoExts } from "./constants";
import { itemQueryParams, type ItemQueryState } from "./itemQuery";
import type { EagleItem, LoadItemsResponse } from "./types";

export type SlideshowEffect = "none" | "fade" | "slide";
export interface SlideshowSettings { seconds: number; effect: SlideshowEffect; loop: boolean; showTitle: boolean; blurBackground: boolean; reverse: boolean }
export const DEFAULT_SLIDESHOW_SETTINGS: SlideshowSettings = { seconds: 5, effect: "fade", loop: false, showTitle: true, blurBackground: true, reverse: false };
const SLIDESHOW_SETTINGS_KEY = "eagleSlideshowSettings";
const SLIDESHOW_PAGE_SIZE = 30;
// While the server indexes the library for a sort, a page is asked for again this often.
const SORT_INDEXING_RETRY_MS = 1500;
export type SlideshowQuery = Omit<ItemQueryState, "offset" | "limit">;

export function readSlideshowSettings(): SlideshowSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SLIDESHOW_SETTINGS_KEY) || "null");
    return {
      seconds: [3, 5, 10, 15, 30, 60].includes(saved?.seconds) ? saved.seconds : 5,
      effect: ["none", "fade", "slide"].includes(saved?.effect) ? saved.effect : "fade",
      loop: saved?.loop === true,
      showTitle: saved?.showTitle !== false,
      blurBackground: saved?.blurBackground !== false,
      reverse: saved?.reverse === true,
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
  const response = await fetch(`/api/items?${params}`, { credentials: "same-origin", headers: connectedLibraryHeaders(), signal });
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

  /**
   * With `reverse`, slide indexes still count up from 0 (shown as 1, 2, 3, …),
   * but slide 0 is the last item of the list, slide 1 the one before it, and so on.
   */
  constructor(query: SlideshowQuery, private loader: PageLoader = fetchPage, private readonly reverse = false) {
    this.query = { ...query, tags: [...query.tags] };
  }

  async itemAt(index: number): Promise<EagleItem | null> {
    if (this.disposed) throw new Error("Slideshow closed");
    // Reverse order needs the list length before it can locate the first slide.
    if (this.reverse && this.total === null && index >= 0) await this.page(0);
    const position = this.listPosition(index);
    if (position === null) return null;
    const page = Math.floor(position / SLIDESHOW_PAGE_SIZE);
    this.activePage = page;
    this.prune();
    const item = await this.read(position);
    // Prefetch metadata for only the page played next; failures are retried on demand.
    const nextPage = this.reverse ? page - 1 : page + 1;
    if (this.total !== null && nextPage >= 0 && nextPage * SLIDESHOW_PAGE_SIZE < this.total) {
      void this.page(nextPage).catch(() => {});
    }
    return item;
  }

  /** Read a neighboring item without moving or pruning the playback cursor. */
  async peek(index: number): Promise<EagleItem | null> {
    if (this.disposed) throw new Error("Slideshow closed");
    if (this.reverse && this.total === null && index >= 0) await this.page(0);
    const position = this.listPosition(index);
    return position === null ? null : this.read(position);
  }

  /** Map a slide index to its position in the list, or null when it is out of range. */
  private listPosition(index: number): number | null {
    if (index < 0 || (this.total !== null && index >= this.total)) return null;
    return this.reverse ? (this.total ?? 0) - 1 - index : index;
  }

  private async read(position: number): Promise<EagleItem | null> {
    const items = await this.page(Math.floor(position / SLIDESHOW_PAGE_SIZE));
    const item = items[position % SLIDESHOW_PAGE_SIZE];
    if (!item && !(this.total !== null && position >= this.total)) {
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

  // A sorted page that the server answered in the default order (index still building) is never
  // kept: it would mix with sorted pages. Wait for the index instead, and fail if it can't sort.
  private async loadSorted(params: URLSearchParams, signal: AbortSignal): Promise<LoadItemsResponse> {
    for (;;) {
      const data = await this.loader(params, signal);
      if (data?.sort?.status === "failed") throw new Error("Sorting is unavailable right now. Please retry.");
      // Sorted pages were asked for, but the server no longer sorts (Advanced Sort turned off).
      if (params.has("sort") && !data?.sort) throw new Error("Sorting was turned off. Reload the page to continue.");
      if (data?.sort?.status !== "indexing") return data;
      await new Promise<void>((resolve, reject) => {
        // The page request gives up after a while; a large library may still be indexing then.
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("Still preparing the sort. Please retry in a moment."));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, SORT_INDEXING_RETRY_MS);
        signal.addEventListener("abort", onAbort, { once: true });
      });
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
    const promise = this.loadSorted(params, controller.signal).then((data) => {
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
