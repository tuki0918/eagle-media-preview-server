interface PreviewTextState {
  displayName: string;
  originalName: string;
}

const listeners = new Set<() => void>();
let currentPreviewText: PreviewTextState = {
  displayName: "",
  originalName: "",
};

export function getPreviewTextState() {
  return currentPreviewText;
}

export function setPreviewTextState(nextState: PreviewTextState) {
  if (
    currentPreviewText.displayName === nextState.displayName
    && currentPreviewText.originalName === nextState.originalName
  ) return;
  currentPreviewText = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribePreviewTextState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
