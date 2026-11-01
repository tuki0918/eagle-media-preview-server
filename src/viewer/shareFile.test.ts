import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchShareFile, shareFileName, shareOrDownloadFile } from "./shareFile";

describe("shareFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("builds a file name from the item name and extension", () => {
    expect(shareFileName({ id: "a", name: "photo", ext: "png" })).toBe("photo.png");
    expect(shareFileName({ id: "a", name: "photo.PNG", ext: "png" })).toBe("photo.PNG");
    expect(shareFileName({ id: "a", name: "a/b:c", ext: "jpg" })).toBe("a_b_c.jpg");
    expect(shareFileName({ id: "abc" })).toBe("abc");
  });

  test("uses the Web Share API when files can be shared", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const file = new File(["x"], "x.png", { type: "image/png" });
    await expect(shareOrDownloadFile(file)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file] });
  });

  test("reports an expired user activation as blocked only when retryable", async () => {
    const notAllowed = new DOMException("activation expired", "NotAllowedError");
    vi.stubGlobal("navigator", { share: vi.fn(async () => { throw notAllowed; }), canShare: () => true });
    await expect(shareOrDownloadFile(new File(["x"], "x.png"), { retryable: true })).resolves.toBe("blocked");
  });

  test("passes the abort signal to the file fetch", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("aborted", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchShareFile({ id: "a" }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("treats a dismissed share sheet as cancelled", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("navigator", { share: vi.fn(async () => { throw abort; }), canShare: () => true });
    await expect(shareOrDownloadFile(new File(["x"], "x.png"))).resolves.toBe("cancelled");
  });
});
