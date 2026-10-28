import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { exitPictureInPicture, isPictureInPictureActive, requestPictureInPicture, supportsPictureInPicture, togglePictureInPicture } from "./pictureInPicture";

let dom: JSDOM;
let video: HTMLVideoElement;
let nativeRequest: ReturnType<typeof vi.fn<() => Promise<PictureInPictureWindow>>>;
let nativeExit: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><video></video>");
  video = dom.window.document.querySelector("video")!;
  Object.defineProperty(video.ownerDocument, "pictureInPictureEnabled", { configurable: true, value: true });
  Object.defineProperty(video.ownerDocument, "pictureInPictureElement", { configurable: true, writable: true, value: null });
  nativeRequest = vi.fn(async () => {
    Object.assign(video.ownerDocument, { pictureInPictureElement: video });
    return {} as PictureInPictureWindow;
  });
  nativeExit = vi.fn(async () => {
    Object.assign(video.ownerDocument, { pictureInPictureElement: null });
  });
  video.requestPictureInPicture = nativeRequest;
  video.ownerDocument.exitPictureInPicture = nativeExit;
});

afterEach(() => { vi.useRealTimers(); dom.window.close(); });

describe("video Picture-in-Picture", () => {
  test("uses the standard API to toggle this video into and out of PiP", async () => {
    expect(supportsPictureInPicture(video)).toBe(true);
    expect(isPictureInPictureActive(video)).toBe(false);
    await togglePictureInPicture(video);
    expect(nativeRequest).toHaveBeenCalledOnce();
    expect(isPictureInPictureActive(video)).toBe(true);
    await requestPictureInPicture(video);
    expect(nativeRequest).toHaveBeenCalledOnce();
    await togglePictureInPicture(video);
    expect(nativeExit).toHaveBeenCalledOnce();
    expect(isPictureInPictureActive(video)).toBe(false);
  });

  test("does not close another video's PiP window", async () => {
    const other = video.ownerDocument.createElement("video");
    Object.assign(video.ownerDocument, { pictureInPictureElement: other });
    await exitPictureInPicture(video);
    expect(nativeExit).not.toHaveBeenCalled();
    expect(video.ownerDocument.pictureInPictureElement).toBe(other);
  });

  test("hides unsupported or explicitly disabled PiP without invoking the browser", async () => {
    Object.defineProperty(video.ownerDocument, "pictureInPictureEnabled", { value: false });
    expect(supportsPictureInPicture(video)).toBe(false);
    await expect(requestPictureInPicture(video)).rejects.toThrow("not available");
    Object.defineProperty(video.ownerDocument, "pictureInPictureEnabled", { value: true });
    video.disablePictureInPicture = true;
    expect(supportsPictureInPicture(video)).toBe(false);
    expect(nativeRequest).not.toHaveBeenCalled();
  });

  test("prefers Safari's supported presentation API and recognizes native PiP changes", async () => {
    const safari = Object.assign(video, {
      webkitPresentationMode: "inline",
      webkitSupportsPresentationMode: vi.fn(() => true),
      webkitSetPresentationMode: vi.fn((mode: string) => {
        safari.webkitPresentationMode = mode;
        safari.dispatchEvent(new dom.window.Event("webkitpresentationmodechanged"));
      }),
    });
    expect(supportsPictureInPicture(video)).toBe(true);
    await togglePictureInPicture(video);
    expect(safari.webkitSetPresentationMode).toHaveBeenCalledWith("picture-in-picture");
    expect(nativeRequest).not.toHaveBeenCalled();
    expect(isPictureInPictureActive(video)).toBe(true);
    await togglePictureInPicture(video);
    expect(safari.webkitPresentationMode).toBe("inline");
    safari.webkitPresentationMode = "picture-in-picture";
    expect(isPictureInPictureActive(video)).toBe(true);
  });

  test("trusts Safari's per-video support result over its advertised standard API", () => {
    Object.assign(video, {
      webkitSupportsPresentationMode: () => false,
      webkitSetPresentationMode: vi.fn(),
    });
    expect(supportsPictureInPicture(video)).toBe(false);
  });

  test("waits for Safari's native transition and closes a late PiP after cancellation", async () => {
    const safari = Object.assign(video, {
      webkitPresentationMode: "inline",
      webkitSupportsPresentationMode: () => true,
      webkitSetPresentationMode: vi.fn((mode: string) => {
        if (mode === "inline") safari.webkitPresentationMode = mode;
      }),
    });
    const opening = requestPictureInPicture(video);
    await exitPictureInPicture(video);
    safari.webkitPresentationMode = "picture-in-picture";
    safari.dispatchEvent(new dom.window.Event("webkitpresentationmodechanged"));
    await opening;
    expect(safari.webkitSetPresentationMode).toHaveBeenCalledWith("inline");
    expect(isPictureInPictureActive(video)).toBe(false);
  });

  test("reports a Safari request that silently fails and releases its listeners", async () => {
    vi.useFakeTimers();
    const safari = Object.assign(video, {
      webkitPresentationMode: "inline",
      webkitSupportsPresentationMode: () => true,
      webkitSetPresentationMode: vi.fn(),
    });
    const remove = vi.spyOn(video, "removeEventListener");
    const opening = expect(requestPictureInPicture(video)).rejects.toThrow("did not open");
    await vi.advanceTimersByTimeAsync(5000);
    await opening;
    expect(remove).toHaveBeenCalledWith("webkitpresentationmodechanged", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("enterpictureinpicture", expect.any(Function));
    safari.webkitPresentationMode = "picture-in-picture";
    safari.dispatchEvent(new dom.window.Event("webkitpresentationmodechanged"));
    expect(safari.webkitSetPresentationMode).toHaveBeenCalledOnce();
  });

  test("coalesces pending requests and closes a late PiP after the preview was closed", async () => {
    let resolve!: (value: PictureInPictureWindow) => void;
    nativeRequest.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const opening = requestPictureInPicture(video);
    const duplicate = requestPictureInPicture(video);
    expect(nativeRequest).toHaveBeenCalledOnce();
    await exitPictureInPicture(video);
    Object.assign(video.ownerDocument, { pictureInPictureElement: video });
    resolve({} as PictureInPictureWindow);
    await Promise.all([opening, duplicate]);
    expect(nativeExit).toHaveBeenCalledOnce();
    expect(isPictureInPictureActive(video)).toBe(false);
  });

  test("allows retry after the browser rejects a request", async () => {
    nativeRequest.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(requestPictureInPicture(video)).rejects.toThrow("Permission denied");
    await requestPictureInPicture(video);
    expect(nativeRequest).toHaveBeenCalledTimes(2);
  });
});
