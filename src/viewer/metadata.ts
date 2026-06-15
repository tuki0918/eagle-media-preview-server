import { RECENT_METADATA_LIMIT } from "./constants";
import { normalizeTag } from "./format";
import type { EagleFolder } from "./types";

export interface MetadataSuggestion {
  value: string;
  label: string;
  meta: string;
}

export interface RemoteTag {
  name?: unknown;
  count?: unknown;
}

export function tagSuggestionItems({
  query,
  selectedValues,
  recentTags,
  remoteTags = [],
}: {
  query: string;
  selectedValues: readonly string[];
  recentTags: readonly string[];
  remoteTags?: readonly RemoteTag[];
}) {
  const selected = new Set(selectedValues);
  const recent = recentTags
    .filter((tag) => !selected.has(tag) && matchesQuery(tag, query))
    .map((tag) => ({ value: tag, label: tag, meta: "Recent" }));
  if (!query) return recent;

  return dedupeSuggestions([
    ...recent,
    ...remoteTags
      .map((item) => ({
        value: normalizeTag(item?.name),
        label: normalizeTag(item?.name),
        meta: Number.isFinite(item?.count) ? Number(item.count).toLocaleString() : "",
      }))
      .filter((item) => item.value && !selected.has(item.value) && matchesQuery(item.label, query)),
  ]);
}

export function folderSuggestionItems({
  query,
  selectedValues,
  recentFolderIds,
  folders,
}: {
  query: string;
  selectedValues: readonly string[];
  recentFolderIds: readonly string[];
  folders: readonly EagleFolder[];
}) {
  const selected = new Set(selectedValues);
  const labelForFolder = (id: string) => folderLabel(id, folders);
  const recent = recentFolderIds
    .filter((id) => !selected.has(id) && matchesQuery(labelForFolder(id), query))
    .map((id) => ({ value: id, label: labelForFolder(id), meta: "Recent" }));
  const folderItems = folders
    .filter((folder) => !selected.has(folder.id) && matchesQuery(folder.name, query))
    .map((folder) => ({
      value: folder.id,
      label: labelForFolder(folder.id),
      meta: Number.isFinite(folder.imageCount) ? `${Number(folder.imageCount).toLocaleString()} items` : "",
    }));
  return dedupeSuggestions([...recent, ...folderItems]).slice(0, 20);
}

export function dedupeSuggestions(items: readonly MetadataSuggestion[]) {
  const seen = new Set<string>();
  const output: MetadataSuggestion[] = [];
  for (const item of items) {
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    output.push(item);
  }
  return output;
}

export function matchesQuery(value: unknown, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return String(value || "").toLowerCase().includes(needle);
}

export function folderLabel(id: string, folders: readonly EagleFolder[]) {
  const folder = folders.find((entry) => entry.id === id);
  if (!folder) return id;
  return `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name}`;
}

export function readRecentList(key: string, storage: Storage = localStorage) {
  try {
    const values = JSON.parse(storage.getItem(key) || "[]");
    return Array.isArray(values) ? uniqueValues(values.map((value) => String(value || "").trim()).filter(Boolean)) : [];
  } catch {
    return [];
  }
}

export function writeRecentList(key: string, values: readonly unknown[], storage: Storage = localStorage) {
  try {
    storage.setItem(key, JSON.stringify(uniqueValues(values).slice(0, RECENT_METADATA_LIMIT)));
  } catch {
    // Recent metadata is a convenience cache; saving metadata itself should not fail because of storage limits.
  }
}

export function rememberRecentValues(key: string, values: readonly unknown[], storage: Storage = localStorage) {
  const next = uniqueValues([
    ...(values || []).map((value) => String(value || "").trim()).filter(Boolean),
    ...readRecentList(key, storage),
  ]);
  writeRecentList(key, next, storage);
}

export function uniqueValues(values: readonly unknown[]) {
  const unique: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized && !unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}
