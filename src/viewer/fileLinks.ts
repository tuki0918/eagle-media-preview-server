import type { EagleItem } from "./types";

export function directFileUrl(item: EagleItem, baseUrl = typeof window === "undefined" ? "http://localhost/" : window.location.href) {
  return new URL(`/file/${encodeURIComponent(String(item.id || ""))}`, baseUrl).href;
}
