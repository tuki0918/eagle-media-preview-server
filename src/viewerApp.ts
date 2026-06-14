import {
  DEFAULT_EAGLE_CONNECTION,
  DEFAULT_VIEW_MODE,
  EAGLE_UNAVAILABLE_LABEL,
  LIBRARY_EMPTY_LABEL,
  RECENT_FOLDERS_STORAGE_KEY,
  RECENT_TAGS_STORAGE_KEY,
  UNCATEGORIZED_FOLDER_ID,
  pdfPreviewExts,
  playableAudioExts,
  playableVideoExts,
  textPreviewExts,
} from "./viewer/constants";
import { debounce, getJson, mediaUrl, postJson } from "./viewer/api";
import {
  directFileLink,
  extensionPill,
  previewChipList,
  tableCell,
} from "./viewer/dom";
import { getViewerElements } from "./viewer/elements";
import {
  flattenFolders,
  folderIds,
  formatBytes,
  formatDate,
  formatDateShort,
  formatDimensions,
  formatDuration,
  formatDurationCell,
  itemMeta,
  itemTags,
  normalizeTag,
  originalFileName,
  previewFileName,
  isTimedMedia,
} from "./viewer/format";
import { iconNode, renderLucideIcons, type IconName } from "./viewer/icons";
import {
  folderLabel,
  folderSuggestionItems as buildFolderSuggestionItems,
  type MetadataSuggestion,
  type RemoteTag,
  readRecentList,
  rememberRecentValues,
  tagSuggestionItems as buildTagSuggestionItems,
} from "./viewer/metadata";
import {
  metadataChipPicker,
  previewEditActions,
  previewEditField,
} from "./viewer/metadataEditor";
import {
  currentFetchLimit as getCurrentFetchLimit,
  pageButtonList,
  totalPages,
} from "./viewer/pagination";
import {
  dragPreviewTransform,
  initialPreviewScales,
  minimumPreviewScale as getMinimumPreviewScale,
  nextPreviewScales,
  nextZoomScale,
  pointerDistance as getPointerDistance,
  setPreviewZoom,
} from "./viewer/previewTransform";
import { previewDetailRows } from "./viewer/previewDetails";
import { renderRating } from "./viewer/rating";
import { state } from "./viewer/state";
import type { EagleFolder, EagleItem, PreviewPoint, ViewerMode } from "./viewer/types";
import { buildViewerUrl, currentPage, parseViewerUrlState } from "./viewer/urlState";

const els = getViewerElements();

interface PreviewTouchSession {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  moved: boolean;
}

interface ConnectResponse {
  library?: {
    name?: string;
  };
  app?: {
    version?: string;
  };
}

interface LoadFoldersResponse {
  items?: EagleFolder[];
}

interface LoadItemsResponse {
  items?: EagleItem[];
  total?: number;
}

interface TagSuggestionApiItem {
  name?: string;
  count?: number;
}

interface LoadItemsOptions {
  append?: boolean;
}

interface OpenPreviewOptions {
  skipHistory?: boolean;
}

interface RenderImagePreviewOptions {
  srcKind?: string;
}

interface PopulateThumbOptions {
  img: HTMLImageElement;
  badge: HTMLElement | null;
  duration: HTMLElement | null;
  item: EagleItem;
}

interface SavePreviewMetadataOptions {
  tags: string[];
  folders: string[];
  saveButton: HTMLButtonElement;
  status: HTMLElement;
}

type ItemPatch = Partial<EagleItem>;

export function initViewer() {
  init();
}

async function init() {
  renderLucideIcons();
  restoreUrlState();
  restoreViewMode();
  els.connectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    connect();
  });
  window.addEventListener("popstate", () => {
    restoreUrlState();
    applyControlsFromState();
    if (els.viewerShell.hidden) return;
    loadItems();
  });
  window.addEventListener("resize", () => refreshPreviewImageLayout());
  els.toggleFiltersButton.addEventListener("click", () => {
    state.filtersOpen = !state.filtersOpen;
    syncAdvancedFiltersUi();
    syncUrlState();
  });
  els.resetFiltersButton.addEventListener("click", resetFilters);
  els.prevButton.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - state.limit);
    resetPreviewState();
    syncUrlState();
    loadItems();
  });
  els.nextButton.addEventListener("click", () => {
    state.offset += state.limit;
    resetPreviewState();
    syncUrlState();
    loadItems();
  });
  els.searchInput.addEventListener("input", debounce(() => {
    applyFilterChange({ query: els.searchInput.value.trim() });
    loadTagSuggestions();
  }, 220));
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTagSuggestions();
    }
  });
  els.searchInput.addEventListener("focus", () => {
    if (els.searchInput.value.trim()) loadTagSuggestions();
  });
  document.addEventListener("pointerdown", (event) => {
    if ((event.target as Element | null)?.closest(".search-box")) return;
    hideTagSuggestions();
  });
  els.folderSelect.addEventListener("change", () => {
    applyFilterChange({ folderId: els.folderSelect.value });
  });
  els.extSelect.addEventListener("change", () => {
    applyFilterChange({ ext: els.extSelect.value });
  });
  els.ratingSelect.addEventListener("change", () => {
    applyFilterChange({ rating: els.ratingSelect.value });
  });
  els.pageSizeSelect.addEventListener("change", () => {
    applyFilterChange({ limit: Number(els.pageSizeSelect.value) });
  });
  els.gridViewButton.addEventListener("click", () => setViewMode("grid"));
  els.tilesViewButton.addEventListener("click", () => setViewMode("tiles"));
  els.tableViewButton.addEventListener("click", () => setViewMode("table"));
  els.closePreview.addEventListener("click", () => closePreview());
  els.backPreview.addEventListener("click", () => closePreview());
  els.toggleInfoPreview.addEventListener("click", () => togglePreviewInfo());
  els.fullscreenPreview.addEventListener("click", () => toggleFullscreen());
  els.dialog.addEventListener("pointerdown", closePreviewInfoFromOutside);
  els.dialog.addEventListener("close", () => {
    clearPreviewContents();
    document.body.classList.remove("modal-open");
  });
  els.dialog.addEventListener("dblclick", (event) => {
    if ((event.target as Element | null)?.closest("button")) {
      event.preventDefault();
    }
  });
  for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
    els.dialog.addEventListener(eventName, (event) => {
      if (els.dialog.open) {
        event.preventDefault();
      }
    });
  }
  showLogin();
}

