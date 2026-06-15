import { useSyncExternalStore } from "react";
import { getTagChipsState, subscribeTagChipsState } from "../tagChipsState";

interface TagChipsProps {
  tags: readonly string[];
  onRemove: (tag: string) => void;
}

function RemoveIcon() {
  return (
    <svg className="h-3.5 w-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" viewBox="0 0 24 24" aria-hidden="true">
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
    <div id="tagChips" className="tag-chips flex min-h-6 flex-wrap gap-1.5 max-[540px]:max-w-[58%] max-[540px]:flex-[0_1_auto] max-[540px]:flex-nowrap max-[540px]:overflow-x-auto max-[540px]:[scrollbar-width:none] max-[540px]:[&::-webkit-scrollbar]:hidden" aria-label="Selected tag filters">
      {displayTags.map((tag) => (
        <span key={tag} className="tag-chip inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-app border border-[rgba(37,99,235,0.18)] bg-app-accent-soft py-[3px] pl-[9px] pr-1 text-xs font-[720] text-app-accent-strong max-[540px]:max-w-[132px] max-[540px]:flex-none">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tag}</span>
          <button className="inline-grid h-[22px] w-[22px] place-items-center rounded-md border-0 bg-transparent text-current hover:bg-[rgba(37,99,235,0.12)]" type="button" aria-label={`Remove tag ${tag}`} title={`Remove tag ${tag}`} onClick={() => handleRemove(tag)}>
            <RemoveIcon />
          </button>
        </span>
      ))}
    </div>
  );
}
