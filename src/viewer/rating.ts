import type { EagleItem } from "./types";

export interface RatingOptions {
  interactive?: boolean;
  onSelect?: (value: number) => void;
}

export function renderRating(container: Element, item: EagleItem, { interactive = false, onSelect }: RatingOptions = {}) {
  container.replaceChildren();
  const current = Number(item.star || 0);
  for (let value = 1; value <= 5; value += 1) {
    const star = document.createElement(interactive ? "button" : "span");
    if (interactive) (star as HTMLButtonElement).type = "button";
    star.className = interactive ? "rating-star" : "rating-star rating-star-static";
    star.textContent = "★";
    star.title = `${value}`;
    star.dataset.active = value <= current ? "true" : "false";
    if (interactive) {
      star.ariaLabel = `Rating ${value}`;
      star.setAttribute("aria-pressed", value <= current ? "true" : "false");
      star.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect?.(nextStarValue(current, value));
      });
    } else {
      star.setAttribute("aria-hidden", "true");
    }
    container.append(star);
  }
}

export function nextStarValue(current: number, selected: number) {
  return selected === current ? 0 : selected;
}
