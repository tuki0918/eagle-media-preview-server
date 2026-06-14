import {
  DATE_KEYS_MODIFIED,
  DEFAULT_EAGLE_CONNECTION,
  DEFAULT_PAGE_SIZE,
  DEFAULT_VIEW_MODE,
  EAGLE_UNAVAILABLE_LABEL,
  IMAGE_FIT_MARGIN,
  LIBRARY_EMPTY_LABEL,
  MAX_PAGE_SIZE,
  RECENT_FOLDERS_STORAGE_KEY,
  RECENT_METADATA_LIMIT,
  RECENT_TAGS_STORAGE_KEY,
  TILE_PREFETCH_PAGES,
  UNCATEGORIZED_FOLDER_ID,
  pdfPreviewExts,
  playableAudioExts,
  playableVideoExts,
  textPreviewExts,
} from "./viewer/constants";
import { debounce, getJson, mediaUrl, postJson } from "./viewer/api";
import { getViewerElements } from "./viewer/elements";
import {
  clamp,
  flattenFolders,
  folderIds,
  formatBytes,
  formatDate,
  formatDateShort,
  formatDimensions,
  formatDuration,
  formatDurationCell,
  formatItemDate,
  itemMeta,
  itemTags,
  mediaTypeLabel,
  normalizeTag,
  originalFileName,
  previewFileName,
  isTimedMedia,
} from "./viewer/format";
import { iconNode, renderLucideIcons } from "./viewer/icons";
import { state } from "./viewer/state";
import type { ViewerMode } from "./viewer/types";

