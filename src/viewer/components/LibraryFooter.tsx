import { createRoot, type Root } from "react-dom/client";

interface LibraryFooterProps {
  name?: string;
}

const roots = new WeakMap<HTMLElement, Root>();

export function LibraryFooter({ name = "Connecting to Eagle" }: LibraryFooterProps) {
  return (
    <p id="libraryFooterName" className="library-footer-name mt-2 text-center text-xs leading-[1.4] text-app-muted">
      {name}
    </p>
  );
}

export function renderLibraryFooterView(container: HTMLElement, props: Required<LibraryFooterProps>) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(<LibraryFooter {...props} />);
}
