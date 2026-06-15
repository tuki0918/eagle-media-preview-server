const listeners = new Set<() => void>();
let controlsVisible = true;

export function getImageOverlayControlsVisible() {
  return controlsVisible;
}

export function setImageOverlayControlsVisible(visible: boolean) {
  if (controlsVisible === visible) return;
  controlsVisible = visible;
  for (const listener of listeners) {
    listener();
  }
}

export function toggleImageOverlayControls() {
  setImageOverlayControlsVisible(!controlsVisible);
}

export function subscribeImageOverlayControls(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
