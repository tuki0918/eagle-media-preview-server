import { directFileUrl } from "./fileLinks";
import type { EagleItem } from "./types";

export type ShareFileResult = "shared" | "downloaded" | "cancelled" | "blocked";

export function shareFileName(item: EagleItem) {
  const name = String(item.name || item.id || "file").replace(/[\\/:*?"<>|]+/g, "_").trim() || "file";
  const ext = String(item.ext || "").replace(/^\.+/, "");
  if (!ext || name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return name;
  return `${name}.${ext}`;
}

export async function fetchShareFile(item: EagleItem, signal?: AbortSignal) {
  const response = await fetch(directFileUrl(item), { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`Unable to load file (${response.status})`);
  const blob = await response.blob();
  return new File([blob], shareFileName(item), { type: blob.type || "application/octet-stream" });
}

// Mirrors the usual Web Share pattern: hand the file to the OS share sheet (AirDrop, Save to
// Photos, etc.) when the browser supports file sharing, otherwise fall back to a download.
// With `retryable`, a share rejected because the click's user activation expired (slow fetch)
// reports "blocked" so the caller can ask for a fresh tap instead of downloading.
export async function shareOrDownloadFile(file: File, { retryable = false }: { retryable?: boolean } = {}): Promise<ShareFileResult> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav && typeof nav.share === "function" && (typeof nav.canShare !== "function" || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file] });
      return "shared";
    } catch (error) {
      if (errorName(error) === "AbortError") return "cancelled";
      if (retryable && errorName(error) === "NotAllowedError") return "blocked";
    }
  }
  downloadFile(file);
  return "downloaded";
}

// DOMException is not an Error subclass in every runtime, so compare by name.
export function errorName(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
