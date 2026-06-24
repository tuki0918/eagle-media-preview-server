import { audioExts, dateFormatter, dateTimeFormatter, videoExts } from "./constants";
import type { EagleFolder, EagleItem } from "./types";

export function itemMeta(item: EagleItem) {
  const ext = (item.ext || "").toUpperCase() || "FILE";
  const dimensions = item.width && item.height ? `${item.width}x${item.height}` : "";
  const duration = isTimedMedia(item) ? formatDuration(item.duration) : "";
  const size = formatBytes(item.size);
  return [ext, dimensions, duration, size].filter(Boolean).join(" · ");
}

export function formatDimensions(item: EagleItem) {
  return item.width && item.height ? `${item.width} x ${item.height}` : "";
}

export function formatDurationCell(item: EagleItem) {
  return isTimedMedia(item) ? formatDuration(item.duration) : "";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function previewFileName(item: EagleItem) {
  return originalFileName(item);
}

export function displayFileName(item: EagleItem) {
  const fileName = String(item.name || item.id || "file").trim() || "file";
  const ext = String(item.ext || "").trim().replace(/^\./, "").toLowerCase();
  if (!ext) return fileName;
  const suffix = `.${ext}`;
  return fileName.toLowerCase().endsWith(suffix)
    ? fileName.slice(0, -suffix.length) || fileName
    : fileName;
}

export function originalFileName(item: EagleItem) {
  const name = String(item.name || item.id || "file").trim() || "file";
  const ext = String(item.ext || "").trim().replace(/^\./, "");
  if (!ext || name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return name;
  return `${name}.${ext}`;
}

export function itemTags(item: EagleItem) {
  return Array.isArray(item.tags) ? item.tags.map(normalizeTag).filter(Boolean) : [];
}

export function normalizeTag(value: unknown) {
  return String(value || "").trim();
}

export function normalizeRating(value: unknown) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0;
}

export function mediaTypeLabel(item: EagleItem) {
  return (item.ext || "").toUpperCase() || "FILE";
}

export function formatItemDate(item: EagleItem, keys: readonly string[]) {
  for (const key of keys) {
    const value = item[key];
    const formatted = formatDate(value);
    if (formatted) return formatted;
  }
  return "";
}

export function folderIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    return item?.id || "";
  }).filter(Boolean);
}

export function folderDisplayNames(value: unknown, folders: EagleFolder[]) {
  const byId = new Map(folderTreeItems(folders).map((folder) => [folder.id, folder.name]));
  return folderIds(value).map((id) => byId.get(id) || id);
}

function folderTreeItems(folders: readonly EagleFolder[]): EagleFolder[] {
  const items: EagleFolder[] = [];
  for (const folder of folders) {
    items.push(folder);
    if (folder.children?.length) items.push(...folderTreeItems(folder.children));
  }
  return items;
}

export function formatBytes(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatDate(value: unknown) {
  const timestamp = typeof value === "string" && value.trim() && !Number.isFinite(Number(value))
    ? Date.parse(value)
    : Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatDateShort(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return dateFormatter.format(new Date(timestamp));
}

export function isTimedMedia(item: EagleItem) {
  const ext = (item.ext || "").toLowerCase();
  return videoExts.has(ext) || audioExts.has(ext);
}

export function flattenFolders(folders: EagleFolder[] = [], depth = 0): EagleFolder[] {
  return (folders || []).map((folder) => ({
    ...folder,
    children: folder.children?.length ? flattenFolders(folder.children, depth + 1) : folder.children,
    depth,
  }));
}

export function displayFolderCount(count: unknown) {
  if (count === undefined || count === null) return undefined;
  const normalized = Number(count);
  if (!Number.isFinite(normalized) || normalized <= 0) return undefined;
  return normalized;
}

export function folderCountBaselines(folders: readonly EagleFolder[]) {
  const baselines = new Map<string, number>();
  collectFolderCountBaselines(folders, baselines);
  return baselines;
}

export function applyFolderCountChanges(
  folders: readonly EagleFolder[],
  previousFolderIds: readonly string[],
  nextFolderIds: readonly string[],
  baselines?: ReadonlyMap<string, number>,
): EagleFolder[] {
  const deltas = folderCountDeltas(previousFolderIds, nextFolderIds);
  if (!deltas.size) return [...folders];
  return folders.map((folder) => applyFolderCountChange(folder, deltas, baselines));
}

function collectFolderCountBaselines(folders: readonly EagleFolder[], baselines: Map<string, number>) {
  for (const folder of folders) {
    const count = Number(folder.imageCount);
    if (Number.isFinite(count)) baselines.set(folder.id, count);
    if (folder.children?.length) collectFolderCountBaselines(folder.children, baselines);
  }
}

function folderCountDeltas(previousFolderIds: readonly string[], nextFolderIds: readonly string[]) {
  const previous = new Set(previousFolderIds);
  const next = new Set(nextFolderIds);
  const deltas = new Map<string, number>();
  for (const id of next) {
    if (!previous.has(id)) deltas.set(id, 1);
  }
  for (const id of previous) {
    if (!next.has(id)) deltas.set(id, -1);
  }
  return deltas;
}

function applyFolderCountChange(
  folder: EagleFolder,
  deltas: ReadonlyMap<string, number>,
  baselines?: ReadonlyMap<string, number>,
): EagleFolder {
  const children = folder.children?.length
    ? folder.children.map((child) => applyFolderCountChange(child, deltas, baselines))
    : folder.children;
  const delta = deltas.get(folder.id) || 0;
  if (!delta) return children === folder.children ? folder : { ...folder, children };
  const currentCount = Number(folder.imageCount);
  if (!Number.isFinite(currentCount)) return children === folder.children ? folder : { ...folder, children };
  const baseline = baselines?.get(folder.id);
  if (baselines && baseline !== currentCount) return children === folder.children ? folder : { ...folder, children };
  return {
    ...folder,
    children,
    imageCount: Math.max(0, currentCount + delta),
  };
}