const els = getViewerElements();

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
    if (event.target.closest("button")) {
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
    const data = await postJson("/api/connect", connection);
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

function showViewer(data) {
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

function setConnectMessage(message, isError) {
  els.connectMessage.textContent = message;
  els.connectMessage.classList.toggle("error-text", isError);
}

function libraryLabel(data) {
  const name = data.library?.name || LIBRARY_EMPTY_LABEL;
  const version = data.app?.version ? `Eagle ${data.app.version}` : EAGLE_UNAVAILABLE_LABEL;
  return `${name} - ${version}`;
}

function optionNode(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

async function loadFolders() {
  try {
    const data = await getJson("/api/folders");
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

async function loadItems({ append = false } = {}) {
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
    const data = await getJson(`/api/items?${params.toString()}`);
    if (requestId !== state.requestId) return;
    const items = data.items || [];
    state.total = data.total;
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

function resultItemNode(item) {
  return state.viewMode === "table" ? tableRow(item) : state.viewMode === "tiles" ? tileItem(item) : gridCard(item);
}

function appendRenderedItems(items) {
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

function bindPreviewTrigger(element, item) {
  let lastTriggerAt = 0;
  let touchSession: any = null;
  const TAP_MOVE_THRESHOLD = 10;
  const TAP_HOLD_THRESHOLD_MS = 300;

  const openFromPointer = (event) => {
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

function gridCard(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const img = node.querySelector("img");
  const button = node.querySelector("button");
  const badge = node.querySelector(".file-badge");
  const duration = node.querySelector(".duration-badge");
  const overlayIcon = node.querySelector(".thumb-overlay-icon");
  const title = node.querySelector("strong");
  const metaLine = node.querySelector(".card-meta span");
  const rating = node.querySelector(".rating-control");

  populateThumb({ img, badge, duration, item });
  decorateThumbButton(button, overlayIcon, item);
  title.textContent = item.name || item.id;
  title.title = originalFileName(item);
  metaLine.hidden = true;
  renderRating(rating, item, { interactive: false });
  button.append(rating);
  bindPreviewTrigger(button, item);
  return node;
}

function tileItem(item) {
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

function tableRow(item) {
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

function tableNameCell(item) {
  const cell = document.createElement("span");
  cell.className = "row-name-cell";
  const name = document.createElement("span");
  name.className = "row-file-name";
  name.textContent = item.name || item.id;
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

function populateThumb({ img, badge, duration, item }) {
  const button = img.closest("button");
  button?.classList.add("thumb-loading");
  img.loading = "lazy";
  img.decoding = "async";
  img.src = mediaUrl(item.id, "thumb");
  img.alt = item.name || item.id;
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

function decorateThumbButton(button, overlayIcon, item) {
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

function openPreview(item, { skipHistory = false } = {}) {
  state.previewItemId = item.id;
  els.previewMeta.textContent = itemMeta(item);
  els.previewOriginalName.textContent = originalFileName(item);
  els.previewOriginalName.title = originalFileName(item);
  els.previewBody.replaceChildren();
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "text-mode", "unsupported-mode", "info-open");
  els.toggleInfoPreview.setAttribute("aria-expanded", state.previewInfoOpen ? "true" : "false");
  renderRating(els.previewRating, item, { interactive: true });
  renderPreviewDetails(item);
  if (state.previewInfoOpen) {
    els.dialog.classList.add("info-open");
  }

  const ext = (item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) {
    els.dialog.classList.add("video-mode");
    const video = document.createElement("video");
    video.className = "preview-video";
    video.src = mediaUrl(item.id, "file");
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
    audio.src = mediaUrl(item.id, "file");
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
    image.src = mediaUrl(item.id, "thumb");
    image.alt = item.name || item.id;
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

function renderTextPreview(item) {
  const preview = document.createElement("pre");
  preview.className = "text-preview";
  const code = document.createElement("code");
  code.textContent = "Loading...";
  preview.append(code);
  els.previewBody.append(preview);

  (async () => {
    try {
      const response = await fetch(mediaUrl(item.id, "file"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      code.textContent = text;
    } catch (error) {
      code.textContent = `Unable to load preview: ${error.message}`;
    }
  })();
}

function renderImagePreview(item, { srcKind = "file" } = {}) {
  const viewport = document.createElement("div");
  viewport.className = "image-viewport";
  const status = document.createElement("div");
  status.className = "image-status";
  status.hidden = true;
  const image = document.createElement("img");
  image.className = "preview-image";
  image.src = mediaUrl(item.id, srcKind);
  image.alt = item.name || item.id;
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

function toolbarButton(label, icon, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = label;
  button.ariaLabel = label;
  button.append(iconNode(icon));
  button.addEventListener("click", action);
  return button;
}

function resetPreviewTransform() {
  state.previewTransform = { scale: 1, x: 0, y: 0 };
  state.previewFitScale = 1;
  state.previewNaturalScale = 1;
  state.previewDrag = null;
  state.previewPointers = new Map();
  state.previewPinch = null;
}

function updatePreviewScales(image, viewport) {
  const previousFitScale = state.previewFitScale;
  const previousScale = state.previewTransform.scale;
  const widthRatio = viewport.clientWidth / image.naturalWidth;
  const heightRatio = viewport.clientHeight / image.naturalHeight;
  state.previewFitScale = Math.min(widthRatio, heightRatio) * IMAGE_FIT_MARGIN;
  state.previewNaturalScale = 1;
  const keepFitted = Math.abs(state.previewTransform.scale - previousFitScale) < 0.01;
  if (keepFitted || previousScale === 1) {
    state.previewTransform.scale = state.previewFitScale;
    state.previewTransform.x = 0;
    state.previewTransform.y = 0;
  }
}

function zoomImage(multiplier) {
  const nextScale = clamp(state.previewTransform.scale * multiplier, minimumPreviewScale(), 8);
  setImageZoom(nextScale);
}

function setImageZoom(scale, position: { x: number; y: number } = state.previewTransform) {
  state.previewTransform = {
    scale,
    x: position.x,
    y: position.y,
  };
  applyImageTransform();
}

function applyImageTransform() {
  const image = els.previewBody.querySelector(".preview-image");
  if (!image) return;
  const { scale, x, y } = state.previewTransform;
  image.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  updateImageStatus();
}

function updateImageStatus() {
  const image = els.previewBody.querySelector(".preview-image");
  const status = els.previewBody.querySelector(".image-status");
  if (!image || !status || !image.naturalWidth || !image.naturalHeight) return;
  const zoomPercent = Math.round((state.previewTransform.scale / state.previewNaturalScale) * 100);
  status.textContent = `${image.naturalWidth} × ${image.naturalHeight} · ${zoomPercent}%`;
}

function startImageDrag(event, viewport) {
  const image = els.previewBody.querySelector(".preview-image");
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

function moveImageDrag(event) {
  if (event.pointerType === "touch" && state.previewPointers.has(event.pointerId)) {
    state.previewPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (state.previewPointers.size === 2 && state.previewPinch) {
      const distance = pointerDistance();
      if (distance > 0 && state.previewPinch.distance > 0) {
        const nextScale = clamp(
          state.previewPinch.scale * (distance / state.previewPinch.distance),
          minimumPreviewScale(),
          8,
        );
        setImageZoom(nextScale);
      }
      return;
    }
  }
  const drag = state.previewDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  state.previewTransform.x = drag.originX + event.clientX - drag.startX;
  state.previewTransform.y = drag.originY + event.clientY - drag.startY;
  applyImageTransform();
}

function endImageDrag(event) {
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

function showPreviewNotice(message) {
  const notice = document.createElement("p");
  notice.className = "preview-notice";
  notice.textContent = message;
  els.previewBody.append(notice);
}

function minimumPreviewScale() {
  return Math.max(0.05, Math.min(state.previewFitScale, state.previewNaturalScale) * 0.5);
}

function refreshPreviewImageLayout() {
  const image = els.previewBody.querySelector(".preview-image");
  const viewport = els.previewBody.querySelector(".image-viewport");
  if (!image || !viewport || !image.naturalWidth || !image.naturalHeight) return;
  updatePreviewScales(image, viewport);
  applyImageTransform();
}

function videoErrorMessage(error) {
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

function closePreview({ skipHistory = false } = {}) {
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

function closePreviewInfoFromOutside(event) {
  if (!state.previewInfoOpen) return;
  if (event.target.closest(".preview-info, #toggleInfoPreview")) return;
  setPreviewInfoOpen(false);
}

function setPreviewInfoOpen(isOpen) {
  els.dialog.classList.toggle("info-open", isOpen);
  els.toggleInfoPreview.setAttribute("aria-expanded", isOpen ? "true" : "false");
  state.previewInfoOpen = isOpen;
  syncUrlState();
}

async function toggleFullscreen() {
  const target = els.previewBody.firstElementChild || els.previewBody;
  try {
    if (target.tagName === "VIDEO" && target.webkitEnterFullscreen && !document.fullscreenEnabled) {
      target.webkitEnterFullscreen();
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
    if (target.tagName === "VIDEO" && target.webkitEnterFullscreen) {
      target.webkitEnterFullscreen();
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
    const params = new URLSearchParams(window.location.search);
    state.query = params.get("q") || "";
    state.tags = uniqueTags(params.getAll("tag"));
    state.folderId = params.get("folder") || "";
    state.ext = params.get("ext") || "";
    state.rating = params.get("rating") || "";
    state.filtersOpen = params.get("filters") === "1";
    state.limit = clampPageSize(params.get("limit"));
    state.viewMode = params.get("view") === "tiles" ? "tiles" : params.get("view") === "table" ? "table" : DEFAULT_VIEW_MODE;
    state.offset = state.viewMode === "tiles" ? 0 : (Math.max(1, Number.parseInt(params.get("page") || "1", 10)) - 1) * state.limit;
    state.previewItemId = params.get("item") || "";
    state.previewInfoOpen = params.get("info") === "1";
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

function applyFilterChange(patch) {
  Object.assign(state, patch, { offset: 0 });
  resetPreviewState();
  syncResetFiltersButton();
  syncUrlState();
  loadItems();
}

function syncUrlState({ replace = false } = {}) {
  if (state.restoringHistory) return;
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const tag of state.tags) params.append("tag", tag);
  if (state.folderId) params.set("folder", state.folderId);
  if (state.ext) params.set("ext", state.ext);
  if (state.rating !== "") params.set("rating", state.rating);
  if (state.filtersOpen) params.set("filters", "1");
  if (state.limit !== DEFAULT_PAGE_SIZE) params.set("limit", String(state.limit));
  if (state.viewMode !== DEFAULT_VIEW_MODE) params.set("view", state.viewMode);
  if (state.viewMode !== "tiles") params.set("page", String(currentPage()));
  if (state.previewItemId) params.set("item", state.previewItemId);
  if (state.previewInfoOpen) params.set("info", "1");
  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", nextUrl);
}

function addTagFilter(value) {
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

function removeTagFilter(tag) {
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
    const data = await getJson(`/api/tags?${params.toString()}`);
    if (requestId !== state.tagSuggestionsRequestId) return;
    const items = Array.isArray(data.items) ? data.items : [];
    renderTagSuggestions(items.filter((item) => item?.name && !state.tags.includes(item.name)));
  } catch {
    if (requestId === state.tagSuggestionsRequestId) hideTagSuggestions();
  }
}

function renderTagSuggestions(items) {
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
    name.textContent = item.name;
    button.append(name);

    if (Number.isFinite(item.count)) {
      const count = document.createElement("span");
      count.className = "tag-suggestion-count";
      count.textContent = item.count.toLocaleString();
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

function uniqueTags(tags) {
  const unique: string[] = [];
  for (const tag of tags.map(normalizeTag).filter(Boolean)) {
    if (!unique.includes(tag)) unique.push(tag);
  }
  return unique;
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

function currentPage() {
  return Math.floor(state.offset / state.limit) + 1;
}

function clampPageSize(value) {
  const parsed = Number.parseInt(value || "30", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return clamp(parsed, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
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
  const points = [...state.previewPointers.values()];
  if (points.length < 2) return 0;
  const [first, second] = points;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function renderRating(container, item, { interactive = false } = {}) {
  container.replaceChildren();
  const current = Number(item.star || 0);
  for (let value = 1; value <= 5; value += 1) {
    const star = document.createElement(interactive ? "button" : "span");
    if (interactive) (star as HTMLButtonElement).type = "button";
    star.className = interactive ? "rating-star" : "rating-star rating-star-static";
    star.textContent = "★";
    star.title = `${value}`;
    star.dataset.active = value <= current ? "true" : "false";
    if (interactive) {
      star.ariaLabel = `Rating ${value}`;
      star.setAttribute("aria-pressed", value <= current ? "true" : "false");
      star.addEventListener("click", (event) => {
        event.stopPropagation();
        setItemStar(item, value === Number(item.star || 0) ? 0 : value);
      });
    } else {
      star.setAttribute("aria-hidden", "true");
    }
    container.append(star);
  }
}

async function setItemStar(item, star) {
  const previous = Number(item.star || 0);
  item.star = star;
  updateItemInState(item.id, { star });
  render();
  if (els.dialog.open) {
    renderRating(els.previewRating, item, { interactive: true });
  }

  try {
    const data = await postJson(`/api/items/${encodeURIComponent(item.id)}/star`, { star });
    const savedStar = Number(data.star ?? star);
    item.star = savedStar;
    updateItemInState(item.id, { star: savedStar });
  } catch (error) {
    item.star = previous;
    updateItemInState(item.id, { star: previous });
    alert(error.message);
  } finally {
    render();
    if (els.dialog.open) {
      renderRating(els.previewRating, item, { interactive: true });
    }
  }
}

function updateItemInState(id, patch) {
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
  if (state.viewMode !== "tiles" || state.tags.length) return state.limit;
  return Math.min(state.limit * TILE_PREFETCH_PAGES, MAX_PAGE_SIZE);
}

function renderPageButtons() {
  const current = currentPage();
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const pages = pageButtonList(current, totalPages);
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

function pageButtonList(current, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
  if (current >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", current - 1, current, current + 1, "...", totalPages];
}

function tableCell(value, className = "", title = "") {
  const cell = document.createElement("span");
  cell.className = className;
  cell.textContent = value;
  if (title) cell.title = title;
  return cell;
}

function extensionPill(item) {
  const ext = document.createElement("span");
  ext.className = "ext-pill";
  ext.textContent = (item.ext || "file").toUpperCase();
  ext.dataset.ext = (item.ext || "file").toLowerCase();
  return ext;
}

function directFileUrl(item) {
  return new URL(`/file/${encodeURIComponent(item.id)}`, window.location.href).href;
}

function directFileLink(item) {
  const link = document.createElement("a");
  link.className = "direct-file-link";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open file";
  link.href = directFileUrl(item);
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

function renderPreviewDetails(item) {
  const detailsSection = document.createElement("section");
  detailsSection.className = "preview-details-section";

  const detailRows: Array<{ label: string; value: any; chips?: boolean; always?: boolean }> = [
    { label: "Type", value: mediaTypeLabel(item) },
    { label: "Size", value: formatBytes(item.size) },
    { label: "Dimensions", value: item.width && item.height ? `${item.width} x ${item.height}` : "" },
    { label: "Duration", value: isTimedMedia(item) ? formatDuration(item.duration) : "" },
    { label: "ID", value: item.id },
    { label: "Date Modified", value: formatItemDate(item, DATE_KEYS_MODIFIED) || "-" },
  ];
  const rows = detailRows.filter(({ value, chips, always }) => always || (chips ? value.length > 0 : Boolean(value)));

  for (const { label, value, chips = false } of rows) {
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

function previewMetadataEditor(item) {
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
    labelForValue: folderLabel,
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
  const submitMetadata = (event) => {
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

function metadataChipPicker({
  kind,
  initialValues,
  placeholder,
  inputLabel,
  labelForValue,
  getSuggestions,
  normalizeValue,
}) {
  let selected: any[] = uniqueValues((initialValues || []).map(normalizeValue).filter(Boolean));
  let currentSuggestions: any[] = [];
  let requestId = 0;

  const wrapper = document.createElement("div");
  wrapper.className = "preview-chip-editor";
  wrapper.dataset.kind = kind;

  const chipList = document.createElement("div");
  chipList.className = "preview-edit-chip-list";

  const inputWrap = document.createElement("div");
  inputWrap.className = "preview-chip-input-wrap";

  const input = document.createElement("input");
  input.className = "preview-chip-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", inputLabel);
  input.setAttribute("autocomplete", "off");

  const suggestions = document.createElement("div");
  suggestions.className = "preview-chip-suggestions";
  suggestions.setAttribute("role", "listbox");
  suggestions.hidden = true;

  inputWrap.append(input, suggestions);
  wrapper.append(chipList, inputWrap);

  const addValue = (value) => {
    const normalized = normalizeValue(value);
    if (!normalized || selected.includes(normalized)) return;
    selected = [...selected, normalized];
    input.value = "";
    renderSelected();
    hideSuggestions();
  };

  const removeValue = (value) => {
    selected = selected.filter((entry) => entry !== value);
    renderSelected();
    updateSuggestions();
  };

  const hideSuggestions = () => {
    requestId += 1;
    suggestions.hidden = true;
    suggestions.replaceChildren();
    currentSuggestions = [];
  };

  const renderSuggestions = (items) => {
    currentSuggestions = items;
    if (!items.length) {
      suggestions.hidden = true;
      suggestions.replaceChildren();
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preview-chip-suggestion";
      button.setAttribute("role", "option");
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        addValue(item.value);
      });

      const label = document.createElement("span");
      label.textContent = item.label;
      button.append(label);

      if (item.meta) {
        const meta = document.createElement("span");
        meta.className = "preview-chip-suggestion-meta";
        meta.textContent = item.meta;
        button.append(meta);
      }

      fragment.append(button);
    }
    suggestions.replaceChildren(fragment);
    suggestions.hidden = false;
  };

  const updateSuggestions = async () => {
    const query = input.value.trim();
    const currentRequest = ++requestId;
    try {
      const items = await getSuggestions(query, selected);
      if (currentRequest !== requestId) return;
      renderSuggestions(items);
    } catch {
      if (currentRequest === requestId) hideSuggestions();
    }
  };

  const renderSelected = () => {
    const fragment = document.createDocumentFragment();
    for (const value of selected) {
      const chip = document.createElement("span");
      chip.className = "preview-edit-chip";

      const label = document.createElement("span");
      label.textContent = labelForValue(value);

      const button = document.createElement("button");
      button.type = "button";
      button.title = `Remove ${label.textContent}`;
      button.setAttribute("aria-label", `Remove ${label.textContent}`);
      button.append(iconNode("x"));
      button.addEventListener("click", () => removeValue(value));

      chip.append(label, button);
      fragment.append(chip);
    }
    chipList.replaceChildren(fragment);
  };

  input.addEventListener("input", debounce(updateSuggestions, 160));
  input.addEventListener("pointerdown", updateSuggestions);
  input.addEventListener("focus", updateSuggestions);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideSuggestions();
      return;
    }
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const value = input.value.trim();
    if (value && kind === "tag") {
      addValue(value);
      return;
    }
    if (currentSuggestions[0]) addValue(currentSuggestions[0].value);
  });
  wrapper.addEventListener("focusout", (event) => {
    if (wrapper.contains(event.relatedTarget as Node | null)) return;
    window.setTimeout(hideSuggestions, 120);
  });
  wrapper.addEventListener("pointerdown", (event) => event.stopPropagation());

  renderSelected();

  return {
    element: wrapper,
    values: () => selected.slice(),
  };
}

function previewEditField(label, control) {
  const row = document.createElement("div");
  row.className = "preview-edit-row";
  const labelNode = document.createElement("span");
  labelNode.className = "preview-detail-label";
  labelNode.textContent = label;
  row.append(labelNode, control);
  return row;
}

function previewEditActions(saveButton, status) {
  const row = document.createElement("div");
  row.className = "preview-edit-actions";
  row.append(saveButton, status);
  return row;
}

async function savePreviewMetadata(item, { tags, folders, saveButton, status }) {
  saveButton.disabled = true;
  status.textContent = "Saving";
  try {
    const data = await postJson(`/api/items/${encodeURIComponent(item.id)}/metadata`, { tags, folders });
    const patch = {
      tags: Array.isArray(data.tags) ? data.tags : tags,
      folders: Array.isArray(data.folders) ? data.folders : folders,
    };
    rememberRecentValues(RECENT_TAGS_STORAGE_KEY, patch.tags);
    rememberRecentValues(RECENT_FOLDERS_STORAGE_KEY, patch.folders);
    Object.assign(item, patch);
    updateItemInState(item.id, patch);
    render();
    if (status.isConnected) status.textContent = "Saved";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
}

function previewChipList(values) {
  const list = document.createElement("div");
  list.className = "preview-chip-list";
  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "preview-chip";
    chip.textContent = value;
    list.append(chip);
  }
  return list;
}

function tagSuggestionItems(query, selectedValues) {
  const selected = new Set(selectedValues);
  const recent = readRecentList(RECENT_TAGS_STORAGE_KEY)
    .filter((tag) => !selected.has(tag) && matchesQuery(tag, query))
    .map((tag) => ({ value: tag, label: tag, meta: "Recent" }));
  if (!query) return recent;

  const params = new URLSearchParams({ q: query, limit: "20" });
  return getJson(`/api/tags?${params.toString()}`)
    .then((data) => {
      const remote = Array.isArray(data.items) ? data.items : [];
      return dedupeSuggestions([
        ...recent,
        ...remote
          .map((item) => ({
            value: normalizeTag(item?.name),
            label: normalizeTag(item?.name),
            meta: Number.isFinite(item?.count) ? item.count.toLocaleString() : "",
          }))
          .filter((item) => item.value && !selected.has(item.value)),
      ]);
    })
    .catch(() => recent);
}

function folderSuggestionItems(query, selectedValues) {
  const selected = new Set(selectedValues);
  const recent = readRecentList(RECENT_FOLDERS_STORAGE_KEY)
    .filter((id) => !selected.has(id) && matchesQuery(folderLabel(id), query))
    .map((id) => ({ value: id, label: folderLabel(id), meta: "Recent" }));
  const folders = state.folders
    .filter((folder) => !selected.has(folder.id) && matchesQuery(folder.name, query))
    .map((folder) => ({
      value: folder.id,
      label: folderLabel(folder.id),
      meta: Number.isFinite(folder.imageCount) ? `${Number(folder.imageCount).toLocaleString()} items` : "",
    }));
  return dedupeSuggestions([...recent, ...folders]).slice(0, 20);
}

function dedupeSuggestions(items) {
  const seen = new Set();
  const output: any[] = [];
  for (const item of items) {
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    output.push(item);
  }
  return output;
}

function matchesQuery(value, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return String(value || "").toLowerCase().includes(needle);
}

function folderLabel(id) {
  const folder = state.folders.find((entry) => entry.id === id);
  if (!folder) return id;
  return `${folder.depth ? "  ".repeat(folder.depth) : ""}${folder.name}`;
}

function readRecentList(key) {
  try {
    const values = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(values) ? uniqueValues(values.map((value) => String(value || "").trim()).filter(Boolean)) : [];
  } catch {
    return [];
  }
}

function writeRecentList(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(uniqueValues(values).slice(0, RECENT_METADATA_LIMIT)));
  } catch {
    // Recent metadata is a convenience cache; saving metadata itself should not fail because of storage limits.
  }
}

function rememberRecentValues(key, values) {
  const next = uniqueValues([
    ...(values || []).map((value) => String(value || "").trim()).filter(Boolean),
    ...readRecentList(key),
  ]);
  writeRecentList(key, next);
}

function uniqueValues(values) {
  const unique: any[] = [];
  for (const value of values) {
    if (value && !unique.includes(value)) unique.push(value);
  }
  return unique;
}

function messageNode(text, className = "empty") {
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
