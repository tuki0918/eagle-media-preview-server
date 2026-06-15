import type { PreviewBodyProps } from "./components/PreviewBody";

const listeners = new Set<() => void>();
let currentPreviewBody: PreviewBodyProps | null = null;

export function getPreviewBodyState() {
  return currentPreviewBody;
}

export function setPreviewBodyState(nextState: PreviewBodyProps) {
  currentPreviewBody = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function clearPreviewBodyState() {
  currentPreviewBody = null;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribePreviewBodyState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
