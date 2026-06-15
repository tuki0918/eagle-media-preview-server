interface TilesSentinelState {
  hidden: boolean;
  text: string;
}

const listeners = new Set<() => void>();
let currentTilesSentinel: TilesSentinelState = {
  hidden: true,
  text: "Loading more",
};
let tilesSentinelElement: HTMLElement | null = null;

export function getTilesSentinelState() {
  return currentTilesSentinel;
}

export function setTilesSentinelState(nextState: TilesSentinelState) {
  if (currentTilesSentinel.hidden === nextState.hidden && currentTilesSentinel.text === nextState.text) return;
  currentTilesSentinel = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeTilesSentinelState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTilesSentinelElement() {
  return tilesSentinelElement;
}

export function setTilesSentinelElement(element: HTMLElement | null) {
  tilesSentinelElement = element;
}
