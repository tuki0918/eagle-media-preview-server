import { useSyncExternalStore } from "react";
import { getTagChipsState, subscribeTagChipsState } from "../tagChipsState";

interface TagChipsProps {
  tags: readonly string[];
  onRemove: (tag: string) => void;
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function TagChips({ tags, onRemove }: Partial<TagChipsProps>) {
  const state = useSyncExternalStore(subscribeTagChipsState, getTagChipsState, getTagChipsState);
  const displayTags = tags ?? state.tags;
  const handleRemove = onRemove ?? state.onRemove;

  return (
    <div id="tagChips" className="tag-chips flex min-h-6 flex-wrap gap-1.5" aria-label="Selected tag filters">
      {displayTags.map((tag) => (
        <span key={tag} className="tag-chip">
          <span>{tag}</span>
          <button type="button" aria-label={`Remove tag ${tag}`} title={`Remove tag ${tag}`} onClick={() => handleRemove(tag)}>
            <RemoveIcon />
          </button>
        </span>
      ))}
    </div>
  );
}
