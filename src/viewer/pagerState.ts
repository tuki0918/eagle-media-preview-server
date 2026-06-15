import type { PageButton } from "./pagination";

interface PagerState {
  current: number;
  hidden: boolean;
  nextDisabled: boolean;
  onSelectPage: (page: number) => void;
  pages: readonly PageButton[];
  previousDisabled: boolean;
}

const noopSelectPage = () => {};
const listeners = new Set<() => void>();
let currentPagerState: PagerState = {
  current: 1,
  hidden: false,
  nextDisabled: false,
  onSelectPage: noopSelectPage,
  pages: [],
  previousDisabled: false,
};

export function getPagerState() {
  return currentPagerState;
}

export function setPagerState(nextState: PagerState) {
  currentPagerState = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribePagerState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
