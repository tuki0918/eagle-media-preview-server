import { createRoot, type Root } from "react-dom/client";
import type { EagleItem } from "../types";

export interface RatingStarsProps {
  className: string;
  interactive?: boolean;
  item: EagleItem;
  onSelect?: (value: number) => void;
}

const roots = new WeakMap<HTMLElement, Root>();

export function RatingStars({ className, interactive = false, item, onSelect }: RatingStarsProps) {
  const current = Number(item.star || 0);
  const Tag = interactive ? "button" : "span";
  return (
    <div className={className} aria-label="Rating">
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

export function renderRatingView(container: HTMLElement, props: RatingStarsProps) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<RatingStars {...props} />);
}

export function clearRatingView(container: HTMLElement) {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
}
