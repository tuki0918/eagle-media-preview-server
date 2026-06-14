import { createRoot, type Root } from "react-dom/client";
import type { TagSuggestionApiItem } from "../types";

interface TagSuggestionsProps {
  items: readonly TagSuggestionApiItem[];
  onSelect: (value: unknown) => void;
}

const roots = new WeakMap<HTMLElement, Root>();

export function TagSuggestions({ items, onSelect }: TagSuggestionsProps) {
  return (
    <>
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
    </>
  );
}

export function renderTagSuggestionsView(container: HTMLElement, props: TagSuggestionsProps) {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<TagSuggestions {...props} />);
}

export function clearTagSuggestionsView(container: HTMLElement) {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
}
