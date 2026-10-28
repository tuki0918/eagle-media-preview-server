import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDownIcon } from "lucide-react";
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
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem("eagleSubfoldersCollapsed", String(next));
    } catch {
      // The section still toggles when storage is unavailable.
    }
  };
  const smart = Boolean(state.selectedSmartFolderId);
  const folders = useMemo(() => directSubfolders(
    smart ? state.smartFolders : state.folders,
    smart ? state.selectedSmartFolderId : state.selectedFolderId,
  ), [smart, state.smartFolders, state.folders, state.selectedSmartFolderId, state.selectedFolderId]);

  if (!visible || state.section === "tags" || !folders.length) return null;
  if (!smart && (state.selectedFolderId === UNCATEGORIZED_FOLDER_ID || state.selectedFolderId === UNTAGGED_FOLDER_ID)) return null;

  return (
    <section id="subfolderList" className="mb-3 flex flex-col gap-2" aria-label="Subfolders">
      <h2 className="m-0">
        <button
          type="button"
          className="flex max-w-full items-center gap-2 rounded-lg border-0 bg-transparent px-1 py-1 text-left text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} Subfolders`}
          onClick={toggleCollapsed}
        >
          <ChevronDownIcon className={`size-3.5 shrink-0 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} aria-hidden="true" />
          <span>Subfolders</span>
          <span className="[font-variant-numeric:tabular-nums]">({folders.length.toLocaleString()})</span>
        </button>
      </h2>
      {collapsed ? null : <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-x-4 gap-y-1 p-0">
        {folders.map((folder) => (
          <li key={folder.id} className="min-w-0">
            <SubfolderCard folder={folder} smart={smart} />
          </li>
        ))}
      </ul>}
    </section>
  );
}

function readCollapsed() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("eagleSubfoldersCollapsed") === "true";
  } catch {
    return false;
  }
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
