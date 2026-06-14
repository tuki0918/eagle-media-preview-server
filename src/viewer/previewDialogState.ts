export type PreviewDialogMode = "" | "audio" | "image" | "text" | "unsupported" | "video";

interface PreviewDialogState {
  infoOpen: boolean;
  mode: PreviewDialogMode;
}

const listeners = new Set<() => void>();
let currentPreviewDialogState: PreviewDialogState = {
  infoOpen: false,
  mode: "",
};

export function getPreviewDialogState() {
  return currentPreviewDialogState;
}

export function setPreviewDialogState(nextState: PreviewDialogState) {
  if (currentPreviewDialogState.infoOpen === nextState.infoOpen && currentPreviewDialogState.mode === nextState.mode) return;
  currentPreviewDialogState = nextState;
  emitPreviewDialogState();
}

export function setPreviewDialogInfoOpen(infoOpen: boolean) {
  setPreviewDialogState({
    ...currentPreviewDialogState,
    infoOpen,
  });
}

export function resetPreviewDialogState() {
  setPreviewDialogState({
    infoOpen: false,
    mode: "",
  });
}

export function subscribePreviewDialogState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitPreviewDialogState() {
  for (const listener of listeners) {
    listener();
  }
}