async function connect() {
  setConnectMessage("Connecting", false);
  els.connectButton.disabled = true;

  try {
    const connection = { ...DEFAULT_EAGLE_CONNECTION };
    const data = await postJson<ConnectResponse>("/api/connect", connection);
    showViewer(data);
    await Promise.all([loadFolders(), loadItems()]);
  } catch (error) {
    showLogin();
    setConnectMessage(error.message, true);
  } finally {
    els.connectButton.disabled = false;
  }
}

function showLogin() {
  els.loginView.hidden = false;
  els.viewerShell.hidden = true;
}

function showViewer(data: ConnectResponse) {
  els.loginView.hidden = true;
  els.viewerShell.hidden = false;
  els.libraryFooterName.textContent = libraryLabel(data);
  els.folderSelect.replaceChildren(
    optionNode("", "All folders"),
    optionNode(UNCATEGORIZED_FOLDER_ID, "Uncategorized"),
  );
  state.total = 0;
  state.items = [];
  applyControlsFromState();
  updateStatus();
  updatePager();
}

function setConnectMessage(message: string, isError: boolean) {
  els.connectMessage.textContent = message;
  els.connectMessage.classList.toggle("error-text", isError);
}

function libraryLabel(data: ConnectResponse) {
  const name = data.library?.name || LIBRARY_EMPTY_LABEL;
  const version = data.app?.version ? `Eagle ${data.app.version}` : EAGLE_UNAVAILABLE_LABEL;
  return `${name} - ${version}`;
}

function optionNode(value: string, text: string) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

async function loadFolders() {
  try {
    const data = await getJson<LoadFoldersResponse>("/api/folders");
    state.folders = flattenFolders(data.items);
    const fragment = document.createDocumentFragment();
    for (const folder of state.folders) {
      fragment.append(optionNode(
        folder.id,
        `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name} (${folder.imageCount ?? 0})`,
      ));
    }
    els.folderSelect.append(fragment);
    els.folderSelect.value = state.folderId;
  } catch {
    state.folders = [];
    // Folder loading is optional; item browsing still works without it.
  }
}

async function loadItems({ append = false }: LoadItemsOptions = {}) {
  const requestId = ++state.requestId;
  if (append) {
    state.tilesLoadingMore = true;
    els.tilesSentinel.textContent = "Loading more";
  } else {
    resetTileAutoLoading();
    state.tilesLoadingMore = false;
    state.items = [];
    els.grid.replaceChildren(messageNode("Loading"));
  }
  updatePager();

  const params = new URLSearchParams({
    offset: String(state.offset),
    limit: String(currentFetchLimit()),
  });
  if (state.query) params.set("q", state.query);
  for (const tag of state.tags) params.append("tags", tag);
  if (state.folderId) params.set("folderId", state.folderId);
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);

  try {
    const data = await getJson<LoadItemsResponse>(`/api/items?${params.toString()}`);
    if (requestId !== state.requestId) return;
    const items = data.items || [];
    state.total = Number(data.total || 0);
    state.items = append ? [...state.items, ...items] : items;
    state.tilesLoadingMore = false;
    if (append) {
      appendRenderedItems(items);
    } else {
      render();
      if (state.viewMode === "tiles" && new URLSearchParams(window.location.search).has("page")) {
        syncUrlState({ replace: true });
      }
    }
    syncPreviewFromState();
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.tilesLoadingMore = false;
    if (append) {
      els.tilesSentinel.textContent = error.message;
      updatePager();
      return;
    }
    state.items = [];
    state.total = 0;
    els.grid.replaceChildren(messageNode(error.message, "error"));
    updateStatus();
    updatePager();
    setupTileAutoLoading();
  }
}

function render() {
  const fragment = document.createDocumentFragment();
  els.grid.classList.toggle("media-table", state.viewMode === "table");
  els.grid.classList.toggle("media-grid", state.viewMode === "grid");
  els.grid.classList.toggle("media-tiles", state.viewMode === "tiles");
  els.grid.classList.toggle("is-empty", !state.items.length);

  if (state.viewMode === "table" && state.items.length) {
    fragment.append(tableHeader());
  }
  for (const item of state.items) {
    fragment.append(resultItemNode(item));
  }

  if (!state.items.length) {
    fragment.append(emptyStateNode());
  }

  els.grid.replaceChildren(fragment);
  updateStatus();
  updatePager();
  setupTileAutoLoading();
  updateViewToggle();
}

function resultItemNode(item: EagleItem) {
  return state.viewMode === "table" ? tableRow(item) : state.viewMode === "tiles" ? tileItem(item) : gridCard(item);
}

function appendRenderedItems(items: readonly EagleItem[]) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    fragment.append(resultItemNode(item));
  }
  els.grid.append(fragment);
  updateStatus();
  updatePager();
  setupTileAutoLoading();
  updateViewToggle();
}

