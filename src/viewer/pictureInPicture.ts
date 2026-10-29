type PresentationMode = "inline" | "fullscreen" | "picture-in-picture";
type SafariVideo = HTMLVideoElement & {
  webkitPresentationMode?: PresentationMode;
  webkitSupportsPresentationMode?: (mode: PresentationMode) => boolean;
  webkitSetPresentationMode?: (mode: PresentationMode) => void;
};

// Safari can report PiP as unavailable until video data or its presentation size is ready.
export const PICTURE_IN_PICTURE_SUPPORT_EVENTS = ["loadedmetadata", "loadeddata", "canplay", "playing", "resize", "emptied"] as const;

const pendingRequests = new WeakMap<HTMLVideoElement, Promise<void>>();
const requestVersions = new WeakMap<HTMLVideoElement, number>();

function hasSafariPresentationAPI(video: SafariVideo) {
  return typeof video.webkitSupportsPresentationMode === "function" && typeof video.webkitSetPresentationMode === "function";
}

export function supportsPictureInPicture(video: HTMLVideoElement): boolean {
  if (video.disablePictureInPicture) return false;
  const safari = video as SafariVideo;
  if (hasSafariPresentationAPI(safari)) {
    // Safari can expose the standard API even where PiP is unavailable, including some Home Screen apps.
    try { return safari.webkitSupportsPresentationMode!("picture-in-picture"); }
    catch { return false; }
  }
  return Boolean(video.ownerDocument.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function");
}

export function isPictureInPictureActive(video: HTMLVideoElement): boolean {
  return video.ownerDocument.pictureInPictureElement === video || (video as SafariVideo).webkitPresentationMode === "picture-in-picture";
}

export async function requestPictureInPicture(video: HTMLVideoElement): Promise<void> {
  const pending = pendingRequests.get(video);
  if (pending) return pending;
  if (isPictureInPictureActive(video)) return;
  if (!supportsPictureInPicture(video)) throw new Error("Picture-in-Picture is not available for this video.");

  const version = requestVersions.get(video) || 0;
  const request = (async () => {
    const safari = video as SafariVideo;
    // Invoke the native method before awaiting anything, preserving the click's user activation.
    if (hasSafariPresentationAPI(safari)) await requestSafariPictureInPicture(safari);
    else await video.requestPictureInPicture();
    // Closing or replacing the preview can happen while the browser opens its PiP window.
    if ((requestVersions.get(video) || 0) !== version) await exitActivePictureInPicture(video);
  })();
  pendingRequests.set(video, request);
  try { await request; }
  finally { if (pendingRequests.get(video) === request) pendingRequests.delete(video); }
}

function requestSafariPictureInPicture(video: SafariVideo): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("webkitpresentationmodechanged", entered);
      video.removeEventListener("enterpictureinpicture", entered);
    };
    const entered = () => {
      if (!isPictureInPictureActive(video)) return;
      cleanup();
      resolve();
    };
    // The prefixed setter returns void and may silently decline the request.
    const timeout = setTimeout(() => {
      cleanup();
      if (isPictureInPictureActive(video)) resolve();
      else reject(new Error("Picture-in-Picture did not open."));
    }, 5000);
    video.addEventListener("webkitpresentationmodechanged", entered);
    video.addEventListener("enterpictureinpicture", entered);
    try {
      video.webkitSetPresentationMode!("picture-in-picture");
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export async function exitPictureInPicture(video: HTMLVideoElement): Promise<void> {
  requestVersions.set(video, (requestVersions.get(video) || 0) + 1);
  await exitActivePictureInPicture(video);
}

async function exitActivePictureInPicture(video: HTMLVideoElement): Promise<void> {
  const doc = video.ownerDocument;
  if (doc.pictureInPictureElement === video && typeof doc.exitPictureInPicture === "function") {
    await doc.exitPictureInPicture();
  } else if ((video as SafariVideo).webkitPresentationMode === "picture-in-picture") {
    (video as SafariVideo).webkitSetPresentationMode?.("inline");
  }
}

export async function togglePictureInPicture(video: HTMLVideoElement): Promise<void> {
  if (isPictureInPictureActive(video)) await exitPictureInPicture(video);
  else await requestPictureInPicture(video);
}
