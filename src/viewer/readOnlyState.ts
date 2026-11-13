// Whether the server can change the library at all (the standalone server can't). Every role is
// then limited to browsing, so the viewer says so instead of leaving an admin to wonder why
// editing is gone.

const listeners = new Set<() => void>();
let readOnly = false;

export function getServerReadOnly() {
  return readOnly;
}

export function setServerReadOnly(next: boolean) {
  if (readOnly === next) return;
  readOnly = next;
  for (const listener of listeners) listener();
}

export function subscribeServerReadOnly(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
