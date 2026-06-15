import type { TagSuggestionApiItem } from "./types";

interface TagSuggestionsState {
  hidden: boolean;
  items: readonly TagSuggestionApiItem[];
  onSelect: (value: unknown) => void;
}

const noopSelect = () => {};
const listeners = new Set<() => void>();
let currentTagSuggestions: TagSuggestionsState = {
  hidden: true,
  items: [],
  onSelect: noopSelect,
};

export function getTagSuggestionsState() {
  return currentTagSuggestions;
}

export function setTagSuggestionsState(nextState: TagSuggestionsState) {
  currentTagSuggestions = nextState;
  for (const listener of listeners) {
    listener();
  }
}

export function clearTagSuggestionsState() {
  setTagSuggestionsState({
    hidden: true,
    items: [],
    onSelect: noopSelect,
  });
}

export function subscribeTagSuggestionsState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
