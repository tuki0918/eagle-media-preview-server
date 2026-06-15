export type ShellView = "login" | "viewer";

const listeners = new Set<() => void>();
let currentShellView: ShellView = "login";

export function getShellView() {
  return currentShellView;
}

export function setShellView(nextView: ShellView) {
  if (currentShellView === nextView) return;
  currentShellView = nextView;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeShellView(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
