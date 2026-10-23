export type EagleStatus = "checking" | "offline" | "online";

const listeners = new Set<() => void>();
let currentEagleStatus: EagleStatus = "checking";

export function getEagleStatus() {
  return currentEagleStatus;
}

export function setEagleStatus(status: EagleStatus) {
  if (currentEagleStatus === status) return;
  currentEagleStatus = status;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeEagleStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
