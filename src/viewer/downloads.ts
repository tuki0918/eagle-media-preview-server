import { directFileUrl } from "./fileLinks";
import { originalFileName } from "./format";
import type { EagleItem } from "./types";

export interface DownloadProgress {
  completed: number;
  currentName: string;
  total: number;
}

export interface DownloadFailure {
  error: unknown;
  item: EagleItem;
}

export interface DownloadResult {
  cancelled: boolean;
  downloaded: number;
  failures: DownloadFailure[];
}

export interface DownloadOptions {
  documentRef?: Document;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
  spacingMs?: number;
}

const DEFAULT_SPACING_MS = 120;

export async function downloadItems(items: readonly EagleItem[], options: DownloadOptions = {}): Promise<DownloadResult> {
  const uniqueItems = uniqueItemsById(items);
  const downloadedNames = new Set<string>();
  const failures: DownloadFailure[] = [];
  const fetchImpl = options.fetchImpl || fetch;
  const documentRef = options.documentRef || (typeof document === "undefined" ? undefined : document);
  const spacingMs = Math.max(0, Number(options.spacingMs ?? DEFAULT_SPACING_MS));
  let downloaded = 0;

  if (!documentRef) throw new Error("Downloads are only available in a browser");

  for (let index = 0; index < uniqueItems.length; index += 1) {
    if (options.signal?.aborted) {
      return { cancelled: true, downloaded, failures };
    }

    const item = uniqueItems[index];
    const fileName = uniqueDownloadFileName(item, downloadedNames);
    try {
      await downloadItem(item, fileName, { documentRef, fetchImpl, signal: options.signal });
      downloaded += 1;
    } catch (error) {
      if (options.signal?.aborted) {
        return { cancelled: true, downloaded, failures };
      }
      failures.push({ error, item });
    }

    options.onProgress?.({
      completed: index + 1,
      currentName: originalFileName(item),
      total: uniqueItems.length,
    });

    if (index < uniqueItems.length - 1 && spacingMs > 0) {
      const wasCancelled = await wait(spacingMs, options.signal);
      if (wasCancelled) return { cancelled: true, downloaded, failures };
    }
  }

  return { cancelled: false, downloaded, failures };
}

export function downloadFileName(item: EagleItem) {
  const name = originalFileName(item)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return name && name !== "." && name !== ".." ? name : `file-${String(item.id || "download")}`;
}

export function uniqueDownloadFileName(item: EagleItem, usedNames: Set<string>) {
  const baseName = downloadFileName(item);
  const extensionIndex = baseName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? baseName.slice(0, extensionIndex) : baseName;
  const extension = extensionIndex > 0 ? baseName.slice(extensionIndex) : "";
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function downloadItem(
  item: EagleItem,
  fileName: string,
  { documentRef, fetchImpl, signal }: Required<Pick<DownloadOptions, "documentRef" | "fetchImpl">> & Pick<DownloadOptions, "signal">,
) {
  const response = await fetchImpl(directFileUrl(item), {
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.hidden = true;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function uniqueItemsById(items: readonly EagleItem[]) {
  const seen = new Set<string>();
  const unique: EagleItem[] = [];
  for (const item of items) {
    const itemId = String(item.id || "").trim();
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    unique.push(item);
  }
  return unique;
}

function wait(durationMs: number, signal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(true);
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve(false);
    }, durationMs);
    const cancel = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve(true);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
