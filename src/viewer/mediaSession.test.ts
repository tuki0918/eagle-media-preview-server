import { afterEach, describe, expect, test, vi } from "vitest";
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
