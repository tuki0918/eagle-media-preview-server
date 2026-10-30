import { afterEach, expect, test, vi } from "vitest";
import { clearFolderCovers, loadFolderCover, setFolderCoverFetcher } from "./folderCovers";
import { clearTagCovers, loadTagCover, setTagCoverFetcher } from "./tagCovers";

afterEach(() => {
  setFolderCoverFetcher(null);
  setTagCoverFetcher(null);
});

test.each([
  { name: "folder", load: loadFolderCover, clear: clearFolderCovers, setFetcher: setFolderCoverFetcher },
  { name: "tag", load: loadTagCover, clear: clearTagCovers, setFetcher: setTagCoverFetcher },
])("stops queued $name requests when the library's covers are cleared", async ({ load, clear, setFetcher }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const fetcher = vi.fn(async () => {
    await pending;
    return { id: "old-library-item" };
  });
  setFetcher(fetcher);
  const covers = Array.from({ length: 20 }, (_, index) => load(`cover-${index}`));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  clear();
  finish();
  const results = await Promise.all(covers);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(results.slice(4)).toEqual(Array(16).fill(null));
  expect(await load("new-library-cover")).toEqual({ id: "old-library-item" });
  expect(fetcher).toHaveBeenCalledTimes(5);
});
