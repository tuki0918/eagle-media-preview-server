import { Fragment } from "react";
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
      <FolderOptionItems folders={folders} />
    </>
  );
}

function FolderOptionItems({ folders }: { folders: readonly EagleFolder[] }) {
  return (
    <>
      {folders.map((folder) => (
        <Fragment key={folder.id}>
          <option value={folder.id}>
            {folderLabel(folder)}
          </option>
          {folder.children?.length ? <FolderOptionItems folders={folder.children} /> : null}
        </Fragment>
      ))}
    </>
  );
}

function folderLabel(folder: EagleFolder) {
  return `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name} (${folder.imageCount ?? 0})`;
}
