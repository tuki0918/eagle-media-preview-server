import type { CSSProperties } from "react";

/** Optional columns of the list view; only the thumbnail is always shown. */
export type ListColumnId =
  | "name"
  | "rating"
  | "tags"
  | "type"
  | "size"
  | "dimensions"
  | "duration"
  | "modified"
  | "created"
  | "annotation"
  | "url";

export interface ListColumnDefinition {
  id: ListColumnId;
  label: string;
  /** Grid track; `null` for the name and rating, which share the lead cell with the thumbnail. */
  track: string | null;
  /** Narrowest the track gets; a results area too narrow for every chosen column shows the compact list. */
  minWidth: number;
}

// Menu order follows the table order. Tracks keep the widths the list used before columns were optional.
export const LIST_COLUMNS: readonly ListColumnDefinition[] = [
  { id: "name", label: "Name", track: null, minWidth: 0 },
  { id: "rating", label: "Rating", track: null, minWidth: 0 },
  { id: "tags", label: "Tags", track: "minmax(120px,2fr)", minWidth: 120 },
  { id: "type", label: "Type", track: "80px", minWidth: 80 },
  { id: "size", label: "Size", track: "80px", minWidth: 80 },
  { id: "dimensions", label: "Dimensions", track: "minmax(96px,0.8fr)", minWidth: 96 },
  { id: "duration", label: "Duration", track: "72px", minWidth: 72 },
  { id: "modified", label: "Modified", track: "104px", minWidth: 104 },
  { id: "created", label: "Created", track: "104px", minWidth: 104 },
  { id: "annotation", label: "Annotation", track: "minmax(120px,1.6fr)", minWidth: 120 },
  { id: "url", label: "URL", track: "minmax(120px,1.2fr)", minWidth: 120 },
];

export const DEFAULT_LIST_COLUMNS: readonly ListColumnId[] = ["name", "rating", "tags", "type", "size", "dimensions", "duration", "modified"];
export const LIST_COLUMNS_STORAGE_KEY = "eagleListColumns";

const COLUMN_GAP = 12;
const ROW_PADDING = 12; // each side
const THUMB_WIDTH = 44;
/** The lead cell holds the thumbnail, then the name and/or rating. */
const LEAD_BASE_WIDTH = THUMB_WIDTH;
const NAME_MIN_WIDTH = 140;
const RATING_WIDTH = 96;
/** Width of the list's results area, measured by ResultSurface; unknown (Infinity) until then. */
let listAreaWidth = Number.POSITIVE_INFINITY;
const columnById = new Map(LIST_COLUMNS.map((column) => [column.id, column]));

export interface ListColumnLayout {
  /** Table columns after the lead cell, in order. */
  columns: ListColumnId[];
  /** Whether the lead cell shows the file name. */
  showName: boolean;
  /** Whether the lead cell shows the rating stars. */
  showRating: boolean;
  /** Narrowest results area (px) the table fits in; anything narrower shows the compact list. */
  minWidth: number;
  /** `--list-cols`: the grid template shared by the header and every row. */
  style: CSSProperties;
}

/** Results areas narrower than this always show the compact list, which has no column choice. */
export const COMPACT_LIST_MAX_WIDTH = 720;

/** Lays the table out as one grid template shared by every row. */
export function listColumnLayout(selected: readonly ListColumnId[]): ListColumnLayout {
  const showName = selected.includes("name");
  const showRating = selected.includes("rating");
  const columns = LIST_COLUMNS.filter((column) => column.track && selected.includes(column.id));
  const leadMin = LEAD_BASE_WIDTH
    + (showName ? COLUMN_GAP + NAME_MIN_WIDTH : showRating ? COLUMN_GAP + RATING_WIDTH : 0);
  const leadTrack = showName ? `minmax(${leadMin}px,2.2fr)` : `${leadMin}px`;
  const minWidth = ROW_PADDING * 2 + leadMin + columns.reduce((sum, column) => sum + COLUMN_GAP + column.minWidth, 0);
  return {
    columns: columns.map((column) => column.id),
    showName,
    showRating,
    minWidth: Math.max(COMPACT_LIST_MAX_WIDTH, minWidth),
    style: { "--list-cols": [leadTrack, ...columns.map((column) => column.track)].join(" ") } as CSSProperties,
  };
}

