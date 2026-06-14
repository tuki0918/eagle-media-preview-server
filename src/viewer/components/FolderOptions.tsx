import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { UNCATEGORIZED_FOLDER_ID } from "../constants";
import type { EagleFolder } from "../types";

export interface FolderOptionsProps {
  folders: readonly EagleFolder[];
}

const roots = new WeakMap<HTMLSelectElement, Root>();

export function FolderOptions({ folders }: FolderOptionsProps) {
  return (
    <>
      <option value="">All folders</option>
      <option value={UNCATEGORIZED_FOLDER_ID}>Uncategorized</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folderLabel(folder)}
        </option>
      ))}
    </>
  );
}

function folderLabel(folder: EagleFolder) {
  return `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name} (${folder.imageCount ?? 0})`;
}

export function renderFolderOptionsView(container: HTMLSelectElement, props: FolderOptionsProps & { selectedValue: string }) {
  let root = roots.get(container);
  if (!root) {
    container.replaceChildren();
    root = createRoot(container);
    roots.set(container, root);
  }
  flushSync(() => {
    root.render(<FolderOptions folders={props.folders} />);
  });
  container.value = props.selectedValue;
}