function bindPreviewTrigger(element: HTMLElement, item: EagleItem) {
  let lastTriggerAt = 0;
  let touchSession: PreviewTouchSession | null = null;
  const TAP_MOVE_THRESHOLD = 10;
  const TAP_HOLD_THRESHOLD_MS = 300;

  const openFromPointer = (event?: PointerEvent | MouseEvent) => {
    if (Date.now() - lastTriggerAt < 700) return;
    if (event?.type === "touchend") {
      event.preventDefault();
    }
    lastTriggerAt = Date.now();
    openPreview(item);
  };

  element.addEventListener("click", (event) => {
    if (Date.now() - lastTriggerAt < 700) {
      event.preventDefault();
      return;
    }
    openPreview(item);
  });

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    touchSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      moved: false,
    };
  });

  element.addEventListener("pointermove", (event) => {
    if (!touchSession || touchSession.pointerId !== event.pointerId) return;
    const deltaX = Math.abs(event.clientX - touchSession.startX);
    const deltaY = Math.abs(event.clientY - touchSession.startY);
    if (deltaX > TAP_MOVE_THRESHOLD || deltaY > TAP_MOVE_THRESHOLD) {
      touchSession.moved = true;
    }
  });

  element.addEventListener("pointercancel", () => {
    touchSession = null;
  });

  element.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    if (!touchSession || touchSession.pointerId !== event.pointerId) return;
    const heldFor = Date.now() - touchSession.startedAt;
    const shouldOpen = !touchSession.moved && heldFor <= TAP_HOLD_THRESHOLD_MS;
    touchSession = null;
    if (shouldOpen) {
      openFromPointer(event);
    }
  });
}

function gridCard(item: EagleItem) {
  const templateNode = els.template.content.firstElementChild;
  if (!templateNode) throw new Error("Missing media card template content");
  const node = templateNode.cloneNode(true) as HTMLElement;
  const img = requiredChild<HTMLImageElement>(node, "img");
  const button = requiredChild<HTMLButtonElement>(node, "button");
  const badge = requiredChild<HTMLElement>(node, ".file-badge");
  const duration = requiredChild<HTMLElement>(node, ".duration-badge");
  const overlayIcon = requiredChild<HTMLElement>(node, ".thumb-overlay-icon");
  const title = requiredChild<HTMLElement>(node, "strong");
  const metaLine = requiredChild<HTMLElement>(node, ".card-meta span");
  const rating = requiredChild<HTMLElement>(node, ".rating-control");

  populateThumb({ img, badge, duration, item });
  decorateThumbButton(button, overlayIcon, item);
  title.textContent = item.name || item.id || "";
  title.title = originalFileName(item);
  metaLine.hidden = true;
  renderRating(rating, item, { interactive: false });
  button.append(rating);
  bindPreviewTrigger(button, item);
  return node;
}

