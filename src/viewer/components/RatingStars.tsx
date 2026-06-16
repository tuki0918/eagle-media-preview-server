import { useSyncExternalStore } from "react";
import { normalizeRating } from "../format";
import { getPreviewRatingState, subscribePreviewRatingState } from "../previewRatingState";
import type { EagleItem } from "../types";

export interface RatingStarsProps {
  className: string;
  disabled?: boolean;
  disabledLabel?: string;
  id?: string;
  interactive?: boolean;
  item: EagleItem;
  onSelect?: (value: number) => void;
}

const ratingStarBaseClassName =
  "rating-star inline-grid h-6 w-[22px] place-items-center border-0 bg-transparent p-0 text-[17px] leading-none text-muted-foreground shadow-none data-[active=true]:text-yellow-500 disabled:cursor-not-allowed disabled:opacity-70";
const interactiveRatingStarClassName = `${ratingStarBaseClassName} cursor-pointer`;
const staticRatingStarClassName = `${ratingStarBaseClassName} rating-star-static cursor-default`;

export function RatingStars({ className, disabled = false, disabledLabel, id, interactive = false, item, onSelect }: RatingStarsProps) {
  const current = normalizeRating(item.star);
  const Tag = interactive ? "button" : "span";
  const canSelect = interactive && !disabled;
  const label = interactive && disabled && disabledLabel ? disabledLabel : interactive ? "Rating" : "Rating (read only)";
  return (
    <div id={id} className={className} aria-label={label}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Tag
          key={value}
          className={interactive ? interactiveRatingStarClassName : staticRatingStarClassName}
          title={interactive && disabled && disabledLabel ? disabledLabel : interactive ? `${value}` : undefined}
          data-active={value <= current ? "true" : "false"}
          aria-hidden={interactive ? undefined : "true"}
          aria-label={interactive ? `Rating ${value}` : undefined}
          aria-pressed={interactive ? value <= current : undefined}
          disabled={interactive ? disabled : undefined}
          type={interactive ? "button" : undefined}
          onClick={canSelect ? (event) => {
            event.stopPropagation();
            onSelect?.(nextStarValue(current, value));
          } : undefined}
        >
          ★
        </Tag>
      ))}
    </div>
  );
}

export function nextStarValue(current: number, selected: number) {
  return selected === current ? 0 : selected;
}

export function PreviewRating() {
  const state = useSyncExternalStore(subscribePreviewRatingState, getPreviewRatingState, getPreviewRatingState);
  if (!state.item) {
    return <div id="previewRating" className="rating-control inline-flex items-center gap-2.5 [&_.rating-star]:h-6 [&_.rating-star]:w-6 [&_.rating-star]:text-xl" aria-label="Rating" />;
  }
  return (
    <RatingStars
      id="previewRating"
      className="rating-control inline-flex items-center gap-2.5 [&_.rating-star]:h-6 [&_.rating-star]:w-6 [&_.rating-star]:text-xl"
      disabled={state.saving}
      disabledLabel={state.saving ? "Saving rating" : undefined}
      interactive={state.canEdit}
      item={state.item}
      onSelect={state.onSelect}
    />
  );
}
