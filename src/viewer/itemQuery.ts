import { UNCATEGORIZED_FOLDER_ID, UNTAGGED_FOLDER_ID } from "./constants";
import { folderIds, itemTags } from "./format";
import { effectiveSortOrder } from "./sort";
import type { EagleItem, ViewerState } from "./types";

export type ItemQueryState = Pick<ViewerState, "offset" | "query" | "tags" | "folderId" | "ext" | "rating"> & {
  limit: number;
  smartFolderId: string;
} & Partial<Pick<ViewerState, "sort" | "order">>;

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
  // Smart folders keep Eagle's order. The direction is always sent: the viewer's default direction
  // for a key can differ from the server's, which follows Eagle.
  if (state.sort && !state.smartFolderId) {
    params.set("sort", state.sort);
    params.set("order", effectiveSortOrder(state.sort, state.order ?? ""));
  }
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