function requiredChild<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing template element: ${selector}`);
  return element;
}

function tileItem(item: EagleItem) {
  const button = document.createElement("button");
  button.className = "tile-item";
  button.type = "button";
  const img = document.createElement("img");
  const overlay = document.createElement("span");
  overlay.className = "thumb-overlay";
  overlay.setAttribute("aria-hidden", "true");
  const overlayIcon = document.createElement("span");
  overlayIcon.className = "thumb-overlay-icon";
  overlay.append(overlayIcon);
  const badge = document.createElement("span");
  badge.className = "file-badge";
  const duration = document.createElement("span");
  duration.className = "duration-badge";
  const rating = document.createElement("div");
  rating.className = "rating-control tile-rating";
  rating.ariaLabel = "Rating";
  const width = Number(item.width);
  const height = Number(item.height);
  button.style.aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
  renderRating(rating, item, { interactive: false });
  button.append(img, overlay, badge, duration, rating);
  populateThumb({ img, badge, duration, item });
  decorateThumbButton(button, overlayIcon, item);
  bindPreviewTrigger(button, item);
  return button;
}

function tableHeader() {
  const header = document.createElement("div");
  header.className = "media-row media-row-header";
  header.innerHTML = `
    <span>Item</span>
    <span>Name</span>
    <span>Type</span>
    <span>Size</span>
    <span>Dimensions</span>
    <span>Duration</span>
    <span>Modified</span>
  `;
  return header;
}

function tableRow(item: EagleItem) {
  const row = document.createElement("article");
  row.className = "media-row";
  const thumb = document.createElement("button");
  thumb.className = "row-thumb";
  thumb.type = "button";
  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  thumb.append(img);

  populateThumb({ img, badge: null, duration: null, item });
  decorateThumbButton(thumb, null, item);
  bindPreviewTrigger(thumb, item);
  row.append(
    thumb,
    tableNameCell(item),
    extensionPill(item),
    tableCell(formatBytes(item.size) || "-"),
    tableCell(formatDimensions(item) || "-", "dimensions-cell"),
    tableCell(formatDurationCell(item) || "-", "duration-cell"),
    tableCell(formatDateShort(item.modificationTime) || "-", "modified-cell", formatDate(item.modificationTime) || ""),
  );
  return row;
}

function tableNameCell(item: EagleItem) {
  const cell = document.createElement("span");
  cell.className = "row-name-cell";
  const name = document.createElement("span");
  name.className = "row-file-name";
  name.textContent = item.name || item.id || "";
  name.title = originalFileName(item);
  const meta = document.createElement("span");
  meta.className = "table-mobile-meta";
  meta.textContent = [
    ((item.ext || "").toUpperCase() || "FILE"),
    formatBytes(item.size),
  ].filter(Boolean).join(" · ");
  const rating = document.createElement("div");
  rating.className = "rating-control";
  rating.ariaLabel = "Rating";
  renderRating(rating, item, { interactive: false });
  cell.append(name, meta, rating);
  return cell;
}

function populateThumb({ img, badge, duration, item }: PopulateThumbOptions) {
  const button = img.closest("button");
  button?.classList.add("thumb-loading");
  img.loading = "lazy";
  img.decoding = "async";
  img.src = mediaUrl(String(item.id || ""), "thumb");
  img.alt = item.name || item.id || "";
  img.onload = () => {
    button?.classList.remove("thumb-loading");
    img.hidden = false;
  };
  img.onerror = () => {
    button?.classList.remove("thumb-loading");
    img.hidden = true;
    button?.classList.add("thumb-missing");
  };
  if (badge) {
    badge.textContent = (item.ext || "").toUpperCase();
    badge.dataset.ext = (item.ext || "file").toLowerCase();
  }
  const formattedDuration = isTimedMedia(item) ? formatDuration(item.duration) : "";
  if (duration) {
    duration.textContent = formattedDuration;
    duration.hidden = !formattedDuration;
  }
}

function decorateThumbButton(button: HTMLElement, overlayIcon: HTMLElement | null, item: EagleItem) {
  const ext = (item.ext || "").toLowerCase();
  const mediaType = playableVideoExts.has(ext)
    ? "video"
    : playableAudioExts.has(ext)
      ? "audio"
      : textPreviewExts.has(ext) || pdfPreviewExts.has(ext)
        ? "document"
        : "image";
  button.dataset.mediaType = mediaType;
  button.setAttribute("aria-label", mediaType === "video" || mediaType === "audio" ? `Play ${item.name || item.id}` : `Open ${item.name || item.id}`);
  if (!overlayIcon) return;
  const icon = mediaType === "video" || mediaType === "audio" ? "play" : "move-diagonal";
  overlayIcon.replaceChildren(iconNode(icon));
}

function openPreview(item: EagleItem, { skipHistory = false }: OpenPreviewOptions = {}) {
  state.previewItemId = String(item.id || "");
  els.previewMeta.textContent = itemMeta(item);
  els.previewOriginalName.textContent = originalFileName(item);
  els.previewOriginalName.title = originalFileName(item);
  els.previewBody.replaceChildren();
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "text-mode", "unsupported-mode", "info-open");
  els.toggleInfoPreview.setAttribute("aria-expanded", state.previewInfoOpen ? "true" : "false");
  renderRating(els.previewRating, item, { interactive: true, onSelect: (star) => setItemStar(item, star) });
  renderPreviewDetails(item);
  if (state.previewInfoOpen) {
    els.dialog.classList.add("info-open");
  }

  const ext = (item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) {
    els.dialog.classList.add("video-mode");
    const video = document.createElement("video");
    video.className = "preview-video";
    video.src = mediaUrl(String(item.id || ""), "file");
    video.controls = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "metadata";
    video.addEventListener("error", () => showPreviewNotice(videoErrorMessage(video.error)));
    els.previewBody.append(video);
    showPreviewDialog();
    if (!skipHistory) syncUrlState();
    video.play().catch(() => {});
    return;
  } else if (playableAudioExts.has(ext)) {
    els.dialog.classList.add("audio-mode");
    const audio = document.createElement("audio");
    audio.src = mediaUrl(String(item.id || ""), "file");
    audio.controls = true;
    audio.preload = "metadata";
    els.previewBody.append(audio);
    showPreviewDialog();
    if (!skipHistory) syncUrlState();
    audio.play().catch(() => {});
    return;
  } else if (textPreviewExts.has(ext)) {
    els.dialog.classList.add("text-mode");
    renderTextPreview(item);
  } else if (pdfPreviewExts.has(ext)) {
    els.dialog.classList.add("image-mode");
    renderImagePreview(item, { srcKind: "thumb" });
  } else if (isTimedMedia(item)) {
    els.dialog.classList.add("unsupported-mode");
    const image = document.createElement("img");
    image.className = "unsupported-thumb";
    image.src = mediaUrl(String(item.id || ""), "thumb");
    image.alt = item.name || item.id || "";
    const notice = document.createElement("p");
    notice.className = "preview-notice";
    notice.textContent = `${(item.ext || "This format").toUpperCase()} is not supported in this browser.`;
    els.previewBody.append(image, notice);
  } else {
    els.dialog.classList.add("image-mode");
    renderImagePreview(item);
  }

  showPreviewDialog();
  if (!skipHistory) syncUrlState();
}

function renderTextPreview(item: EagleItem) {
  const preview = document.createElement("pre");
  preview.className = "text-preview";
  const code = document.createElement("code");
  code.textContent = "Loading...";
  preview.append(code);
  els.previewBody.append(preview);

  (async () => {
    try {
      const response = await fetch(mediaUrl(String(item.id || ""), "file"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      code.textContent = text;
    } catch (error) {
      code.textContent = `Unable to load preview: ${error.message}`;
    }
  })();
}

function renderImagePreview(item: EagleItem, { srcKind = "file" }: RenderImagePreviewOptions = {}) {
  const viewport = document.createElement("div");
  viewport.className = "image-viewport";
  const status = document.createElement("div");
  status.className = "image-status";
  status.hidden = true;
  const image = document.createElement("img");
  image.className = "preview-image";
  image.src = mediaUrl(String(item.id || ""), srcKind);
  image.alt = item.name || item.id || "";
  image.draggable = false;
  viewport.append(image, status);
  els.previewBody.append(viewport, imageToolbar());

  resetPreviewTransform();
  image.addEventListener("load", () => {
    image.style.width = `${image.naturalWidth}px`;
    image.style.height = `${image.naturalHeight}px`;
    updatePreviewScales(image, viewport);
    setImageZoom(state.previewFitScale, { x: 0, y: 0 });
    status.hidden = false;
    updateImageStatus();
  });
  image.addEventListener("error", () => {
    status.hidden = true;
    status.textContent = "";
  });
  viewport.addEventListener("pointerdown", (event) => startImageDrag(event, viewport));
  viewport.addEventListener("pointermove", (event) => moveImageDrag(event));
  viewport.addEventListener("pointerup", (event) => endImageDrag(event));
  viewport.addEventListener("pointercancel", (event) => endImageDrag(event));
  viewport.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomImage(event.deltaY > 0 ? 0.9 : 1.1);
  }, { passive: false });
}

function imageToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "image-toolbar";
  toolbar.append(
    toolbarButton("Zoom out", "minus", () => zoomImage(0.85)),
    toolbarButton("Fit", "maximize", () => setImageZoom(state.previewFitScale, { x: 0, y: 0 })),
    toolbarButton("Actual size", "maximize-2", () => setImageZoom(state.previewNaturalScale, { x: 0, y: 0 })),
    toolbarButton("Zoom in", "plus", () => zoomImage(1.18)),
  );
  return toolbar;
}

function toolbarButton(label: string, icon: IconName, action: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.ariaLabel = label;
  button.append(iconNode(icon));
  button.addEventListener("click", action);
  return button;
}

function resetPreviewTransform() {
  const scales = initialPreviewScales();
  state.previewTransform = scales.transform;
  state.previewFitScale = scales.fitScale;
  state.previewNaturalScale = scales.naturalScale;
  state.previewDrag = null;
  state.previewPointers = new Map();
  state.previewPinch = null;
}

function updatePreviewScales(image: HTMLImageElement, viewport: HTMLElement) {
  const scales = nextPreviewScales({
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight,
    viewportWidth: viewport.clientWidth,
    viewportHeight: viewport.clientHeight,
    previousFitScale: state.previewFitScale,
    previousTransform: state.previewTransform,
  });
  state.previewTransform = scales.transform;
  state.previewFitScale = scales.fitScale;
  state.previewNaturalScale = scales.naturalScale;
}

function zoomImage(multiplier: number) {
  const nextScale = nextZoomScale(
    state.previewTransform.scale,
    multiplier,
    state.previewFitScale,
    state.previewNaturalScale,
  );
  setImageZoom(nextScale);
}

function setImageZoom(scale: number, position: PreviewPoint = state.previewTransform) {
  state.previewTransform = setPreviewZoom(scale, position);
  applyImageTransform();
}

function applyImageTransform() {
  const image = els.previewBody.querySelector<HTMLElement>(".preview-image");
  if (!image) return;
  const { scale, x, y } = state.previewTransform;
  image.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  updateImageStatus();
}

function updateImageStatus() {
  const image = els.previewBody.querySelector<HTMLImageElement>(".preview-image");
  const status = els.previewBody.querySelector(".image-status");
  if (!image || !status || !image.naturalWidth || !image.naturalHeight) return;
  const zoomPercent = Math.round((state.previewTransform.scale / state.previewNaturalScale) * 100);
  status.textContent = `${image.naturalWidth} × ${image.naturalHeight} · ${zoomPercent}%`;
}

function startImageDrag(event: PointerEvent, viewport: HTMLElement) {
  const image = els.previewBody.querySelector<HTMLImageElement>(".preview-image");
  if (!image) return;
  if (event.pointerType === "touch") {
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.previewPointers.size === 2) {
      state.previewPinch = {
        distance: pointerDistance(),
        scale: state.previewTransform.scale,
      };
      state.previewDrag = null;
      return;
    }
    if (state.previewPointers.size > 1) {
      return;
    }
  }
  viewport.setPointerCapture(event.pointerId);
  state.previewDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: state.previewTransform.x,
    originY: state.previewTransform.y,
  };
}

function moveImageDrag(event: PointerEvent) {
  if (event.pointerType === "touch" && state.previewPointers.has(event.pointerId)) {
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.previewPointers.size === 2 && state.previewPinch) {
      const distance = pointerDistance();
      if (distance > 0 && state.previewPinch.distance > 0) {
        const nextScale = nextZoomScale(
          state.previewPinch.scale * (distance / state.previewPinch.distance),
          1,
          state.previewFitScale,
          state.previewNaturalScale,
        );
        setImageZoom(nextScale);
      }
      return;
    }
  }
  const drag = state.previewDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.previewTransform = dragPreviewTransform(state.previewTransform, drag, {
    x: event.clientX,
    y: event.clientY,
  });
  applyImageTransform();
}

function endImageDrag(event?: PointerEvent) {
  if (event?.pointerType === "touch") {
    state.previewPointers.delete(event.pointerId);
    if (state.previewPointers.size < 2) {
      state.previewPinch = null;
    }
  }
  if (!event || !state.previewDrag || state.previewDrag.pointerId === event.pointerId) {
    state.previewDrag = null;
  }
}

function showPreviewNotice(message: string) {
  const notice = document.createElement("p");
  notice.className = "preview-notice";
  notice.textContent = message;
  els.previewBody.append(notice);
}

function minimumPreviewScale() {
  return getMinimumPreviewScale(state.previewFitScale, state.previewNaturalScale);
}

function refreshPreviewImageLayout() {
  const image = els.previewBody.querySelector<HTMLImageElement>(".preview-image");
  const viewport = els.previewBody.querySelector<HTMLElement>(".image-viewport");
  if (!image || !viewport || !image.naturalWidth || !image.naturalHeight) return;
  updatePreviewScales(image, viewport);
  applyImageTransform();
}

function videoErrorMessage(error: MediaError | null) {
  if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "This video could not be played on this device. iPhone requires Safari-compatible video such as H.264 video with AAC audio.";
  }
  return "This video could not be played on this device.";
}

function setViewMode(mode: string) {
  if (!isViewerMode(mode)) return;
  if (state.viewMode === mode) return;
  const previousMode = state.viewMode;
  state.viewMode = mode;
  localStorage.setItem("eagleViewMode", mode);
  if (mode === "tiles" || previousMode === "tiles") {
    state.offset = 0;
    resetPreviewState();
    syncUrlState();
    loadItems();
    return;
  }
  syncUrlState();
  render();
}

function updateViewToggle() {
  els.gridViewButton.setAttribute("aria-pressed", state.viewMode === "grid" ? "true" : "false");
  els.tilesViewButton.setAttribute("aria-pressed", state.viewMode === "tiles" ? "true" : "false");
  els.tableViewButton.setAttribute("aria-pressed", state.viewMode === "table" ? "true" : "false");
}

function restoreViewMode() {
  if (new URLSearchParams(window.location.search).has("view")) {
    updateViewToggle();
    return;
  }
  const saved = localStorage.getItem("eagleViewMode");
  state.viewMode = saved && isViewerMode(saved) ? saved : DEFAULT_VIEW_MODE;
  updateViewToggle();
}

function isViewerMode(value: string): value is ViewerMode {
  return value === "grid" || value === "tiles" || value === "table";
}

function closePreview({ skipHistory = false }: OpenPreviewOptions = {}) {
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "unsupported-mode", "info-open");
  els.toggleInfoPreview.setAttribute("aria-expanded", "false");
  state.previewItemId = "";
  state.previewInfoOpen = false;
  document.body.classList.remove("modal-open");
  if (typeof els.dialog.close === "function" && els.dialog.open) {
    els.dialog.close();
    if (!skipHistory) syncUrlState();
    return;
  }
  els.dialog.removeAttribute("open");
  clearPreviewContents();
  if (!skipHistory) syncUrlState();
}

function togglePreviewInfo() {
  setPreviewInfoOpen(!state.previewInfoOpen);
}

function closePreviewInfoFromOutside(event: PointerEvent) {
  if (!state.previewInfoOpen) return;
  if ((event.target as Element | null)?.closest(".preview-info, #toggleInfoPreview")) return;
  setPreviewInfoOpen(false);
}

function setPreviewInfoOpen(isOpen: boolean) {
  els.dialog.classList.toggle("info-open", isOpen);
  els.toggleInfoPreview.setAttribute("aria-expanded", isOpen ? "true" : "false");
  state.previewInfoOpen = isOpen;
  syncUrlState();
}

async function toggleFullscreen() {
  const target = els.previewBody.firstElementChild || els.previewBody;
  const videoTarget = target instanceof HTMLVideoElement
    ? target as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
    : null;
  try {
    if (videoTarget?.webkitEnterFullscreen && !document.fullscreenEnabled) {
      videoTarget.webkitEnterFullscreen();
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (target.requestFullscreen) {
      await target.requestFullscreen();
      return;
    }
    if (videoTarget?.webkitEnterFullscreen) {
      videoTarget.webkitEnterFullscreen();
    }
  } catch (error) {
    console.warn("Fullscreen is unavailable in this browser.", error);
  }
}

function showPreviewDialog() {
  document.body.classList.add("modal-open");
  if (typeof els.dialog.showModal === "function") {
    try {
      if (!els.dialog.open) {
        els.dialog.showModal();
      }
      return;
    } catch {
      // Safari fallback below.
    }
  }
  els.dialog.setAttribute("open", "");
}

function restoreUrlState() {
  state.restoringHistory = true;
  try {
    Object.assign(state, parseViewerUrlState(window.location.search));
  } finally {
    state.restoringHistory = false;
  }
}

function applyControlsFromState() {
  els.searchInput.value = state.query;
  renderTagChips();
  els.folderSelect.value = state.folderId;
  els.extSelect.value = state.ext;
  els.ratingSelect.value = state.rating;
  els.pageSizeSelect.value = String(state.limit);
  syncAdvancedFiltersUi();
  syncResetFiltersButton();
  updateViewToggle();
}

function applyFilterChange(patch: Partial<Pick<typeof state, "query" | "tags" | "folderId" | "ext" | "rating" | "limit">>) {
  Object.assign(state, patch, { offset: 0 });
  resetPreviewState();
  syncResetFiltersButton();
  syncUrlState();
  loadItems();
}

function syncUrlState({ replace = false }: { replace?: boolean } = {}) {
  if (state.restoringHistory) return;
  const nextUrl = buildViewerUrl(window.location.pathname, state);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", nextUrl);
}

function addTagFilter(value: unknown) {
  const tag = normalizeTag(value);
  if (!tag || state.tags.includes(tag)) {
    els.searchInput.value = "";
    hideTagSuggestions();
    return;
  }
  applyFilterChange({ query: "", tags: [...state.tags, tag] });
  els.searchInput.value = "";
  renderTagChips();
  hideTagSuggestions();
}

function removeTagFilter(tag: string) {
  applyFilterChange({ tags: state.tags.filter((entry) => entry !== tag) });
  renderTagChips();
}

function renderTagChips() {
  const fragment = document.createDocumentFragment();
  for (const tag of state.tags) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";

    const label = document.createElement("span");
    label.textContent = tag;

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Remove tag ${tag}`);
    button.title = `Remove tag ${tag}`;
    button.append(iconNode("x"));
    button.addEventListener("click", () => removeTagFilter(tag));

    chip.append(label, button);
    fragment.append(chip);
  }
  els.tagChips.replaceChildren(fragment);
  syncResetFiltersButton();
}

