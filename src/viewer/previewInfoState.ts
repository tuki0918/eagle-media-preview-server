import type { PreviewInfoProps } from "./components/PreviewInfo";

const listeners = new Set<() => void>();
let currentPreviewInfo: PreviewInfoProps | null = null;

export function getPreviewInfoState() {
  return currentPreviewInfo;
}

export function setPreviewInfoState(nextState: PreviewInfoProps) {
  currentPreviewInfo = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function clearPreviewInfoState() {
  currentPreviewInfo = null;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribePreviewInfoState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
