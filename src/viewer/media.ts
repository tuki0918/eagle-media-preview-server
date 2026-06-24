import {
  pdfPreviewExts,
  playableAudioExts,
  playableVideoExts,
  textPreviewExts,
  urlPreviewExts,
} from "./constants";
import type { EagleItem } from "./types";

export type ThumbnailMediaType = "video" | "audio" | "document" | "image";
export type ThumbnailOverlayIcon = "play" | "move-diagonal";

export function thumbnailMediaType(item: EagleItem): ThumbnailMediaType {
  const ext = String(item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) return "video";
  if (playableAudioExts.has(ext)) return "audio";
  if (textPreviewExts.has(ext) || pdfPreviewExts.has(ext) || urlPreviewExts.has(ext)) return "document";
  return "image";
}

export function thumbnailOverlayIcon(mediaType: ThumbnailMediaType): ThumbnailOverlayIcon {
  return mediaType === "video" || mediaType === "audio" ? "play" : "move-diagonal";
}

export function thumbnailAriaLabel(item: EagleItem, mediaType = thumbnailMediaType(item)) {
  const name = item.name || item.id || "file";
  return mediaType === "video" || mediaType === "audio" ? `Play ${name}` : `Open ${name}`;
}

export function hasNoPreviewAsset(item: EagleItem) {
  return item.noThumbnail === true || item.noPreview === true;
}