async function loadTagSuggestions() {
  const query = els.searchInput.value.trim();
  const requestId = ++state.tagSuggestionsRequestId;
  if (!query) {
    hideTagSuggestions();
    return;
  }

  const params = new URLSearchParams({ q: query, limit: "20" });
  try {
    const data = await getJson<{ items?: TagSuggestionApiItem[] }>(`/api/tags?${params.toString()}`);
    if (requestId !== state.tagSuggestionsRequestId) return;
    const items = Array.isArray(data.items) ? data.items : [];
    renderTagSuggestions(items.filter((item) => item?.name && !state.tags.includes(item.name)));
  } catch {
    if (requestId === state.tagSuggestionsRequestId) hideTagSuggestions();
  }
}

function renderTagSuggestions(items: readonly TagSuggestionApiItem[]) {
  if (!items.length) {
    hideTagSuggestions();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-suggestion";
    button.setAttribute("role", "option");
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      addTagFilter(item.name);
    });

    const name = document.createElement("span");
    name.textContent = item.name || "";
    button.append(name);

    if (Number.isFinite(item.count)) {
      const count = document.createElement("span");
      count.className = "tag-suggestion-count";
      count.textContent = Number(item.count).toLocaleString();
      button.append(count);
    }

    fragment.append(button);
  }

  els.tagSuggestions.replaceChildren(fragment);
  els.tagSuggestions.hidden = false;
}

