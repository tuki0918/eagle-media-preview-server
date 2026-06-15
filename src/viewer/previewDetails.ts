import { DATE_KEYS_MODIFIED } from "./constants";
import {
  formatBytes,
  formatDuration,
  formatItemDate,
  isTimedMedia,
  mediaTypeLabel,
} from "./format";
import type { EagleItem } from "./types";

export interface PreviewDetailRow {
  label: string;
  value: string;
  chips?: boolean;
}

export function previewDetailRows(item: EagleItem): PreviewDetailRow[] {
  const detailRows: PreviewDetailRow[] = [
    { label: "Type", value: mediaTypeLabel(item) },
    { label: "Size", value: formatBytes(item.size) },
    { label: "Dimensions", value: item.width && item.height ? `${item.width} x ${item.height}` : "" },
    { label: "Duration", value: isTimedMedia(item) ? formatDuration(item.duration) : "" },
    { label: "ID", value: String(item.id || "") },
    { label: "Date Modified", value: formatItemDate(item, DATE_KEYS_MODIFIED) || "-" },
  ];
  return detailRows.filter(({ value, chips }) => chips ? value.length > 0 : Boolean(value));
}
