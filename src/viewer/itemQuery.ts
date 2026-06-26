import { UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "./constants";
import { folderIds, itemTags } from "./format";
import type { EagleItem, ViewerState } from "./types";

export type ItemQueryState = Pick<ViewerState, "offset" | "query" | "tags" | "folderId" | "ext" | "rating"> & {
  limit: number;
  smartFolderId: string;
};

export function itemQueryParams(state: ItemQueryState) {
  const params = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
  });
  if (state.query) params.set("q", state.query);
  for (const tag of state.tags) params.append("tags", tag);
  if (state.smartFolderId) {
    params.set("smartFolderId", state.smartFolderId);
  } else if (state.folderId) {
    params.set("folderId", state.folderId);
  }
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);
  return params;
}

export function itemMatchesFolderFilter(
  item: Pick<EagleItem, "folders" | "tags">,
  state: Pick<ItemQueryState, "folderId" | "smartFolderId">,
) {
  if (state.smartFolderId || !state.folderId) return true;
  if (state.folderId === UNTAGGED_FOLDER_ID) return itemTags(item).length === 0;
  const folders = folderIds(item.folders);
  if (state.folderId === UNCATEGORIZED_FOLDER_ID) return folders.length === 0;
  return folders.includes(state.folderId);
}
