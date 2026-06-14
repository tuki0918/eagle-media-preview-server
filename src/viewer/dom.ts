import type { EagleItem } from "./types";

export function tableCell(value: string, className = "", title = "") {
  const cell = document.createElement("span");
  cell.className = className;
  cell.textContent = value;
  if (title) cell.title = title;
  return cell;
}

export function extensionPill(item: EagleItem) {
  const ext = document.createElement("span");
  ext.className = "ext-pill";
  ext.textContent = (item.ext || "file").toUpperCase();
  ext.dataset.ext = (item.ext || "file").toLowerCase();
  return ext;
}

export function directFileUrl(item: EagleItem, baseUrl = window.location.href) {
  return new URL(`/file/${encodeURIComponent(String(item.id || ""))}`, baseUrl).href;
}

export function directFileLink(item: EagleItem) {
  const link = document.createElement("a");
  link.className = "direct-file-link";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open file";
  link.href = directFileUrl(item);
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

export function previewChipList(values: unknown) {
  const list = document.createElement("div");
  list.className = "preview-chip-list";
  const chipValues = Array.isArray(values) ? values : [values];
  for (const value of chipValues) {
    const chip = document.createElement("span");
    chip.className = "preview-chip";
    chip.textContent = String(value || "");
    list.append(chip);
  }
  return list;
}
