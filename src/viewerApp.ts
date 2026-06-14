import {
  DEFAULT_EAGLE_CONNECTION,
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
import { getViewerElements } from "./viewer/elements";
import {
  flattenFolders,
  formatDuration,
  isTimedMedia,
  itemMeta,
  normalizeTag,
  originalFileName,
  previewFileName,
} from "./viewer/format";
import { hasActiveFilters, resetFilterState } from "./viewer/filters";
import { iconNode, renderLucideIcons, type IconName } from "./viewer/icons";
import { itemQueryParams } from "./viewer/itemQuery";
import {
  folderSuggestionItems as buildFolderSuggestionItems,
  type MetadataSuggestion,
  type RemoteTag,
  readRecentList,
  rememberRecentValues,
  tagSuggestionItems as buildTagSuggestionItems,
} from "./viewer/metadata";
import {
  currentFetchLimit as getCurrentFetchLimit,
  pageButtonList,
  totalPages,
} from "./viewer/pagination";
import { renderPageButtonsView } from "./viewer/components/PageButtons";
import {
  clearResultStateView,
  renderResultStateView,
} from "./viewer/components/ResultState";
import {
  clearResultListView,
  renderResultListView,
} from "./viewer/components/ResultList";
import {
  clearPreviewInfoView,
  renderPreviewInfoView,
} from "./viewer/components/PreviewInfo";
import { renderTagChipsView } from "./viewer/components/TagChips";
import {
  clearTagSuggestionsView,
  renderTagSuggestionsView,
} from "./viewer/components/TagSuggestions";
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
import { setViewerShellActions } from "./viewer/shellActions";
import { state } from "./viewer/state";
import {
  canLoadMoreTiles,
  shouldShowTileSentinel,
  tileSentinelText,
} from "./viewer/tileLoading";
import type {
  ConnectResponse,
  EagleItem,
  ItemPatch,
  LoadFoldersResponse,
  LoadItemsOptions,
  LoadItemsResponse,
  OpenPreviewOptions,
  PreviewPoint,
  RenderImagePreviewOptions,
  TagSuggestionApiItem,
} from "./viewer/types";
import { buildViewerUrl, currentPage, parseViewerUrlState } from "./viewer/urlState";
import {
  isViewerMode,
  needsViewModeReload,
  savedViewerMode,
} from "./viewer/viewMode";

const els = getViewerElements();

export function initViewer() {
  init();
}

async function init() {
  renderLucideIcons();
  restoreUrlState();
  restoreViewMode();
  setViewerShellActions({
    connect,
    searchChanged: debounce((query: string) => {
      applyFilterChange({ query: query.trim() });
      loadTagSuggestions();
    }, 220),
    searchFocused: (query: string) => {
      if (query.trim()) loadTagSuggestions();
    },
    searchKeyDown: (key: string) => {
      if (key === "Escape") {
        hideTagSuggestions();
      }
    },
    folderChanged: (folderId: string) => {
      applyFilterChange({ folderId });
    },
    mediaTypeChanged: (ext: string) => {
      applyFilterChange({ ext });
    },
    ratingChanged: (rating: string) => {
      applyFilterChange({ rating });
    },
    pageSizeChanged: (limit: number) => {
      applyFilterChange({ limit });
    },
    toggleFilters: () => {
      state.filtersOpen = !state.filtersOpen;
      syncAdvancedFiltersUi();
      syncUrlState();
    },
    resetFilters,
    goToPreviousPage: () => {
      state.offset = Math.max(0, state.offset - state.limit);
      resetPreviewState();
      syncUrlState();
      loadItems();
    },
    goToNextPage: () => {
      state.offset += state.limit;
      resetPreviewState();
      syncUrlState();
      loadItems();
    },
    setViewMode,
    closePreview,
    togglePreviewInfo,
    toggleFullscreen,
    previewPointerDown: closePreviewInfoFromOutside,
    previewClosed: () => {
      clearPreviewContents();
      document.body.classList.remove("modal-open");
    },
    previewDoubleClicked: (target, preventDefault) => {
      if ((target as Element | null)?.closest("button")) {
        preventDefault();
      }
    },
  });
  window.addEventListener("popstate", () => {
    restoreUrlState();
    applyControlsFromState();
    if (els.viewerShell.hidden) return;
    loadItems();
  });
  window.addEventListener("resize", () => refreshPreviewImageLayout());
  document.addEventListener("pointerdown", (event) => {
    if ((event.target as Element | null)?.closest(".search-box")) return;
    hideTagSuggestions();
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
    renderMessage("Loading");
  }
  updatePager();

  const params = itemQueryParams({
    ...state,
    limit: currentFetchLimit(),
  });

  try {
    const data = await getJson<LoadItemsResponse>(`/api/items?${params.toString()}`);
    if (requestId !== state.requestId) return;
    const items = data.items || [];
    state.total = Number(data.total || 0);
    state.items = append ? [...state.items, ...items] : items;
    state.tilesLoadingMore = false;
    if (append) {
      render();
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
    renderMessage(error.message, "error");
    updateStatus();
    updatePager();
    setupTileAutoLoading();
  }
}

function render() {
  clearResultStateView(els.grid);
  els.grid.classList.toggle("media-table", state.viewMode === "table");
  els.grid.classList.toggle("media-grid", state.viewMode === "grid");
  els.grid.classList.toggle("media-tiles", state.viewMode === "tiles");
  els.grid.classList.toggle("is-empty", !state.items.length);

  if (!state.items.length) {
    clearResultListView(els.grid);
    renderEmptyState();
    updateStatus();
    updatePager();
    setupTileAutoLoading();
    updateViewToggle();
    return;
  }

  renderResultListView(els.grid, {
    items: state.items,
    viewMode: state.viewMode,
    onOpenPreview: openPreview,
  });
  updateStatus();
  updatePager();
  setupTileAutoLoading();
  updateViewToggle();
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
  if (needsViewModeReload(previousMode, mode)) {
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
  state.viewMode = savedViewerMode(saved);
  updateViewToggle();
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

function closePreviewInfoFromOutside(target: EventTarget | null) {
  if (!state.previewInfoOpen) return;
  if ((target as Element | null)?.closest(".preview-info, #toggleInfoPreview")) return;
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
  renderTagChipsView(els.tagChips, {
    tags: state.tags,
    onRemove: removeTagFilter,
  });
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

  renderTagSuggestionsView(els.tagSuggestions, {
    items,
    onSelect: addTagFilter,
  });
  els.tagSuggestions.hidden = false;
}

function hideTagSuggestions() {
  state.tagSuggestionsRequestId += 1;
  els.tagSuggestions.hidden = true;
  clearTagSuggestionsView(els.tagSuggestions);
}

function syncAdvancedFiltersUi() {
  const label = state.filtersOpen ? "Hide advanced search options" : "Show advanced search options";
  els.advancedFilters.hidden = !state.filtersOpen;
  els.toggleFiltersButton.setAttribute("aria-expanded", String(state.filtersOpen));
  els.toggleFiltersButton.setAttribute("aria-label", label);
  els.toggleFiltersButton.title = label;
}

function syncResetFiltersButton() {
  els.resetFiltersButton.disabled = !hasActiveFilters(state);
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
  clearPreviewInfoView(els.previewDetails, els.previewActions);
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
  els.tilesSentinel.hidden = !shouldShowTileSentinel(tileLoadingState());
  if (isTiles) {
    els.tilesSentinel.textContent = tileSentinelText(tileLoadingState());
    return;
  }
  els.prevButton.disabled = state.offset <= 0;
  els.nextButton.disabled = state.offset + state.limit >= state.total;
  renderPageButtons();
}

function setupTileAutoLoading() {
  resetTileAutoLoading();
  if (!shouldShowTileSentinel(tileLoadingState()) || typeof IntersectionObserver === "undefined") return;
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
  if (!canLoadMoreTiles(tileLoadingState())) return;
  state.offset = state.items.length;
  syncUrlState({ replace: true });
  loadItems({ append: true });
}

function tileLoadingState() {
  return {
    viewMode: state.viewMode,
    itemCount: state.items.length,
    total: state.total,
    tilesLoadingMore: state.tilesLoadingMore,
  };
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

  renderPageButtonsView(els.pageButtons, {
    current,
    pages,
    onSelect: (page) => {
      state.offset = (page - 1) * state.limit;
      loadItems();
    },
  });
}

function renderPreviewDetails(item: EagleItem) {
  renderPreviewInfoView(els.previewDetails, els.previewActions, {
    item,
    detailRows: previewDetailRows(item),
    folders: state.folders,
    onTagSuggestions: tagSuggestionItems,
    onFolderSuggestions: folderSuggestionItems,
    onSaveMetadata: savePreviewMetadata,
  });
}

async function savePreviewMetadata(item: EagleItem, { tags, folders }: { tags: string[]; folders: string[] }) {
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
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
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

function renderMessage(text: string, className = "empty") {
  clearResultListView(els.grid);
  renderResultStateView(els.grid, { kind: "message", text, className });
}

function renderEmptyState() {
  renderResultStateView(els.grid, {
    kind: "empty",
    hasActiveFilters: hasActiveFilters(state),
    onClearFilters: resetFilters,
  });
}

function resetFilters() {
  if (!hasActiveFilters(state)) return;
  Object.assign(state, resetFilterState());
  els.searchInput.value = "";
  renderTagChips();
  els.folderSelect.value = "";
  els.extSelect.value = "";
  els.ratingSelect.value = "";
  syncResetFiltersButton();
  syncUrlState();
  loadItems();
}
