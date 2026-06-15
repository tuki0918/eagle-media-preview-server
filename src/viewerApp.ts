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
import { itemQueryParams } from "./viewer/itemQuery";
import { setLoginConnectState } from "./viewer/loginConnectState";
import {
  folderSuggestionItems as buildFolderSuggestionItems,
  type MetadataSuggestion,
  type RemoteTag,
  readRecentList,
  rememberRecentValues,
  tagSuggestionItems as buildTagSuggestionItems,
} from "./viewer/metadata";
import { setLibraryFooterName } from "./viewer/libraryFooterState";
import {
  currentFetchLimit as getCurrentFetchLimit,
  pageButtonList,
  totalPages,
} from "./viewer/pagination";
import { setPagerState } from "./viewer/pagerState";
import { setSearchControlsState } from "./viewer/searchControlsState";
import { setResultSurfaceState } from "./viewer/resultSurfaceState";
import { setPreviewInfoState, clearPreviewInfoState } from "./viewer/previewInfoState";
import { setPreviewTextState } from "./viewer/previewTextState";
import { type PreviewBodyKind } from "./viewer/components/PreviewBody";
import { clearPreviewBodyState, setPreviewBodyState } from "./viewer/previewBodyState";
import { setTagChipsState } from "./viewer/tagChipsState";
import {
  clearTagSuggestionsState,
  setTagSuggestionsState,
} from "./viewer/tagSuggestionsState";
import { previewDetailRows } from "./viewer/previewDetails";
import {
  resetPreviewDialogState,
  setPreviewDialogInfoOpen,
  setPreviewDialogState,
} from "./viewer/previewDialogState";
import { setResultsStatusState } from "./viewer/resultsStatusState";
import {
  getTilesSentinelElement,
  setTilesSentinelState,
} from "./viewer/tilesSentinelState";
import {
  clearPreviewRatingState,
  setPreviewRatingState,
} from "./viewer/previewRatingState";
import { setViewerShellActions } from "./viewer/shellActions";
import { getShellView, setShellView } from "./viewer/shellVisibility";
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
let connectMessageText = "";
let connectMessageIsError = false;
let connectBusy = false;

export function initViewer() {
  init();
}

async function init() {
  restoreUrlState();
  restoreViewMode();
  setViewerShellActions({
    connect,
    urlPopped: () => {
      restoreUrlState();
      applyControlsFromState();
      if (getShellView() !== "viewer") return;
      loadItems();
    },
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
    searchOutsidePointerDown: (target) => {
      if ((target as Element | null)?.closest(".search-box")) return;
      hideTagSuggestions();
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
    previewPointerDown: closePreviewInfoFromOutside,
    previewClosed: () => {
      clearPreviewContents();
    },
    previewDoubleClicked: (target, preventDefault) => {
      if ((target as Element | null)?.closest("button")) {
        preventDefault();
      }
    },
  });
  showLogin();
}

async function connect() {
  setConnectMessage("Connecting", false);
  setConnectBusy(true);

  try {
    const connection = { ...DEFAULT_EAGLE_CONNECTION };
    const data = await postJson<ConnectResponse>("/api/connect", connection);
    showViewer(data);
    await Promise.all([loadFolders(), loadItems()]);
  } catch (error) {
    showLogin();
    setConnectMessage(error.message, true);
  } finally {
    setConnectBusy(false);
  }
}

function showLogin() {
  setShellView("login");
}

function showViewer(data: ConnectResponse) {
  setShellView("viewer");
  setLibraryFooterName(libraryLabel(data));
  renderSearchControlButtons();
  state.total = 0;
  state.items = [];
  applyControlsFromState();
  updateStatus();
  updatePager();
}

function setConnectMessage(message: string, isError: boolean) {
  connectMessageText = message;
  connectMessageIsError = isError;
  renderLoginConnect();
}

function setConnectBusy(isBusy: boolean) {
  connectBusy = isBusy;
  renderLoginConnect();
}

function renderLoginConnect() {
  setLoginConnectState({
    disabled: connectBusy,
    isError: connectMessageIsError,
    message: connectMessageText,
  });
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
    renderSearchControlButtons();
  } catch {
    state.folders = [];
    // Folder loading is optional; item browsing still works without it.
  }
}

