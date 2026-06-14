import { createRoot, type Root } from "react-dom/client";

interface PreviewMetaProps {
  value?: string;
}

interface PreviewOriginalNameProps {
  value?: string;
}

const metaRoots = new WeakMap<HTMLElement, Root>();
const originalNameRoots = new WeakMap<HTMLElement, Root>();

export function PreviewMeta({ value = "" }: PreviewMetaProps) {
  return <span id="previewMeta">{value}</span>;
}

export function PreviewOriginalName({ value = "" }: PreviewOriginalNameProps) {
  return (
    <div
      id="previewOriginalName"
      className="preview-original-name-value w-full min-w-0 whitespace-normal text-sm leading-[1.4] text-app-text [overflow-wrap:anywhere]"
      title={value || undefined}
    >
      {value}
    </div>
  );
}

export function renderPreviewMetaView(container: HTMLElement, props: Required<PreviewMetaProps>) {
  let root = metaRoots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    metaRoots.set(container, root);
  }
  root.render(<PreviewMeta {...props} />);
}

export function renderPreviewOriginalNameView(container: HTMLElement, props: Required<PreviewOriginalNameProps>) {
  let root = originalNameRoots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    originalNameRoots.set(container, root);
  }
  root.render(<PreviewOriginalName {...props} />);
}
