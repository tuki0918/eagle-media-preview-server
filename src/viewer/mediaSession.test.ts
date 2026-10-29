import { afterEach, describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { bindMediaSession, mediaSessionMetadataInit } from "./mediaSession";

const BASE_URL = "https://nas.local:8443/";

describe("media session metadata", () => {
  test("uses the file name, library name with server host, and item thumbnail", () => {
    expect(mediaSessionMetadataInit({ id: "A1", name: "clip", ext: "mp4" }, "My Library", BASE_URL)).toEqual({
      title: "clip",
      artist: "My Library - nas.local",
      album: "Media Library",
      artwork: [{ src: "https://nas.local:8443/api/items/A1/thumb" }],
    });
    expect(mediaSessionMetadataInit({ id: "A1" }, "My Library", "http://192.168.1.20:8080/").artist).toBe("My Library - 192.168.1.20");
  });

  test("falls back to the host and app icon without a library name or thumbnail", () => {
    const init = mediaSessionMetadataInit({ id: "A2", name: "song", ext: "mp3", noThumbnail: true }, "", BASE_URL);
    expect(init.artist).toBe("nas.local");
    expect(init.artwork).toEqual([{ src: "https://nas.local:8443/assets/pwa-icon-512.png", sizes: "512x512", type: "image/png" }]);
  });
});

describe("bindMediaSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("does nothing without Media Session support", () => {
    vi.stubGlobal("navigator", {});
    const cleanup = bindMediaSession({} as HTMLMediaElement, { id: "A1" });
    expect(() => cleanup()).not.toThrow();
  });

  test("publishes metadata and routes OS controls to the media element", () => {
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const session = {
      metadata: null as unknown,
      setActionHandler: (action: string, handler: MediaSessionActionHandler | null) => {
        if (action === "seekto") throw new Error("unsupported");
        handlers.set(action, handler);
      },
    };
    vi.stubGlobal("navigator", { mediaSession: session });
    vi.stubGlobal("MediaMetadata", class {
      constructor(public init: MediaMetadataInit) {}
    });
    vi.stubGlobal("window", { location: { href: BASE_URL } });
    const listeners = new Map<string, () => void>();
    const media = {
      currentTime: 30,
      duration: 35,
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    };

    const cleanup = bindMediaSession(media as unknown as HTMLMediaElement, { id: "A1", name: "clip", ext: "mp4" });

    expect((session.metadata as { init: MediaMetadataInit }).init.title).toBe("clip");
    session.metadata = null;
    listeners.get("playing")?.();
    expect((session.metadata as { init: MediaMetadataInit } | null)?.init.title).toBe("clip");
    handlers.get("pause")?.({ action: "pause" });
    expect(media.pause).toHaveBeenCalled();
    handlers.get("seekforward")?.({ action: "seekforward" });
    expect(media.currentTime).toBe(35);
    handlers.get("seekbackward")?.({ action: "seekbackward", seekOffset: 5 });
    expect(media.currentTime).toBe(30);

    cleanup();
    expect(session.metadata).toBeNull();
    expect(handlers.get("play")).toBeNull();
    expect(listeners.has("playing")).toBe(false);
  });
});

