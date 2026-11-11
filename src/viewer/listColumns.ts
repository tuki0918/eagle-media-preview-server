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
  return sameColumns(columns, defaultListColumns(areaWidth));
}

/** Without tags, for results areas too narrow to fit the full default table (a phone held sideways, say). */
export const NARROW_DEFAULT_LIST_COLUMNS: readonly ListColumnId[] = DEFAULT_LIST_COLUMNS.filter((id) => id !== "tags");
const FULL_DEFAULT_MIN_WIDTH = listColumnLayout(DEFAULT_LIST_COLUMNS).minWidth;

/**
 * Columns shown until the user changes them: tags only where the full default table fits,
 * so a mid-width area gets a table without tags instead of the compact list.
 */
export function defaultListColumns(areaWidth = listAreaWidth): readonly ListColumnId[] {
  return areaWidth >= FULL_DEFAULT_MIN_WIDTH ? DEFAULT_LIST_COLUMNS : NARROW_DEFAULT_LIST_COLUMNS;
}

/**
 * The user's changes, kept apart from the width-dependent defaults: columns they turned on that the
 * defaults leave off, and columns they turned off. Only what they changed is fixed, so turning on
 * Created in a narrow window still brings tags back once the window is wide.
 */
export interface ListColumnChanges {
  shown: ListColumnId[];
  hidden: ListColumnId[];
}

const listeners = new Set<() => void>();
/** `null` while the user hasn't changed anything. */
let listColumnChanges = readStoredListColumns();
let listColumns = applyChanges(listColumnChanges);

export function getListColumns(): readonly ListColumnId[] {
  return listColumns;
}

/** Whether the user has changed the columns (so there is something to reset). */
export function hasCustomListColumns() {
  return listColumnChanges !== null;
}

export function subscribeListColumns(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows exactly these columns at the current width, saved as changes from its defaults. */
export function setListColumns(columns: readonly ListColumnId[]) {
  const next = normalizeListColumns(columns);
  const defaults = defaultListColumns();
  save({ shown: next.filter((id) => !defaults.includes(id)), hidden: defaults.filter((id) => !next.includes(id)) });
}

export function toggleListColumn(id: ListColumnId, visible: boolean) {
  const inDefaults = defaultListColumns().includes(id);
  const shown = (listColumnChanges?.shown ?? []).filter((column) => column !== id);
  const hidden = (listColumnChanges?.hidden ?? []).filter((column) => column !== id);
  if (visible && !inDefaults) shown.push(id);
  if (!visible && inDefaults) hidden.push(id);
  save({ shown, hidden });
}

export function resetListColumns() {
  save(null);
}

/** Re-reads the stored choice (after storage was cleared, or in tests). */
export function initializeListColumns() {
  update(readStoredListColumns());
}

function save(changes: ListColumnChanges | null) {
  const next = changes && normalizeChanges(changes);
  try {
    if (next) window.localStorage.setItem(LIST_COLUMNS_STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(LIST_COLUMNS_STORAGE_KEY);
  } catch {
    // Keep the in-memory choice when storage is unavailable.
  }
  update(next);
}

function update(changes: ListColumnChanges | null) {
  const customChanged = (changes === null) !== (listColumnChanges === null);
  listColumnChanges = changes;
  refresh(customChanged);
}

/** Recomputes the shown columns; listeners hear about it when they (or the reset state) changed. */
function refresh(force = false) {
  const next = applyChanges(listColumnChanges);
  if (next.length === listColumns.length && next.every((id, index) => id === listColumns[index])) {
    if (force) notify();
    return;
  }
  listColumns = next;
  notify();
}

function applyChanges(changes: ListColumnChanges | null): ListColumnId[] {
  const defaults = defaultListColumns();
  if (!changes) return [...defaults];
  return normalizeListColumns([...defaults.filter((id) => !changes.hidden.includes(id)), ...changes.shown]);
}

/** Drops empty changes; `null` means nothing changed. */
function normalizeChanges(changes: ListColumnChanges): ListColumnChanges | null {
  const shown = normalizeListColumns(changes.shown);
  const hidden = normalizeListColumns(changes.hidden).filter((id) => !shown.includes(id));
  return shown.length || hidden.length ? { shown, hidden } : null;
}

function sameColumns(a: readonly ListColumnId[], b: readonly ListColumnId[]) {
  return a.length === b.length && b.every((id) => a.includes(id));
}

function notify() {
  for (const listener of listeners) listener();
}

function readStoredListColumns(): ListColumnChanges | null {
  try {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(LIST_COLUMNS_STORAGE_KEY);
    if (!saved) return null;
    const value: unknown = JSON.parse(saved);
    // A plain list of columns (from before changes were kept apart) was an exact choice: keep every
    // listed column on and every other default off, whatever the width.
    if (Array.isArray(value)) {
      const columns = normalizeListColumns(value);
      return normalizeChanges({ shown: columns, hidden: DEFAULT_LIST_COLUMNS.filter((id) => !columns.includes(id)) });
    }
    if (value && typeof value === "object") {
      const { shown, hidden } = value as Partial<ListColumnChanges>;
      return normalizeChanges({ shown: Array.isArray(shown) ? shown : [], hidden: Array.isArray(hidden) ? hidden : [] });
    }
    return null;
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
  listAreaWidth = width;
  for (const listener of widthListeners) listener();
  // The defaults depend on the width, so the columns can change with it.
  refresh();
}

export function subscribeListAreaWidth(listener: () => void) {
  widthListeners.add(listener);
  return () => {
    widthListeners.delete(listener);
  };
}
