import {
  DEFAULT_EAGLE_CONNECTION,
  EAGLE_UNAVAILABLE_LABEL,
  LIBRARY_EMPTY_LABEL,
  RECENT_FOLDERS_STORAGE_KEY,
  RECENT_TAGS_STORAGE_KEY,
  pdfPreviewExts,
  playableAudioExts,
  playableVideoExts,
  textPreviewExts,
} from "./viewer/constants";
import { debounce, getJson, postJson } from "./viewer/api";
import { getViewerElements } from "./viewer/elements";
import {
  flattenFolders,
  isTimedMedia,
  itemMeta,
  normalizeTag,
  originalFileName,
  previewFileName,
} from "./viewer/format";
import { hasActiveFilters, resetFilterState } from "./viewer/filters";
import { renderLucideIcons } from "./viewer/icons";
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
import {
  clearPreviewBodyView,
  renderPreviewBodyView,
  type PreviewBodyKind,
} from "./viewer/components/PreviewBody";
import { renderFolderOptionsView } from "./viewer/components/FolderOptions";
import { renderResultsStatusView } from "./viewer/components/ResultsStatus";
import { renderTagChipsView } from "./viewer/components/TagChips";
import {
  clearTagSuggestionsView,
  renderTagSuggestionsView,
} from "./viewer/components/TagSuggestions";
import { previewDetailRows } from "./viewer/previewDetails";
import { clearRatingView, renderRatingView } from "./viewer/components/RatingStars";
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
  renderFolderOptions();
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

async function loadFolders() {
  try {
    const data = await getJson<LoadFoldersResponse>("/api/folders");
    state.folders = flattenFolders(data.items);
    renderFolderOptions();
  } catch {
    state.folders = [];
    // Folder loading is optional; item browsing still works without it.
  }
}

function renderFolderOptions() {
  renderFolderOptionsView(els.folderSelect, {
    folders: state.folders,
    selectedValue: state.folderId,
  });
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
}

function openPreview(item: EagleItem, { skipHistory = false }: OpenPreviewOptions = {}) {
  state.previewItemId = String(item.id || "");
  els.previewMeta.textContent = itemMeta(item);
  els.previewOriginalName.textContent = originalFileName(item);
  els.previewOriginalName.title = originalFileName(item);
  clearPreviewBodyView(els.previewBody);
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "text-mode", "unsupported-mode", "info-open");
  els.toggleInfoPreview.setAttribute("aria-expanded", state.previewInfoOpen ? "true" : "false");
  renderRatingView(els.previewRating, {
    className: "rating-control inline-flex items-center gap-px",
    interactive: true,
    item,
    onSelect: (star) => setItemStar(item, star),
  });
  renderPreviewDetails(item);
  if (state.previewInfoOpen) {
    els.dialog.classList.add("info-open");
  }

  const { kind, srcKind } = previewBodyForItem(item);
  els.dialog.classList.add(`${kind}-mode`);
  renderPreviewBodyView(els.previewBody, { item, kind, srcKind });

  showPreviewDialog();
  if (!skipHistory) syncUrlState();
}

function previewBodyForItem(item: EagleItem): { kind: PreviewBodyKind; srcKind?: "file" | "thumb" } {
  const ext = (item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) return { kind: "video" };
  if (playableAudioExts.has(ext)) return { kind: "audio" };
  if (textPreviewExts.has(ext)) return { kind: "text" };
  if (pdfPreviewExts.has(ext)) return { kind: "image", srcKind: "thumb" };
  if (isTimedMedia(item)) return { kind: "unsupported" };
  return { kind: "image" };
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

function restoreViewMode() {
  if (new URLSearchParams(window.location.search).has("view")) {
    updateStatus();
    return;
  }
  const saved = localStorage.getItem("eagleViewMode");
  state.viewMode = savedViewerMode(saved);
  updateStatus();
}

function closePreview({ skipHistory = false }: OpenPreviewOptions = {}) {
  els.dialog.classList.remove("video-mode", "image-mode", "audio-mode", "text-mode", "unsupported-mode", "info-open");
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
  updateStatus();
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
  clearPreviewBodyView(els.previewBody);
  clearRatingView(els.previewRating);
  els.previewOriginalName.textContent = "";
  els.previewOriginalName.removeAttribute("title");
  els.previewDetails.replaceChildren();
  els.previewActions.replaceChildren();
}

async function setItemStar(item: EagleItem, star: number) {
  const previous = Number(item.star || 0);
  item.star = star;
  updateItemInState(String(item.id || ""), { star });
  render();
  if (els.dialog.open) {
    renderRatingView(els.previewRating, {
      className: "rating-control inline-flex items-center gap-px",
      interactive: true,
      item,
      onSelect: (nextStar) => setItemStar(item, nextStar),
    });
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
      renderRatingView(els.previewRating, {
        className: "rating-control inline-flex items-center gap-px",
        interactive: true,
        item,
        onSelect: (nextStar) => setItemStar(item, nextStar),
      });
    }
  }
}

function updateItemInState(id: string, patch: ItemPatch) {
  const target = state.items.find((item) => item.id === id);
  if (target) Object.assign(target, patch);
}

function updateStatus() {
  renderResultsStatusView(els.resultsStatusHost, {
    total: state.total,
    viewMode: state.viewMode,
  });
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
