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
  const byId = new Map(folders.map((folder) => [folder.id, folder.name]));
  return folderIds(value).map((id) => byId.get(id) || id);
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
  const output: EagleFolder[] = [];
  for (const folder of folders || []) {
    output.push({ ...folder, depth });
    output.push(...flattenFolders(folder.children, depth + 1));
  }
  return output;
}
