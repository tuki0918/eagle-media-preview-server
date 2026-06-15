interface TagChipsState {
  tags: readonly string[];
  onRemove: (tag: string) => void;
}

const noopRemove = () => {};
const listeners = new Set<() => void>();
let currentTagChips: TagChipsState = {
  tags: [],
  onRemove: noopRemove,
};

export function getTagChipsState() {
  return currentTagChips;
}

export function setTagChipsState(nextState: TagChipsState) {
  currentTagChips = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeTagChipsState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
