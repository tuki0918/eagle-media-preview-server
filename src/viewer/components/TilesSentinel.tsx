import { createRoot, type Root } from "react-dom/client";

interface TilesSentinelProps {
  hidden?: boolean;
  text?: string;
}

const roots = new WeakMap<HTMLElement, Root>();

export function TilesSentinel({ hidden = true, text = "Loading more" }: TilesSentinelProps) {
  return (
    <div id="tilesSentinel" className="tiles-sentinel mt-3 grid min-h-[52px] place-items-center text-[13px] font-[680] text-app-muted" hidden={hidden}>
      {text}
    </div>
  );
}

export function renderTilesSentinelView(container: HTMLElement, props: Required<TilesSentinelProps>) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<TilesSentinel {...props} />);
}
