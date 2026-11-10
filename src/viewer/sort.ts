// Experimental sort orders, offered only when the server has `experimentalSort` on. The keys follow
// Eagle's own "Sort by" menu; each one starts in the direction people usually want (newest, highest,
// largest first; names A to Z). "" keeps Eagle's order.
export type SortKey = "" | "import" | "btime" | "mtime" | "name" | "ext" | "filesize" | "resolution" | "rating" | "duration";
export type SortOrder = "asc" | "desc";

export const SORT_OPTIONS: ReadonlyArray<{
  key: Exclude<SortKey, "">;
  label: string;
  defaultOrder: SortOrder;
  /** What each direction means for this key, e.g. "Newest first". */
  directionLabels: Readonly<Record<SortOrder, string>>;
}> = [
  { key: "import", label: "Date added", defaultOrder: "desc", directionLabels: { asc: "Oldest first", desc: "Newest first" } },
  { key: "btime", label: "Date created", defaultOrder: "desc", directionLabels: { asc: "Oldest first", desc: "Newest first" } },
  { key: "mtime", label: "Date modified", defaultOrder: "desc", directionLabels: { asc: "Oldest first", desc: "Newest first" } },
  { key: "name", label: "Name", defaultOrder: "asc", directionLabels: { asc: "A → Z", desc: "Z → A" } },
  { key: "ext", label: "Type", defaultOrder: "asc", directionLabels: { asc: "A → Z", desc: "Z → A" } },
  { key: "filesize", label: "File size", defaultOrder: "desc", directionLabels: { asc: "Smallest first", desc: "Largest first" } },
  { key: "resolution", label: "Resolution", defaultOrder: "desc", directionLabels: { asc: "Lowest first", desc: "Highest first" } },
  { key: "rating", label: "Rating", defaultOrder: "desc", directionLabels: { asc: "Lowest first", desc: "Highest first" } },
  { key: "duration", label: "Duration", defaultOrder: "desc", directionLabels: { asc: "Shortest first", desc: "Longest first" } },
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

export function sortLabel(sort: SortKey) {
  return SORT_OPTIONS.find((entry) => entry.key === sort)?.label ?? DEFAULT_SORT_LABEL;
}

export function sortDirectionLabel(sort: SortKey, order: SortOrder) {
  return SORT_OPTIONS.find((entry) => entry.key === sort)?.directionLabels[order] ?? (order === "asc" ? "Ascending" : "Descending");
}

export function sortSummary(sort: SortKey, order: "" | SortOrder) {
  if (!SORT_OPTIONS.some((entry) => entry.key === sort)) return DEFAULT_SORT_LABEL;
  return `${sortLabel(sort)}: ${sortDirectionLabel(sort, effectiveSortOrder(sort, order))}`;
}
