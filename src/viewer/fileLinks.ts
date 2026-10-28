import type { EagleItem } from "./types";

export function directFileUrl(item: EagleItem, baseUrl = typeof window === "undefined" ? "http://localhost/" : window.location.href) {
  return new URL(`/file/${encodeURIComponent(String(item.id || ""))}`, baseUrl).href;
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
