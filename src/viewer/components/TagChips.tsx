import { createRoot, type Root } from "react-dom/client";

interface TagChipsProps {
  tags: readonly string[];
  onRemove: (tag: string) => void;
}

const roots = new WeakMap<HTMLElement, Root>();

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function TagChips({ tags, onRemove }: TagChipsProps) {
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className="tag-chip">
          <span>{tag}</span>
          <button type="button" aria-label={`Remove tag ${tag}`} title={`Remove tag ${tag}`} onClick={() => onRemove(tag)}>
            <RemoveIcon />
          </button>
        </span>
      ))}
    </>
  );
}

export function renderTagChipsView(container: HTMLElement, props: TagChipsProps) {
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<TagChips {...props} />);
}