describe("Media Session automatic Picture-in-Picture", () => {
  let dom: JSDOM | undefined;
  afterEach(() => {
    vi.unstubAllGlobals();
    dom?.window.close();
  });

  function setup(kind = "video", rejectAction = false) {
    dom = new JSDOM(`<!doctype html><${kind}></${kind}>`, { url: BASE_URL });
    const media = dom.window.document.querySelector(kind)! as HTMLVideoElement;
    const doc = media.ownerDocument;
    const handlers = new Map<string, MediaSessionActionHandler | null>();
    const session = {
      metadata: null,
      setActionHandler: vi.fn((action: string, handler: MediaSessionActionHandler | null) => {
        if (rejectAction && action === "enterpictureinpicture") throw new Error("Unsupported action");
        handlers.set(action, handler);
      }),
    };
    vi.stubGlobal("navigator", { mediaSession: session });
    // Automatic PiP should still register without the metadata API.
    vi.stubGlobal("MediaMetadata", undefined);
    Object.defineProperty(doc, "pictureInPictureEnabled", { value: true });
    Object.defineProperty(doc, "pictureInPictureElement", { writable: true, value: null });
    Object.defineProperty(media, "paused", { configurable: true, value: false });
    Object.defineProperty(media, "readyState", { configurable: true, value: 1 });
    const request = vi.fn(async () => {
      Object.assign(doc, { pictureInPictureElement: media });
      return {} as PictureInPictureWindow;
    });
    media.requestPictureInPicture = request;
    doc.exitPictureInPicture = vi.fn(async () => { Object.assign(doc, { pictureInPictureElement: null }); });
    const invoke = () => handlers.get("enterpictureinpicture")?.({ action: "enterpictureinpicture" as MediaSessionAction });
    return { media, doc, handlers, request, session, invoke };
  }

  test("registers browser-triggered PiP for supported video and unregisters on cleanup", async () => {
    const { media, handlers, request, invoke } = setup();
    const cleanup = bindMediaSession(media, { id: "video" });
    expect(handlers.get("enterpictureinpicture")).toBeTypeOf("function");
    invoke();
    expect(request).toHaveBeenCalledOnce();
    cleanup();
    expect(handlers.get("enterpictureinpicture")).toBeNull();
    invoke();
    expect(request).toHaveBeenCalledOnce();
  });

  test("ignores paused, ended, unready videos and preserves another PiP video", () => {
    const { media, doc, request, invoke } = setup();
    const cleanup = bindMediaSession(media, { id: "video" });
    Object.defineProperty(media, "paused", { value: true });
    invoke();
    Object.defineProperty(media, "paused", { value: false });
    Object.defineProperty(media, "ended", { configurable: true, value: true });
    invoke();
    Object.defineProperty(media, "ended", { value: false });
    Object.defineProperty(media, "readyState", { value: 0 });
    invoke();
    Object.defineProperty(media, "readyState", { value: 1 });
    Object.assign(doc, { pictureInPictureElement: doc.createElement("video") });
    invoke();
    expect(request).not.toHaveBeenCalled();
    cleanup();
  });

  test("does not register the action for audio and tolerates unsupported actions", () => {
    const audio = setup("audio");
    const cleanupAudio = bindMediaSession(audio.media, { id: "audio" });
    expect(audio.handlers.has("enterpictureinpicture")).toBe(false);
    cleanupAudio();
    dom?.window.close();
    const video = setup("video", true);
    const cleanupVideo = bindMediaSession(video.media, { id: "video" });
    expect(video.session.setActionHandler).toHaveBeenCalledWith("enterpictureinpicture", expect.any(Function));
    expect(() => cleanupVideo()).not.toThrow();
  });

  test("registers Safari PiP after metadata reveals support", () => {
    const { media, handlers } = setup();
    let supported = false;
    Object.assign(media, {
      webkitSupportsPresentationMode: () => supported,
      webkitSetPresentationMode: vi.fn(),
    });
    const cleanup = bindMediaSession(media, { id: "video" });
    expect(handlers.has("enterpictureinpicture")).toBe(false);
    supported = true;
    media.dispatchEvent(new dom!.window.Event("loadedmetadata"));
    expect(handlers.get("enterpictureinpicture")).toBeTypeOf("function");
    supported = false;
    media.dispatchEvent(new dom!.window.Event("emptied"));
    expect(handlers.get("enterpictureinpicture")).toBeNull();
    cleanup();
    supported = true;
    media.dispatchEvent(new dom!.window.Event("loadedmetadata"));
    expect(handlers.get("enterpictureinpicture")).toBeNull();
  });

  test.each(["loadeddata", "canplay", "playing", "resize"])("registers browser PiP if support becomes available after metadata on %s", (event) => {
    const { media, handlers } = setup();
    let supported = false;
    Object.assign(media, {
      webkitSupportsPresentationMode: () => supported,
      webkitSetPresentationMode: vi.fn(),
    });
    const cleanup = bindMediaSession(media, { id: "video" });
    media.dispatchEvent(new dom!.window.Event("loadedmetadata"));
    expect(handlers.has("enterpictureinpicture")).toBe(false);
    supported = true;
    media.dispatchEvent(new dom!.window.Event(event));
    expect(handlers.get("enterpictureinpicture")).toBeTypeOf("function");
    cleanup();
    media.dispatchEvent(new dom!.window.Event(event));
    expect(handlers.get("enterpictureinpicture")).toBeNull();
  });

  test("closes a pending automatic PiP that completes after the binding is disposed", async () => {
    const { media, doc, request, invoke } = setup();
    let resolve!: (value: PictureInPictureWindow) => void;
    request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const cleanup = bindMediaSession(media, { id: "video" });
    invoke();
    cleanup();
    Object.assign(doc, { pictureInPictureElement: media });
    resolve({} as PictureInPictureWindow);
    await vi.waitFor(() => expect(doc.exitPictureInPicture).toHaveBeenCalledOnce());
    expect(doc.pictureInPictureElement).toBeNull();
  });

  test("keeps a pending automatic PiP when metadata is rebound for the same video", async () => {
    const { media, doc, request, invoke } = setup();
    let resolve!: (value: PictureInPictureWindow) => void;
    request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const cleanup = bindMediaSession(media, { id: "video", name: "Old name" });
    const opening = invoke();
    cleanup();
    const cleanupUpdated = bindMediaSession(media, { id: "video", name: "New name" });
    Object.assign(doc, { pictureInPictureElement: media });
    resolve({} as PictureInPictureWindow);
    await opening;
    expect(doc.exitPictureInPicture).not.toHaveBeenCalled();
    expect(doc.pictureInPictureElement).toBe(media);
    cleanupUpdated();
  });

  test("ignores a rejected automatic PiP request and permits a later attempt", async () => {
    const { media, request, invoke } = setup();
    request.mockRejectedValueOnce(new Error("Permission denied"));
    const cleanup = bindMediaSession(media, { id: "video" });
    await invoke();
    expect(request).toHaveBeenCalledOnce();
    await invoke();
    expect(request).toHaveBeenCalledTimes(2);
    cleanup();
  });

});
