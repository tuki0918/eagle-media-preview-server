import { UNCATEGORIZED_FOLDER_ID } from "../constants";
import type { EagleFolder } from "../types";

export interface FolderOptionsProps {
  folders: readonly EagleFolder[];
}

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
