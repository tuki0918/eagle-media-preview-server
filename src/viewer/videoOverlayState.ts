const listeners = new Set<() => void>();
let controlsVisible = true;

export function getVideoOverlayControlsVisible() {
  return controlsVisible;
}

export function setVideoOverlayControlsVisible(visible: boolean) {
  if (controlsVisible === visible) return;
  controlsVisible = visible;
  for (const listener of listeners) {
    listener();
  }
}

export function toggleVideoOverlayControls() {
  setVideoOverlayControlsVisible(!controlsVisible);
}

export function subscribeVideoOverlayControls(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
