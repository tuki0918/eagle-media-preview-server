import type { EagleFolder } from "./types";

export function findFolderById<T extends EagleFolder>(folders: readonly T[], id: string): EagleFolder | undefined {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const child = findFolderById(folder.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

export function directSubfolders(folders: readonly EagleFolder[], selectedId: string): readonly EagleFolder[] {
  if (!selectedId) return folders.filter((folder) => !folder.depth);
  return findFolderById(folders, selectedId)?.children ?? [];
}