function hideTagSuggestions() {
  state.tagSuggestionsRequestId += 1;
  els.tagSuggestions.hidden = true;
  els.tagSuggestions.replaceChildren();
}

function syncAdvancedFiltersUi() {
  const label = state.filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  els.advancedFilters.hidden = !state.filtersOpen;
  els.toggleFiltersButton.setAttribute("aria-expanded", String(state.filtersOpen));
  els.toggleFiltersButton.setAttribute("aria-label", label);
  els.toggleFiltersButton.title = label;
}

function syncResetFiltersButton() {
  els.resetFiltersButton.disabled = !hasActiveFilters();
}

function resetPreviewState() {
  if (!state.previewItemId && !state.previewInfoOpen) return;
  state.previewItemId = "";
  state.previewInfoOpen = false;
  if (els.dialog.open) {
    closePreview({ skipHistory: true });
  }
}

function syncPreviewFromState() {
  if (!state.previewItemId) {
    if (els.dialog.open) closePreview({ skipHistory: true });
    return;
  }
  const item = state.items.find((entry) => entry.id === state.previewItemId);
  if (!item) {
    if (els.dialog.open) closePreview({ skipHistory: true });
    return;
  }
  openPreview(item, { skipHistory: true });
}

function clearPreviewContents() {
  els.previewBody.replaceChildren();
  els.previewOriginalName.textContent = "";
  els.previewOriginalName.removeAttribute("title");
  els.previewRating.replaceChildren();
  els.previewDetails.replaceChildren();
  els.previewActions.replaceChildren();
  resetPreviewTransform();
}

