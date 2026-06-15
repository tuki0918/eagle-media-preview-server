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
          className="tag-suggestion grid min-h-[34px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border-0 bg-transparent px-2.5 text-left text-[13px] text-app-text hover:bg-app-accent-soft hover:text-app-accent-strong"
          role="option"
          onPointerDown={(event) => {
            event.preventDefault();
            handleSelect(item.name);
          }}
        >
          <span>{item.name || ""}</span>
          {Number.isFinite(item.count) ? <span className="tag-suggestion-count text-app-muted [font-variant-numeric:tabular-nums]">{Number(item.count).toLocaleString()}</span> : null}
        </button>
      ))}
    </div>
  );
}
