import type { ViewerState } from "./types";

export type ItemQueryState = Pick<ViewerState, "offset" | "query" | "tags" | "folderId" | "ext" | "rating"> & {
  limit: number;
};

export function itemQueryParams(state: ItemQueryState) {
  const params = new URLSearchParams({
    offset: String(state.offset),
    limit: String(state.limit),
  });
  if (state.query) params.set("q", state.query);
  for (const tag of state.tags) params.append("tags", tag);
  if (state.folderId) params.set("folderId", state.folderId);
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);
  return params;
}
