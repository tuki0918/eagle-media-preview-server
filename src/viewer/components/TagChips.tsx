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
    <div id="tagChips" className="tag-chips flex flex-wrap gap-1.5 empty:hidden" aria-label="Selected tag filters">
      {displayTags.map((tag) => (
        <span key={tag} className="tag-chip inline-flex h-auto min-h-7 max-w-full items-center gap-1.5 rounded-lg border border-border bg-secondary py-[3px] pl-[9px] pr-1 text-xs font-[720] text-secondary-foreground max-[540px]:max-w-full">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tag}</span>
          <Button className="size-[22px] rounded-md text-current hover:bg-muted" variant="ghost" size="icon-xs" type="button" aria-label={`Remove tag ${tag}`} title={`Remove tag ${tag}`} onClick={() => handleRemove(tag)}>
            <XIcon data-icon="inline-start" />
          </Button>
        </span>
      ))}
    </div>
  );
}