function pointerDistance() {
  return getPointerDistance(state.previewPointers.values());
}

async function setItemStar(item: EagleItem, star: number) {
  const previous = Number(item.star || 0);
  item.star = star;
  updateItemInState(String(item.id || ""), { star });
  render();
  if (els.dialog.open) {
    renderRating(els.previewRating, item, { interactive: true, onSelect: (nextStar) => setItemStar(item, nextStar) });
  }

  try {
    const data = await postJson<{ star?: unknown }>(`/api/items/${encodeURIComponent(String(item.id || ""))}/star`, { star });
    const savedStar = Number(data.star ?? star);
    item.star = savedStar;
    updateItemInState(String(item.id || ""), { star: savedStar });
  } catch (error) {
    item.star = previous;
    updateItemInState(String(item.id || ""), { star: previous });
    alert(error.message);
  } finally {
    render();
    if (els.dialog.open) {
      renderRating(els.previewRating, item, { interactive: true, onSelect: (nextStar) => setItemStar(item, nextStar) });
    }
  }
}

function updateItemInState(id: string, patch: ItemPatch) {
  const target = state.items.find((item) => item.id === id);
  if (target) Object.assign(target, patch);
}

function updateStatus() {
  els.resultCount.textContent = `${state.total.toLocaleString()} items`;
}

function updatePager() {
  const isTiles = state.viewMode === "tiles";
  els.pager.hidden = isTiles;
  els.tilesSentinel.hidden = !isTiles || !state.items.length || state.items.length >= state.total;
  if (isTiles) {
    els.tilesSentinel.textContent = state.tilesLoadingMore ? "Loading more" : "Scroll to load more";
    return;
  }
  els.prevButton.disabled = state.offset <= 0;
  els.nextButton.disabled = state.offset + state.limit >= state.total;
  renderPageButtons();
}

function setupTileAutoLoading() {
  resetTileAutoLoading();
  if (state.viewMode !== "tiles" || !state.items.length || state.items.length >= state.total || typeof IntersectionObserver === "undefined") return;
  state.tilesObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    loadMoreTiles();
  }, { rootMargin: "600px 0px" });
  state.tilesObserver.observe(els.tilesSentinel);
}

function resetTileAutoLoading() {
  if (state.tilesObserver) {
    state.tilesObserver.disconnect();
    state.tilesObserver = null;
  }
}

function loadMoreTiles() {
  if (state.viewMode !== "tiles" || state.tilesLoadingMore || !state.items.length || state.items.length >= state.total) return;
  state.offset = state.items.length;
  syncUrlState({ replace: true });
  loadItems({ append: true });
}

function currentFetchLimit() {
  return getCurrentFetchLimit({
    viewMode: state.viewMode,
    tags: state.tags,
    limit: state.limit,
  });
}

