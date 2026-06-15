import { useSyncExternalStore } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTagChipsState, subscribeTagChipsState } from "../tagChipsState";

interface TagChipsProps {
  tags: readonly string[];
  onRemove: (tag: string) => void;
}

export function TagChips({ tags, onRemove }: Partial<TagChipsProps>) {
  const state = useSyncExternalStore(subscribeTagChipsState, getTagChipsState, getTagChipsState);
  const displayTags = tags ?? state.tags;
  const handleRemove = onRemove ?? state.onRemove;

  return (
    <div id="tagChips" className="tag-chips flex min-h-6 flex-wrap gap-1.5 max-[540px]:max-w-[58%] max-[540px]:flex-[0_1_auto] max-[540px]:flex-nowrap max-[540px]:overflow-x-auto max-[540px]:[scrollbar-width:none] max-[540px]:[&::-webkit-scrollbar]:hidden" aria-label="Selected tag filters">
      {displayTags.map((tag) => (
        <span key={tag} className="tag-chip inline-flex h-auto min-h-7 max-w-full items-center gap-1.5 rounded-lg border border-[rgba(37,99,235,0.18)] bg-app-accent-soft py-[3px] pl-[9px] pr-1 text-xs font-[720] text-app-accent-strong max-[540px]:max-w-[132px] max-[540px]:flex-none">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tag}</span>
          <Button className="size-[22px] rounded-md text-current hover:bg-[rgba(37,99,235,0.12)]" variant="ghost" size="icon-xs" type="button" aria-label={`Remove tag ${tag}`} title={`Remove tag ${tag}`} onClick={() => handleRemove(tag)}>
            <XIcon data-icon="inline-start" />
          </Button>
        </span>
      ))}
    </div>
  );
}
