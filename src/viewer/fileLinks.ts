import { mediaUrl } from "./api";
import type { EagleItem } from "./types";

// The server requires the connected library id on /file, so opening the original in a new tab
// only works for the library this viewer connected to.
export function directFileUrl(item: EagleItem, baseUrl = typeof window === "undefined" ? "http://localhost/" : window.location.href) {
  return new URL(mediaUrl(String(item.id || ""), "file"), baseUrl).href;
}

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}
