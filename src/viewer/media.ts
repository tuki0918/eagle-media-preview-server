import {
  pdfPreviewExts,
  playableAudioExts,
  playableVideoExts,
  textPreviewExts,
} from "./constants";
import type { IconName } from "./icons";
import type { EagleItem } from "./types";

export type ThumbnailMediaType = "video" | "audio" | "document" | "image";

export function thumbnailMediaType(item: EagleItem): ThumbnailMediaType {
  const ext = String(item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) return "video";
  if (playableAudioExts.has(ext)) return "audio";
  if (textPreviewExts.has(ext) || pdfPreviewExts.has(ext)) return "document";
  return "image";
}

export function thumbnailOverlayIcon(mediaType: ThumbnailMediaType): IconName {
  return mediaType === "video" || mediaType === "audio" ? "play" : "move-diagonal";
}

export function thumbnailAriaLabel(item: EagleItem, mediaType = thumbnailMediaType(item)) {
  const name = item.name || item.id || "file";
  return mediaType === "video" || mediaType === "audio" ? `Play ${name}` : `Open ${name}`;
}
