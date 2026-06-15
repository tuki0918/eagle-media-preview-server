import { useSyncExternalStore } from "react";
import { getTagSuggestionsState, subscribeTagSuggestionsState } from "../tagSuggestionsState";
import type { TagSuggestionApiItem } from "../types";

interface TagSuggestionsProps {
  hidden?: boolean;
  items: readonly TagSuggestionApiItem[];
  onSelect: (value: unknown) => void;
}

export function TagSuggestions({ hidden, items, onSelect }: Partial<TagSuggestionsProps>) {
  const state = useSyncExternalStore(subscribeTagSuggestionsState, getTagSuggestionsState, getTagSuggestionsState);
  const displayHidden = hidden ?? state.hidden;
  const displayItems = items ?? state.items;
  const handleSelect = onSelect ?? state.onSelect;

  return (
    <div
      id="tagSuggestions"
      className="tag-suggestions absolute left-[42px] right-3 top-[calc(100%+6px)] z-20 grid max-h-[280px] overflow-auto rounded-app border border-app-border bg-app-surface p-1.5 shadow-app-soft"
      role="listbox"
      aria-label="Tag suggestions"
      hidden={displayHidden}
    >
      {displayItems.map((item) => (
        <button
          key={item.name}
          type="button"
          className="tag-suggestion"
          role="option"
          onPointerDown={(event) => {
            event.preventDefault();
            handleSelect(item.name);
          }}
        >
          <span>{item.name || ""}</span>
          {Number.isFinite(item.count) ? <span className="tag-suggestion-count">{Number(item.count).toLocaleString()}</span> : null}
        </button>
      ))}
    </div>
  );
}
