// Experimental sort orders, offered only when the server has `experimentalSort` on. The keys and
// each one's default direction follow Eagle's own "Sort by" menu; "" keeps Eagle's order.
export type SortKey = "" | "import" | "btime" | "mtime" | "name" | "ext" | "filesize" | "resolution" | "rating" | "duration";
export type SortOrder = "asc" | "desc";

export const SORT_OPTIONS: ReadonlyArray<{ key: Exclude<SortKey, "">; label: string; defaultOrder: SortOrder }> = [
  { key: "import", label: "Date added", defaultOrder: "desc" },
  { key: "btime", label: "Date created", defaultOrder: "desc" },
  { key: "mtime", label: "Date modified", defaultOrder: "desc" },
  { key: "name", label: "Name", defaultOrder: "asc" },
  { key: "ext", label: "Type", defaultOrder: "asc" },
  { key: "filesize", label: "File size", defaultOrder: "asc" },
  { key: "resolution", label: "Resolution", defaultOrder: "asc" },
  { key: "rating", label: "Rating", defaultOrder: "asc" },
  { key: "duration", label: "Duration", defaultOrder: "asc" },
];

export function parseSortKey(value: string | null | undefined): SortKey {
  const key = String(value || "").toLowerCase();
  return SORT_OPTIONS.some((option) => option.key === key) ? key as SortKey : "";
}

export function defaultSortOrder(sort: SortKey): SortOrder {
  return SORT_OPTIONS.find((option) => option.key === sort)?.defaultOrder ?? "desc";
}

/** "" when the order is the sort's default, so URLs stay short. */
export function parseSortOrder(sort: SortKey, value: string | null | undefined): "" | SortOrder {
  if (!sort) return "";
  const order = String(value || "").toLowerCase();
  return (order === "asc" || order === "desc") && order !== defaultSortOrder(sort) ? order : "";
}

export function effectiveSortOrder(sort: SortKey, order: "" | SortOrder): SortOrder {
  return order || defaultSortOrder(sort);
}

/** The label for "" (the server's own order). */
export const DEFAULT_SORT_LABEL = "Default order";

export function sortSummary(sort: SortKey, order: "" | SortOrder) {
  const option = SORT_OPTIONS.find((entry) => entry.key === sort);
  if (!option) return DEFAULT_SORT_LABEL;
  return `${option.label} ${effectiveSortOrder(sort, order) === "asc" ? "↑" : "↓"}`;
}
