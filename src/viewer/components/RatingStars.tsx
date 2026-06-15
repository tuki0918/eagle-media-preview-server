import { useSyncExternalStore } from "react";
import { getPreviewRatingState, subscribePreviewRatingState } from "../previewRatingState";
import type { EagleItem } from "../types";

export interface RatingStarsProps {
  className: string;
  id?: string;
  interactive?: boolean;
  item: EagleItem;
  onSelect?: (value: number) => void;
}

export function RatingStars({ className, id, interactive = false, item, onSelect }: RatingStarsProps) {
  const current = Number(item.star || 0);
  const Tag = interactive ? "button" : "span";
  return (
    <div id={id} className={className} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((value) => (
        <Tag
          key={value}
          className={interactive ? "rating-star" : "rating-star rating-star-static"}
          title={`${value}`}
          data-active={value <= current ? "true" : "false"}
          aria-hidden={interactive ? undefined : "true"}
          aria-label={interactive ? `Rating ${value}` : undefined}
          aria-pressed={interactive ? value <= current : undefined}
          type={interactive ? "button" : undefined}
          onClick={interactive ? (event) => {
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
    return <div id="previewRating" className="rating-control inline-flex items-center gap-px" aria-label="Rating" />;
  }
  return (
    <RatingStars
      id="previewRating"
      className="rating-control inline-flex items-center gap-px"
      interactive
      item={state.item}
      onSelect={state.onSelect}
    />
  );
}
