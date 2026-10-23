export const MEDIA_TYPE_OPTIONS = [
  "jpg",
  "png",
  "gif",
  "webp",
  "svg",
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "m4a",
] as const;

// Rating filter choices, highest first; 0 means "no rating".
export const RATING_OPTIONS = [5, 4, 3, 2, 1, 0] as const;

export const PAGE_SIZE_OPTIONS = [30, 60, 120, 240] as const;
