import { mediaUrl } from "./api";
import { displayFileName } from "./format";
import { DEFAULT_LIBRARY_FOOTER_NAME, getLibraryFooterName } from "./libraryFooterState";
import { hasNoThumbnail } from "./media";
import type { EagleItem } from "./types";

const APP_NAME = "Media Preview Server";
const APP_ARTWORK: MediaImage = { src: "/assets/pwa-icon-512.png", sizes: "512x512", type: "image/png" };
const DEFAULT_SEEK_OFFSET_SECONDS = 10;

// Lock screen / Now Playing details: file name as the title, library name below it.
export function mediaSessionMetadataInit(item: EagleItem, libraryName: string, baseUrl: string): MediaMetadataInit {
  const artwork = hasNoThumbnail(item)
    ? APP_ARTWORK
    : { src: mediaUrl(String(item.id || ""), "thumb") };
  return {
    title: displayFileName(item),
    artist: libraryName || APP_NAME,
    album: APP_NAME,
    artwork: [{ ...artwork, src: new URL(artwork.src, baseUrl).href }],
  };
}

const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = ["play", "pause", "seekbackward", "seekforward", "seekto"];

// Publishes the playing item to the OS media controls; returns a cleanup that clears them.
export function bindMediaSession(media: HTMLMediaElement, item: EagleItem) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") {
    return () => {};
  }
  const session = navigator.mediaSession;
  const publishMetadata = () => {
    const libraryName = getLibraryFooterName();
    session.metadata = new MediaMetadata(mediaSessionMetadataInit(
      item,
      libraryName === DEFAULT_LIBRARY_FOOTER_NAME ? "" : libraryName,
      window.location.href,
    ));
  };
  publishMetadata();
  // iOS Safari tabs ignore metadata set before playback actually starts (e.g. after blocked autoplay).
  media.addEventListener("playing", publishMetadata);

  const seekTo = (time: number) => {
    if (!Number.isFinite(media.duration)) return;
    media.currentTime = Math.min(media.duration, Math.max(0, time));
  };
  const handlers: Record<string, MediaSessionActionHandler> = {
    play: () => {
      media.play().catch(() => {});
    },
    pause: () => media.pause(),
    seekbackward: (details) => seekTo(media.currentTime - (details.seekOffset || DEFAULT_SEEK_OFFSET_SECONDS)),
    seekforward: (details) => seekTo(media.currentTime + (details.seekOffset || DEFAULT_SEEK_OFFSET_SECONDS)),
    seekto: (details) => {
      if (typeof details.seekTime === "number") seekTo(details.seekTime);
    },
  };
  for (const action of MEDIA_SESSION_ACTIONS) setActionHandler(session, action, handlers[action]);

  return () => {
    media.removeEventListener("playing", publishMetadata);
    session.metadata = null;
    for (const action of MEDIA_SESSION_ACTIONS) setActionHandler(session, action, null);
  };
}

function setActionHandler(session: MediaSession, action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // Browsers throw for actions they do not support.
  }
}
