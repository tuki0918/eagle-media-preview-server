import { createRoot, type Root } from "react-dom/client";
import type { TagSuggestionApiItem } from "../types";

interface TagSuggestionsProps {
  hidden?: boolean;
  items: readonly TagSuggestionApiItem[];
  onSelect: (value: unknown) => void;
}

const roots = new WeakMap<HTMLElement, Root>();

export function TagSuggestions({ hidden = false, items, onSelect }: TagSuggestionsProps) {
  return (
    <div
      id="tagSuggestions"
      className="tag-suggestions absolute left-[42px] right-3 top-[calc(100%+6px)] z-20 grid max-h-[280px] overflow-auto rounded-app border border-app-border bg-app-surface p-1.5 shadow-app-soft"
      role="listbox"
      aria-label="Tag suggestions"
      hidden={hidden}
    >
      {items.map((item) => (
        <button
          key={item.name}
          type="button"
          className="tag-suggestion"
          role="option"
          onPointerDown={(event) => {
            event.preventDefault();
            onSelect(item.name);
          }}
        >
          <span>{item.name || ""}</span>
          {Number.isFinite(item.count) ? <span className="tag-suggestion-count">{Number(item.count).toLocaleString()}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function renderTagSuggestionsView(container: HTMLElement, props: Required<TagSuggestionsProps>) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<TagSuggestions {...props} />);
}

export function clearTagSuggestionsView(container: HTMLElement) {
  renderTagSuggestionsView(container, {
    hidden: true,
    items: [],
    onSelect: () => {},
  });
}
