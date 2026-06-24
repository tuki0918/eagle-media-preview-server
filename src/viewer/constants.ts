export const UNCATEGORIZED_FOLDER_ID = "__uncategorized__";

export const DEFAULT_EAGLE_CONNECTION = Object.freeze({
  host: "127.0.0.1",
  port: "41595",
  token: "",
});

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_VIEW_MODE = "tiles";
export const TILE_PREFETCH_PAGES = 3;
export const LIBRARY_EMPTY_LABEL = "No library";
export const EAGLE_UNAVAILABLE_LABEL = "Eagle unavailable";
export const DATE_KEYS_MODIFIED = Object.freeze(["modifiedAt", "modificationTime", "mtime", "lastModified"]);
export const RECENT_TAGS_STORAGE_KEY = "eagleRecentTags";
export const RECENT_FOLDERS_STORAGE_KEY = "eagleRecentFolders";
export const RECENT_METADATA_LIMIT = 10;
export const SIDEBAR_OPEN_STORAGE_KEY = "eagleSidebarOpen";
export const TAG_EXPLORER_PINNED_STORAGE_KEY = "eaglePinnedTags";

export const playableVideoExts = new Set(["mp4", "webm", "mov", "m4v"]);
export const playableAudioExts = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);
export const textPreviewExts = new Set([
  "txt", "md", "js", "css", "html", "json", "xml", "csv", "log",
  "ts", "tsx", "jsx", "mjs", "cjs", "yml", "yaml",
]);
export const pdfPreviewExts = new Set(["pdf"]);
export const urlPreviewExts = new Set(["url"]);
export const videoExts = new Set([...playableVideoExts, "avi", "mkv"]);
export const audioExts = new Set([...playableAudioExts, "flac", "wma"]);
export const IMAGE_FIT_MARGIN = 0.96;

export const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
