import { RECENT_METADATA_LIMIT } from "./constants";
import { normalizeTag } from "./format";
import type { EagleFolder } from "./types";

export interface MetadataSuggestion {
  value: string;
  label: string;
  meta: string;
  depth?: number;
  disabled?: boolean;
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
  recentFolderIds: _recentFolderIds,
  folders,
}: {
  query: string;
  selectedValues: readonly string[];
  recentFolderIds: readonly string[];
  folders: readonly EagleFolder[];
}) {
  const selected = new Set(selectedValues);
  const folderItems = folderTreeItems(folders);
  const folderById = new Map(folderItems.map((folder) => [folder.id, folder]));
  const suggestionForFolder = (id: string) => {
    const folder = folderById.get(id);
    const disabled = selected.has(id);
    const imageCount = folder?.imageCount;
    return {
      value: id,
      label: folder?.name || id,
      meta: disabled ? "Added" : Number.isFinite(imageCount) ? `${Number(imageCount).toLocaleString()} items` : "",
      depth: Number(folder?.depth || 0),
      disabled,
    };
  };
  return folderItems
    .filter((folder) => matchesQuery(folderLabel(folder.id, folders), query))
    .map((folder) => suggestionForFolder(folder.id));
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
  const flattenedFolders = folderTreeItems(folders);
  const index = flattenedFolders.findIndex((entry) => entry.id === id);
  const folder = flattenedFolders[index];
  if (!folder) return id;
  const path = [folder.name];
  let targetDepth = Number(folder.depth || 0);
  for (let cursor = index - 1; cursor >= 0 && targetDepth > 0; cursor -= 1) {
    const parent = flattenedFolders[cursor];
    const parentDepth = Number(parent?.depth || 0);
    if (parentDepth >= targetDepth) continue;
    path.unshift(parent.name);
    targetDepth = parentDepth;
  }
  return path.join(" / ");
}

function folderTreeItems(folders: readonly EagleFolder[]): EagleFolder[] {
  const items: EagleFolder[] = [];
  for (const folder of folders) {
    items.push(folder);
    if (folder.children?.length) items.push(...folderTreeItems(folder.children));
  }
  return items;
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
