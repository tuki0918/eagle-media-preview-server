import { useMemo, useSyncExternalStore } from "react";
import { UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "../constants";
import { directSubfolders } from "../folderTree";
import { getSearchControlsState, subscribeSearchControlsState } from "../searchControlsState";
import { changeFolder, changeSmartFolder } from "../shellActions";
import { getSubfoldersVisible, subscribeSubfoldersVisible } from "../subfolderVisibilityState";
import type { EagleFolder } from "../types";
import { FolderCover } from "./FolderCover";

export function SubfolderList() {
  const state = useSyncExternalStore(subscribeSearchControlsState, getSearchControlsState, getSearchControlsState);
  const visible = useSyncExternalStore(subscribeSubfoldersVisible, getSubfoldersVisible, getSubfoldersVisible);
  const smart = Boolean(state.selectedSmartFolderId);
  const folders = useMemo(() => directSubfolders(
    smart ? state.smartFolders : state.folders,
    smart ? state.selectedSmartFolderId : state.selectedFolderId,
  ), [smart, state.smartFolders, state.folders, state.selectedSmartFolderId, state.selectedFolderId]);

  if (!visible || state.section === "tags" || !folders.length) return null;
  if (!smart && (state.selectedFolderId === UNCATEGORIZED_FOLDER_ID || state.selectedFolderId === UNTAGGED_FOLDER_ID)) return null;

  return (
    <section id="subfolderList" className="mb-3 flex flex-col gap-2" aria-label="Subfolders">
      <h2 className="m-0 flex items-center gap-2 px-2 py-1 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        <span>Subfolders</span>
        <span className="[font-variant-numeric:tabular-nums]">{folders.length.toLocaleString()}</span>
      </h2>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-x-4 gap-y-1 p-0">
        {folders.map((folder) => (
          <li key={folder.id} className="min-w-0">
            <SubfolderCard folder={folder} smart={smart} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubfolderCard({ folder, smart }: { folder: EagleFolder; smart: boolean }) {
  const count = typeof folder.imageCount === "number" && Number.isFinite(folder.imageCount)
    ? Math.max(0, folder.imageCount)
    : undefined;
  return (
    <button
      type="button"
      className="subfolder-card flex w-full min-w-0 items-center gap-3 rounded-xl border-0 bg-transparent p-2 text-left text-inherit transition-colors hover:bg-muted focus-visible:bg-muted"
      title={folder.name}
      onClick={() => (smart ? changeSmartFolder : changeFolder)({ currentTarget: { value: folder.id } })}
    >
      <FolderCover folderId={folder.id} smart={smart} empty={count === 0 && !folder.children?.length} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-[15px] font-medium leading-tight text-foreground">{folder.name}</span>
        {count === undefined ? null : (
          <span className="text-[13px] leading-tight text-muted-foreground [font-variant-numeric:tabular-nums]">
            {count.toLocaleString()} {count === 1 ? "item" : "items"}
          </span>
        )}
      </span>
    </button>
  );
}
