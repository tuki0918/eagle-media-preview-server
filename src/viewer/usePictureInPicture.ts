import { useEffect, useRef, useState } from "react";
import {
  exitPictureInPicture,
  isPictureInPictureActive,
  supportsPictureInPicture,
  togglePictureInPicture,
} from "./pictureInPicture";

const INITIAL_STATE = { supported: false, active: false, ready: false, pending: false, error: "" };

export function usePictureInPicture(
  mediaRef: { current: HTMLMediaElement | null },
  enabled: boolean,
  itemId: string | undefined,
  onPictureInPictureRequest?: () => void | (() => void),
) {
  const [state, setState] = useState(INITIAL_STATE);
  const bindingRef = useRef<{ video: HTMLVideoElement; disposed: boolean; pending: boolean } | null>(null);

  useEffect(() => {
    const media = mediaRef.current;
    if (!enabled || media?.tagName !== "VIDEO") {
      setState(INITIAL_STATE);
      return;
    }
    const video = media as HTMLVideoElement;
    const binding = { video, disposed: false, pending: false };
    bindingRef.current = binding;
    const sync = () => setState((current) => ({
      ...current,
      supported: supportsPictureInPicture(video),
      active: isPictureInPictureActive(video),
      ready: video.readyState >= 1,
    }));
    const events = ["loadedmetadata", "emptied", "enterpictureinpicture", "leavepictureinpicture", "webkitpresentationmodechanged"];
    setState(INITIAL_STATE);
    sync();
    for (const event of events) video.addEventListener(event, sync);
    return () => {
      binding.disposed = true;
      bindingRef.current = null;
      for (const event of events) video.removeEventListener(event, sync);
      void exitPictureInPicture(video).catch(() => {});
    };
  }, [enabled, itemId, mediaRef]);

  const toggle = async () => {
    const binding = bindingRef.current;
    if (!binding || binding.disposed || binding.pending) return;
    binding.pending = true;
    setState((current) => ({ ...current, pending: true, error: "" }));
    let releaseRequest: void | (() => void) = undefined;
    try {
      if (!isPictureInPictureActive(binding.video)) releaseRequest = onPictureInPictureRequest?.();
      // Call immediately from the button click to retain the browser's user gesture.
      await togglePictureInPicture(binding.video);
    } catch {
      if (!binding.disposed) {
        setState((current) => ({ ...current, error: "Could not change Picture-in-Picture mode. Please try again." }));
      }
    } finally {
      releaseRequest?.();
      binding.pending = false;
      if (!binding.disposed) {
        setState((current) => ({ ...current, pending: false, active: isPictureInPictureActive(binding.video) }));
      }
    }
  };

  return { ...state, toggle };
}
