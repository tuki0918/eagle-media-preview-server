import { getJson } from "./api";
import type { EagleItem } from "./types";

const MAX_CONCURRENT_COVER_REQUESTS = 4;
type CoverFetcher = (folderId: string, smart: boolean) => Promise<EagleItem | null>;

let covers = new Map<string, Promise<EagleItem | null>>();
const queue: Array<() => void> = [];
let active = 0;
let fetchCover: CoverFetcher = defaultFetchCover;

/** Shares a folder's first item until the library's cover cache is cleared. */
export function loadFolderCover(folderId: string, smart = false) {
  if (!folderId.trim()) return Promise.resolve(null);
  const key = `${smart ? "smart" : "folder"}:${folderId}`;
  const cached = covers.get(key);
  if (cached) return cached;
  const cache = covers;
  const fetcher = fetchCover;
  const cover = schedule(() => fetcher(folderId, smart)).catch(() => {
    // A transient failure can retry when the folder is shown again.
    if (cache.get(key) === cover) cache.delete(key);
    return null;
  });
  covers.set(key, cover);
  return cover;
}

export function clearFolderCovers() {
  covers = new Map();
}

export function setFolderCoverFetcher(fetcher: CoverFetcher | null) {
  fetchCover = fetcher || defaultFetchCover;
  clearFolderCovers();
}

async function defaultFetchCover(folderId: string, smart: boolean) {
  const params = new URLSearchParams({ offset: "0", limit: "1", [smart ? "smartFolderId" : "folderId"]: folderId });
  const data = await getJson<{ items?: EagleItem[] }>(`/api/items?${params.toString()}`);
  const item = data.items?.[0];
  return item?.id ? item : null;
}

function schedule<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      void Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active -= 1;
        queue.shift()?.();
      });
    };
    if (active < MAX_CONCURRENT_COVER_REQUESTS) run();
    else queue.push(run);
  });
}