async function loadItems({ append = false }: LoadItemsOptions = {}) {
  const requestId = ++state.requestId;
  if (append) {
    state.tilesLoadingMore = true;
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
      renderTilesSentinel(error.message);
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
  if (!state.items.length) {
    renderEmptyState();
    updateStatus();
    updatePager();
    setupTileAutoLoading();
    return;
  }

  setResultSurfaceState({
    kind: "list",
    items: state.items,
    onOpenPreview: openPreview,
    viewMode: state.viewMode,
  });
  updateStatus();
  updatePager();
  setupTileAutoLoading();
}

function openPreview(item: EagleItem, { skipHistory = false }: OpenPreviewOptions = {}) {
  state.previewItemId = String(item.id || "");
  setPreviewTextState({
    meta: itemMeta(item),
    originalName: originalFileName(item),
  });
  clearPreviewBodyState();
  setPreviewRatingState({
    item,
    onSelect: (star) => setItemStar(item, star),
  });
  renderPreviewDetails(item);

  const { kind, srcKind } = previewBodyForItem(item);
  setPreviewDialogState({
    infoOpen: state.previewInfoOpen,
    mode: kind,
    open: true,
  });
  setPreviewBodyState({ item, kind, srcKind });

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
  resetPreviewDialogState();
  state.previewItemId = "";
  state.previewInfoOpen = false;
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
  state.previewInfoOpen = isOpen;
  setPreviewDialogInfoOpen(isOpen);
  syncUrlState();
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
  renderTagChips();
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
    renderSearchControlButtons();
    hideTagSuggestions();
    return;
  }
  applyFilterChange({ query: "", tags: [...state.tags, tag] });
  renderTagChips();
  hideTagSuggestions();
}

function removeTagFilter(tag: string) {
  applyFilterChange({ tags: state.tags.filter((entry) => entry !== tag) });
  renderTagChips();
}

function renderTagChips() {
  setTagChipsState({
    tags: state.tags,
    onRemove: removeTagFilter,
  });
  syncResetFiltersButton();
}

async function loadTagSuggestions() {
  const query = state.query.trim();
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

  setTagSuggestionsState({
    hidden: false,
    items,
    onSelect: addTagFilter,
  });
}

function hideTagSuggestions() {
  state.tagSuggestionsRequestId += 1;
  clearTagSuggestionsState();
}

function syncAdvancedFiltersUi() {
  renderSearchControlButtons();
}

function syncResetFiltersButton() {
  renderSearchControlButtons();
}

function renderSearchControlButtons() {
  setSearchControlsState({
    filtersOpen: state.filtersOpen,
    folders: state.folders,
    hasActiveFilters: hasActiveFilters(state),
    searchQuery: state.query,
    selectedExt: state.ext,
    selectedFolderId: state.folderId,
    selectedLimit: state.limit,
    selectedRating: state.rating,
  });
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
  clearPreviewInfoState();
  clearPreviewBodyState();
  clearPreviewRatingState();
  setPreviewTextState({
    meta: "",
    originalName: "",
  });
}

async function setItemStar(item: EagleItem, star: number) {
  const previous = Number(item.star || 0);
  item.star = star;
  updateItemInState(String(item.id || ""), { star });
  render();
  if (els.dialog.open) {
    setPreviewRatingState({
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
      setPreviewRatingState({
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
  setResultsStatusState({
    total: state.total,
    viewMode: state.viewMode,
  });
}

function updatePager() {
  const isTiles = state.viewMode === "tiles";
  renderTilesSentinel(isTiles ? tileSentinelText(tileLoadingState()) : "Loading more");
  const current = currentPage(state);
  setPagerState({
    current,
    hidden: isTiles,
    nextDisabled: state.offset + state.limit >= state.total,
    onSelectPage: goToPage,
    pages: pageButtonList(current, totalPages(state.total, state.limit)),
    previousDisabled: state.offset <= 0,
  });
}

function renderTilesSentinel(text = "Loading more") {
  setTilesSentinelState({
    hidden: !shouldShowTileSentinel(tileLoadingState()),
    text,
  });
}

function setupTileAutoLoading() {
  resetTileAutoLoading();
  if (!shouldShowTileSentinel(tileLoadingState()) || typeof IntersectionObserver === "undefined") return;
  state.tilesObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    loadMoreTiles();
  }, { rootMargin: "600px 0px" });
  const tilesSentinel = getTilesSentinelElement();
  if (tilesSentinel) state.tilesObserver.observe(tilesSentinel);
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

function goToPage(page: number) {
  state.offset = (page - 1) * state.limit;
  loadItems();
}

function renderPreviewDetails(item: EagleItem) {
  setPreviewInfoState({
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
  setResultSurfaceState({ kind: "message", text, className, viewMode: state.viewMode });
}

function renderEmptyState() {
  setResultSurfaceState({
    kind: "empty",
    hasActiveFilters: hasActiveFilters(state),
    onClearFilters: resetFilters,
    viewMode: state.viewMode,
  });
}

function resetFilters() {
  if (!hasActiveFilters(state)) return;
  Object.assign(state, resetFilterState());
  renderTagChips();
  syncResetFiltersButton();
  syncUrlState();
  loadItems();
}
