import type { EagleItem } from "./types";

interface PreviewRatingState {
  item: EagleItem | null;
  onSelect: (value: number) => void;
}

const noopSelect = () => {};
const listeners = new Set<() => void>();
let currentPreviewRating: PreviewRatingState = {
  item: null,
  onSelect: noopSelect,
};

export function getPreviewRatingState() {
  return currentPreviewRating;
}

export function setPreviewRatingState(nextState: PreviewRatingState) {
  currentPreviewRating = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function clearPreviewRatingState() {
  setPreviewRatingState({
    item: null,
    onSelect: noopSelect,
  });
}

export function subscribePreviewRatingState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
