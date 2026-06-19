export type PreviewDialogMode = "" | "audio" | "image" | "pdf" | "text" | "unsupported" | "video";

interface PreviewDialogState {
  infoOpen: boolean;
  mode: PreviewDialogMode;
  open: boolean;
}

const listeners = new Set<() => void>();
let currentPreviewDialogState: PreviewDialogState = {
  infoOpen: false,
  mode: "",
  open: false,
};

export function getPreviewDialogState() {
  return currentPreviewDialogState;
}

export function setPreviewDialogState(nextState: PreviewDialogState) {
  if (
    currentPreviewDialogState.infoOpen === nextState.infoOpen
    && currentPreviewDialogState.mode === nextState.mode
    && currentPreviewDialogState.open === nextState.open
  ) return;
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
    open: false,
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
