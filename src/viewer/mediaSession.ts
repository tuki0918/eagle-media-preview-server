import { mediaUrl } from "./api";
import { displayFileName } from "./format";
import { getLibraryName } from "./libraryNameState";
import { hasNoThumbnail } from "./media";
import { exitPictureInPicture, requestPictureInPicture, supportsPictureInPicture } from "./pictureInPicture";
import type { EagleItem } from "./types";

const APP_NAME = "Media Library";
const APP_ARTWORK: MediaImage = { src: "/assets/pwa-icon-512.png", sizes: "512x512", type: "image/png" };
const DEFAULT_SEEK_OFFSET_SECONDS = 10;

// Lock screen / Now Playing details: file name as the title, library and server host below it.
export function mediaSessionMetadataInit(item: EagleItem, libraryName: string, baseUrl: string): MediaMetadataInit {
  const artwork = hasNoThumbnail(item)
    ? APP_ARTWORK
    : { src: mediaUrl(String(item.id || ""), "thumb") };
  const host = new URL(baseUrl).hostname;
  return {
    title: displayFileName(item),
    artist: [libraryName, host].filter(Boolean).join(" - ") || APP_NAME,
    album: APP_NAME,
    artwork: [{ ...artwork, src: new URL(artwork.src, baseUrl).href }],
  };
}

const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = ["play", "pause", "seekbackward", "seekforward", "seekto"];
// This browser action is newer than the project's TypeScript DOM declarations.
const ENTER_PICTURE_IN_PICTURE = "enterpictureinpicture" as MediaSessionAction;
const mediaSessionBindings = new WeakMap<HTMLMediaElement, symbol>();

// Publishes the playing item to the OS media controls; returns a cleanup that clears them.
export function bindMediaSession(media: HTMLMediaElement, item: EagleItem, onPictureInPictureRequest?: () => void | (() => void)) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return () => {};
  }
  const session = navigator.mediaSession;
  const binding = Symbol();
  mediaSessionBindings.set(media, binding);
  const publishMetadata = () => {
    if (typeof MediaMetadata === "undefined") return;
    session.metadata = new MediaMetadata(mediaSessionMetadataInit(item, getLibraryName(), window.location.href));
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

  let disposed = false;
  let pictureInPictureRegistered = false;
  const video = media.tagName === "VIDEO" ? media as HTMLVideoElement : null;
  const enterPictureInPicture = async () => {
    if (!video || disposed || video.paused || video.ended || video.readyState === 0 || !supportsPictureInPicture(video)) return;
    const existing = video.ownerDocument.pictureInPictureElement;
    if (existing && existing !== video) return;
    let releaseRequest: void | (() => void) = undefined;
    try {
      releaseRequest = onPictureInPictureRequest?.();
      await requestPictureInPicture(video);
      if (disposed && !mediaSessionBindings.has(media)) await exitPictureInPicture(video);
    } catch {
      // Automatic PiP remains subject to browser support, permission, and playback eligibility.
    } finally {
      releaseRequest?.();
    }
  };
  const syncPictureInPictureHandler = () => {
    if (!video) return;
    const supported = supportsPictureInPicture(video);
    if (supported === pictureInPictureRegistered) return;
    pictureInPictureRegistered = setActionHandler(session, ENTER_PICTURE_IN_PICTURE, supported ? enterPictureInPicture : null) && supported;
  };
  syncPictureInPictureHandler();
  video?.addEventListener("loadedmetadata", syncPictureInPictureHandler);
  video?.addEventListener("emptied", syncPictureInPictureHandler);

  return () => {
    disposed = true;
    if (mediaSessionBindings.get(media) === binding) mediaSessionBindings.delete(media);
    media.removeEventListener("playing", publishMetadata);
    video?.removeEventListener("loadedmetadata", syncPictureInPictureHandler);
    video?.removeEventListener("emptied", syncPictureInPictureHandler);
    session.metadata = null;
    for (const action of MEDIA_SESSION_ACTIONS) setActionHandler(session, action, null);
    if (pictureInPictureRegistered) setActionHandler(session, ENTER_PICTURE_IN_PICTURE, null);
  };
}

function setActionHandler(session: MediaSession, action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    session.setActionHandler(action, handler);
    return true;
  } catch {
    // Browsers throw for actions they do not support.
    return false;
  }
}
