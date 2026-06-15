const DEFAULT_LIBRARY_FOOTER_NAME = "Connecting to Eagle";

const listeners = new Set<() => void>();
let currentLibraryFooterName = DEFAULT_LIBRARY_FOOTER_NAME;

export function getLibraryFooterName() {
  return currentLibraryFooterName;
}

export function setLibraryFooterName(name: string) {
  const nextName = name || DEFAULT_LIBRARY_FOOTER_NAME;
  if (currentLibraryFooterName === nextName) return;
  currentLibraryFooterName = nextName;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLibraryFooterName(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
