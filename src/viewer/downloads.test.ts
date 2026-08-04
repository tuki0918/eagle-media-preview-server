import { afterEach, describe, expect, test, vi } from "vitest";
import { downloadFileName, downloadItems, uniqueDownloadFileName } from "./downloads";

describe("batch download helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "window");
  });

  test("sanitizes file names and preserves their extensions", () => {
    expect(downloadFileName({ id: "1", name: "holiday/photo", ext: "jpg" })).toBe("holiday_photo.jpg");
    expect(downloadFileName({ id: "2", name: "report", ext: "pdf" })).toBe("report.pdf");
    expect(downloadFileName({ id: "3", name: "...", ext: "" })).toBe("file-3");
  });

  test("adds a suffix for duplicate names", () => {
    const usedNames = new Set<string>();
    expect(uniqueDownloadFileName({ id: "1", name: "photo", ext: "jpg" }, usedNames)).toBe("photo.jpg");
    expect(uniqueDownloadFileName({ id: "2", name: "photo", ext: "jpg" }, usedNames)).toBe("photo (2).jpg");
  });

  test("downloads unique items sequentially and reports progress", async () => {
    const clickedNames: string[] = [];
    const documentRef = {
      body: {
        appendChild() {},
      },
      createElement() {
        return {
          click() {
            clickedNames.push(this.download);
          },
          download: "",
          hidden: false,
          href: "",
          rel: "",
          remove() {},
        };
      },
    } as unknown as Document;
    const fetchImpl = vi.fn(async () => new Response("demo"));
    const progress: string[] = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { href: "http://localhost/" },
        setTimeout,
      },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const result = await downloadItems([
      { id: "1", name: "photo", ext: "jpg" },
      { id: "1", name: "photo", ext: "jpg" },
      { id: "2", name: "clip", ext: "mp4" },
    ], {
      documentRef,
      fetchImpl,
      onProgress: ({ completed, total }) => progress.push(`${completed}/${total}`),
      spacingMs: 0,
    });

    expect(result).toMatchObject({ cancelled: false, downloaded: 2, failures: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(clickedNames).toEqual(["photo.jpg", "clip.mp4"]);
    expect(progress).toEqual(["1/2", "2/2"]);
  });
});
