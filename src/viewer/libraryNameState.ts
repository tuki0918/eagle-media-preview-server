const listeners = new Set<() => void>();
let currentLibraryName = "";

export function getLibraryName() {
  return currentLibraryName;
}

export function setLibraryName(name: string) {
  if (currentLibraryName === name) return;
  currentLibraryName = name;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLibraryName(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
