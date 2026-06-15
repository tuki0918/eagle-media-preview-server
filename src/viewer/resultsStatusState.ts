import type { ViewerMode } from "./types";

interface ResultsStatusState {
  total: number;
  viewMode: ViewerMode;
}

const listeners = new Set<() => void>();
let currentResultsStatus: ResultsStatusState = {
  total: 0,
  viewMode: "tiles",
};

export function getResultsStatusState() {
  return currentResultsStatus;
}

export function setResultsStatusState(nextState: ResultsStatusState) {
  if (currentResultsStatus.total === nextState.total && currentResultsStatus.viewMode === nextState.viewMode) return;
  currentResultsStatus = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeResultsStatusState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