function renderPageButtons() {
  const current = currentPage(state);
  const pages = pageButtonList(current, totalPages(state.total, state.limit));
  const fragment = document.createDocumentFragment();

  for (const page of pages) {
    if (page === "...") {
      const spacer = document.createElement("span");
      spacer.textContent = "...";
      spacer.className = "page-ellipsis";
      fragment.append(spacer);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(page);
    button.dataset.active = page === current ? "true" : "false";
    button.addEventListener("click", () => {
      state.offset = (page - 1) * state.limit;
      loadItems();
    });
    fragment.append(button);
  }

  els.pageButtons.replaceChildren(fragment);
}

function renderPreviewDetails(item: EagleItem) {
  const detailsSection = document.createElement("section");
  detailsSection.className = "preview-details-section";

  for (const { label, value, chips = false } of previewDetailRows(item)) {
    const row = document.createElement("div");
    row.className = "preview-detail-row";

    const labelNode = document.createElement("span");
    labelNode.className = "preview-detail-label";
    labelNode.textContent = label;

    const valueNode = document.createElement("div");
    valueNode.className = "preview-detail-value";
    if (chips && value.length > 0) {
      const chipList = previewChipList(value);
      valueNode.append(chipList);
    } else {
      valueNode.textContent = chips ? "-" : value;
    }

    row.append(labelNode, valueNode);
    detailsSection.append(row);
  }

  detailsSection.append(previewMetadataEditor(item));

  const link = directFileLink(item);
  link.classList.add("preview-info-cta");
  link.prepend(iconNode("external-link"));

  els.previewDetails.replaceChildren(detailsSection);
  els.previewActions.replaceChildren(link);
}

function previewMetadataEditor(item: EagleItem) {
  const form = document.createElement("form");
  form.className = "preview-edit-form";

  const tagPicker = metadataChipPicker({
    kind: "tag",
    initialValues: itemTags(item),
    placeholder: "Add tag",
    inputLabel: "Add tag",
    labelForValue: (value) => value,
    getSuggestions: tagSuggestionItems,
    normalizeValue: normalizeTag,
  });
  const categoryPicker = metadataChipPicker({
    kind: "category",
    initialValues: folderIds(item.folders),
    placeholder: "Add category",
    inputLabel: "Add category",
    labelForValue: (value) => folderLabel(value, state.folders),
    getSuggestions: folderSuggestionItems,
    normalizeValue: (value) => String(value || "").trim(),
  });

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "text-button preview-edit-save";
  saveButton.textContent = "Save";

  const status = document.createElement("span");
  status.className = "preview-edit-status";
  status.setAttribute("role", "status");

  form.append(
    previewEditField("Tags", tagPicker.element),
    previewEditField("Categories", categoryPicker.element),
    previewEditActions(saveButton, status),
  );
  const submitMetadata = (event: Event) => {
    event.preventDefault();
    savePreviewMetadata(item, {
      tags: tagPicker.values(),
      folders: categoryPicker.values(),
      saveButton,
      status,
    });
  };
  form.addEventListener("submit", submitMetadata);
  saveButton.addEventListener("click", submitMetadata);
  return form;
}

async function savePreviewMetadata(item: EagleItem, { tags, folders, saveButton, status }: SavePreviewMetadataOptions) {
  saveButton.disabled = true;
  status.textContent = "Saving";
  try {
    const data = await postJson<{
      tags?: unknown;
      folders?: unknown;
    }>(`/api/items/${encodeURIComponent(String(item.id || ""))}/metadata`, { tags, folders });
    const patch = {
      tags: Array.isArray(data.tags) ? data.tags : tags,
      folders: Array.isArray(data.folders) ? data.folders : folders,
    };
    rememberRecentValues(RECENT_TAGS_STORAGE_KEY, patch.tags);
    rememberRecentValues(RECENT_FOLDERS_STORAGE_KEY, patch.folders);
    Object.assign(item, patch);
    updateItemInState(String(item.id || ""), patch);
    render();
    if (status.isConnected) status.textContent = "Saved";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
}

function tagSuggestionItems(query: string, selectedValues: string[]): Promise<MetadataSuggestion[]> | MetadataSuggestion[] {
  const recentTags = readRecentList(RECENT_TAGS_STORAGE_KEY);
  if (!query) {
    return buildTagSuggestionItems({ query, selectedValues, recentTags });
  }
  const params = new URLSearchParams({ q: query, limit: "20" });
  return getJson<{ items?: RemoteTag[] }>(`/api/tags?${params.toString()}`)
    .then((data: { items?: RemoteTag[] }) => {
      const remote = Array.isArray(data.items) ? data.items : [];
      return buildTagSuggestionItems({ query, selectedValues, recentTags, remoteTags: remote });
    })
    .catch(() => buildTagSuggestionItems({ query, selectedValues, recentTags }));
}

function folderSuggestionItems(query: string, selectedValues: string[]) {
  return buildFolderSuggestionItems({
    query,
    selectedValues,
    recentFolderIds: readRecentList(RECENT_FOLDERS_STORAGE_KEY),
    folders: state.folders,
  });
}

function messageNode(text: string, className = "empty") {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}

function emptyStateNode() {
  const node = document.createElement("section");
  node.className = "empty-state";

  const title = document.createElement("strong");
  title.textContent = hasActiveFilters() ? "No items matched these filters" : "No items found";

  const description = document.createElement("p");
  description.textContent = hasActiveFilters()
    ? "Try changing the search text, folder, extension, or rating to widen the results."
    : "This page has no items yet. Refresh or change the current view to load another range.";

  node.append(title, description);

  if (hasActiveFilters()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "text-button empty-state-button";
    button.textContent = "Clear filters";
    button.addEventListener("click", resetFilters);
    node.append(button);
  }

  return node;
}

function hasActiveFilters() {
  return Boolean(state.query || state.tags.length || state.folderId || state.ext || state.rating !== "");
}

function resetFilters() {
  if (!hasActiveFilters()) return;
  state.query = "";
  state.tags = [];
  state.folderId = "";
  state.ext = "";
  state.rating = "";
  state.offset = 0;
  els.searchInput.value = "";
  renderTagChips();
  els.folderSelect.value = "";
  els.extSelect.value = "";
  els.ratingSelect.value = "";
  syncResetFiltersButton();
  syncUrlState();
  loadItems();
}
