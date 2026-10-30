import { getJson } from "./api";
import type { EagleItem } from "./types";

const MAX_CONCURRENT_COVER_REQUESTS = 4;

type CoverFetcher = (tag: string) => Promise<EagleItem | null>;

let covers = new Map<string, Promise<EagleItem | null>>();
const queue: Array<() => void> = [];
let active = 0;
let fetchCover: CoverFetcher = defaultFetchCover;

/** Resolves the first item tagged with `tag`, sharing one request per tag until the cache is cleared. */
export function loadTagCover(tag: string) {
  const cached = covers.get(tag);
  if (cached) return cached;
  const cache = covers;
  const fetcher = fetchCover;
  const cover = schedule(() => cache === covers ? fetcher(tag) : Promise.resolve(null)).catch(() => {
    // Forget failures so the tag retries the next time it scrolls into view.
    if (cache.get(tag) === cover) cache.delete(tag);
    return null;
  });
  covers.set(tag, cover);
  return cover;
}

export function clearTagCovers() {
  covers = new Map();
}

export function setTagCoverFetcher(fetcher: CoverFetcher | null) {
  fetchCover = fetcher || defaultFetchCover;
  clearTagCovers();
}

async function defaultFetchCover(tag: string) {
  const data = await getJson<{ item?: EagleItem | null }>(`/api/tag-cover?${new URLSearchParams({ tag }).toString()}`);
  return data.item?.id ? data.item : null;
}

function schedule<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      task().then(resolve, reject).finally(() => {
        active -= 1;
        queue.shift()?.();
      });
    };
    if (active < MAX_CONCURRENT_COVER_REQUESTS) run();
    else queue.push(run);
  });
}
