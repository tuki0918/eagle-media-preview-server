import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface ImageFullscreenControls {
  active: boolean;
  toggle: () => void;
}

// Keep ownership on the stable preview surface so stepping between images does not exit fullscreen.
export function useImageFullscreen(surfaceRef: RefObject<HTMLDivElement>, enabled: boolean): ImageFullscreenControls {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const requestedSurface = useRef<HTMLDivElement | null>(null);
  const enteredNative = useRef(false);
  const updateActive = useCallback((value: boolean) => {
    activeRef.current = value;
    setActive(value);
  }, []);
  const exit = useCallback(() => {
    updateActive(false);
    if (requestedSurface.current && document.fullscreenElement === requestedSurface.current) {
      void document.exitFullscreen?.().catch(() => {});
    }
    enteredNative.current = false;
    requestedSurface.current = null;
  }, [updateActive]);

  const toggle = useCallback(() => {
    if (activeRef.current) {
      exit();
      return;
    }
    const surface = surfaceRef.current;
    if (!enabled || !surface) return;
    requestedSurface.current = surface;
    updateActive(true);
    // Unsupported or denied native fullscreen keeps the viewport-filling layout.
    try {
      void surface.requestFullscreen?.().then(() => {
        if (!activeRef.current && document.fullscreenElement === surface) {
          void document.exitFullscreen?.().catch(() => {});
        }
      }).catch(() => {});
    } catch { /* Keep the viewport fallback. */ }
  }, [enabled, exit, surfaceRef, updateActive]);

  useEffect(() => {
    if (!enabled) return;
    const changed = () => {
      if (requestedSurface.current && document.fullscreenElement === requestedSurface.current) {
        enteredNative.current = true;
      } else if (enteredNative.current) {
        enteredNative.current = false;
        updateActive(false);
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !activeRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      exit();
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("keydown", keydown, true);
      exit();
    };
  }, [enabled, exit, surfaceRef, updateActive]);

  return { active, toggle };
}