export function normalizeListColumns(value: unknown): ListColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_LIST_COLUMNS];
  const ids = new Set(value.filter((id): id is ListColumnId => typeof id === "string" && columnById.has(id as ListColumnId)));
  return LIST_COLUMNS.map((column) => column.id).filter((id) => ids.has(id));
}

export function isDefaultListColumns(columns: readonly ListColumnId[], areaWidth = listAreaWidth) {
  const defaults = defaultListColumns(areaWidth);
  return columns.length === defaults.length && defaults.every((id) => columns.includes(id));
}

/** Without tags, for results areas too narrow to fit the full default table (a phone held sideways, say). */
export const NARROW_DEFAULT_LIST_COLUMNS: readonly ListColumnId[] = DEFAULT_LIST_COLUMNS.filter((id) => id !== "tags");

/**
 * Columns shown until the user picks their own: tags only where the full default table fits,
 * so a mid-width area gets a table without tags instead of the compact list.
 */
export function defaultListColumns(areaWidth = listAreaWidth): readonly ListColumnId[] {
  return areaWidth >= listColumnLayout(DEFAULT_LIST_COLUMNS).minWidth ? DEFAULT_LIST_COLUMNS : NARROW_DEFAULT_LIST_COLUMNS;
}

const listeners = new Set<() => void>();
/** The user's saved choice; `null` while they use the width-dependent defaults. */
let savedListColumns = readStoredListColumns();

export function getListColumns(): readonly ListColumnId[] {
  return savedListColumns ?? defaultListColumns();
}

/** Whether the user has picked their own columns (so there is something to reset). */
export function hasCustomListColumns() {
  return savedListColumns !== null;
}

export function subscribeListColumns(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Saves a choice; one matching the defaults for the current width goes back to the defaults. */
export function setListColumns(columns: readonly ListColumnId[]) {
  const next = normalizeListColumns(columns);
  const saved = isDefaultListColumns(next) ? null : next;
  try {
    if (saved) window.localStorage.setItem(LIST_COLUMNS_STORAGE_KEY, JSON.stringify(saved));
    else window.localStorage.removeItem(LIST_COLUMNS_STORAGE_KEY);
  } catch {
    // Keep the in-memory choice when storage is unavailable.
  }
  update(saved);
}

export function toggleListColumn(id: ListColumnId, visible: boolean) {
  const current = getListColumns();
  setListColumns(visible ? [...current, id] : current.filter((column) => column !== id));
}

export function resetListColumns() {
  try {
    window.localStorage.removeItem(LIST_COLUMNS_STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
  update(null);
}

/** Re-reads the stored choice (after storage was cleared, or in tests). */
export function initializeListColumns() {
  update(readStoredListColumns());
}

function update(next: ListColumnId[] | null) {
  const same = next === savedListColumns
    || (next !== null && savedListColumns !== null && next.length === savedListColumns.length && next.every((id, index) => id === savedListColumns?.[index]));
  if (same) return;
  savedListColumns = next;
  notify();
}

function notify() {
  for (const listener of listeners) listener();
}

function readStoredListColumns(): ListColumnId[] | null {
  try {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(LIST_COLUMNS_STORAGE_KEY);
    return saved ? normalizeListColumns(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

const widthListeners = new Set<() => void>();

export function getListAreaWidth() {
  return listAreaWidth;
}

export function setListAreaWidth(width: number) {
  if (width === listAreaWidth) return;
  const columnsBefore = getListColumns();
  listAreaWidth = width;
  for (const listener of widthListeners) listener();
  // The defaults depend on the width, so the columns can change with it.
  if (getListColumns() !== columnsBefore) notify();
}

export function subscribeListAreaWidth(listener: () => void) {
  widthListeners.add(listener);
  return () => {
    widthListeners.delete(listener);
  };
}
