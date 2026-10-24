import { clearTagCovers } from "./viewer/tagCovers";
import { setTagListState } from "./viewer/tagListState";
import type { TagOverviewResponse } from "./viewer/tagOverview";
import {
  DEFAULT_EAGLE_CONNECTION,
  EAGLE_UNAVAILABLE_LABEL,
  LIBRARY_EMPTY_LABEL,
  RECENT_FOLDERS_STORAGE_KEY,
  RECENT_TAGS_STORAGE_KEY,
  browserImageExts,
  pdfPreviewExts,
  playableAudioExts,
  playableVideoExts,
  textPreviewExts,
  UNCATEGORIZED_FOLDER_ID,
  UNTAGGED_FOLDER_ID,
  urlPreviewExts,
} from "./viewer/constants";
import { ApiError, debounce, errorMessage, getJson, postJson, subscribeRequestOutcome, type RequestOutcome } from "./viewer/api";
import {
  displayFileName,
  applyFolderCountChanges,
  flattenFolders,
  folderCountBaselines,
  folderIds,
  isTimedMedia,
  itemMeta,
  normalizeRating,
  normalizeTag,
  originalFileName,
  previewFileName,
} from "./viewer/format";
import { hasActiveFilters, hasResettableFilters, resetFilterState } from "./viewer/filters";
import { itemMatchesFolderFilter, itemQueryParams } from "./viewer/itemQuery";
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
import { getEagleStatus, setEagleStatus } from "./viewer/eagleStatusState";
import { setLibraryName } from "./viewer/libraryNameState";
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
  getPreviewDialogState,
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
import { showErrorToast, showSuccessToast } from "./viewer/toasts";
import {
  canLoadMoreTiles,
  shouldShowTileSentinel,
  tileSentinelText,
} from "./viewer/tileLoading";
import type {
  ConnectResponse,
  AuthStatusResponse,
  EagleItem,
  ItemPatch,
  LoadFoldersResponse,
  LoadItemsOptions,
  LoadItemsResponse,
  LoadSmartFoldersResponse,
  OpenPreviewOptions,
  TagSuggestionApiItem,
  ViewerPermissions,
} from "./viewer/types";
import { buildViewerUrl, currentPage, parseViewerUrlState } from "./viewer/urlState";
import {
  isViewerMode,
  needsViewModeReload,
  readSavedViewerMode,
  writeSavedViewerMode,
} from "./viewer/viewMode";

let connectMessageText = "";
let connectMessageIsError = false;
let connectBusy = false;
let authAuthenticated = false;
let authRequired = false;
let authUser: NonNullable<AuthStatusResponse["user"]> | null = null;
let serverReachable = true;
let sessionMaxAgeSeconds = 7 * 24 * 60 * 60;
let allFoldersTotal = 0;
let availableExts: string[] = [];
let allFoldersTotalRequestId = 0;
let uncategorizedTotal = 0;
let untaggedTotal = 0;
let tagsTotal = 0;
let shortcutCountsRequestId = 0;
let eagleStatusTimer: ReturnType<typeof setInterval> | null = null;
let eagleStatusRequestId = 0;
let eagleStatusCheckInFlight = false;
let unsubscribeEagleStatusRequests: (() => void) | null = null;
const EAGLE_STATUS_POLL_INTERVAL_MS = 30_000;
const pendingRatingItemIds = new Set<string>();
const DEFAULT_DOCUMENT_TITLE = "Media Preview Server";
const changeSearch = debounce((query: string) => {
  applyFilterChange({ query: query.trim() });
  loadTagSuggestions();
}, 220);

export function initViewer() {
  init();
}

async function init() {
  restoreUrlState();
  restoreViewMode();
  await loadAuthStatus();
  setViewerShellActions({
    connect,
    logout,
    urlPopped: () => {
      changeSearch.cancel();
      restoreUrlState();
      applyControlsFromState();
      if (getShellView() !== "viewer") return;
      loadItems();
    },
    searchChanged: changeSearch,
    searchFocused: (query: string) => {
      if (query.trim()) loadTagSuggestions();
    },
    searchKeyDown: (key: string) => {
      if (key === "Escape") {
        hideTagSuggestions();
      }
    },
    searchOutsidePointerDown: (target) => {
      const element = target as Element | null;
      if (element?.closest(".search-box")) return;
      hideTagSuggestions();
      // The toggle button handles its own click, so closing here would just reopen the panel.
      if (!state.filtersOpen || element?.closest(".controls, #toggleFiltersButton, [data-filter-menu]")) return;
      state.filtersOpen = false;
      syncAdvancedFiltersUi();
      syncUrlState();
    },
    folderChanged: (folderId: string) => {
      applyFilterChange({ folderId, smartFolderId: "" });
    },
    smartFolderChanged: (smartFolderId: string) => {
      // Smart folders ignore search and filters, so their panel can't stay open.
      if (smartFolderId) state.filtersOpen = false;
      applyFilterChange({ folderId: "", smartFolderId });
    },
    tagsOpened: openTagList,
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
      if (state.smartFolderId) return;
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
    stepPreview,
    togglePreviewInfo,
    previewPointerDown: closePreviewInfoFromOutside,
    previewClosed: () => {
      if (isPreviewDialogOpen()) {
        closePreview();
        return;
      }
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

async function connect(credentials?: { password: string; username: string }) {
  setConnectMessage(authRequired && !authAuthenticated ? "Signing in" : "Connecting", false);
  setConnectBusy(true);
  let loginAttempted = false;
  let signedInThisAttempt = false;

  try {
    if (authRequired && !authAuthenticated) {
      const username = String(credentials?.username || "").trim();
      const password = String(credentials?.password || "");
      if (!username || !password) {
        throw new Error("Enter username and password.");
      }
      loginAttempted = true;
      const login = await postJson<AuthStatusResponse>("/api/auth/login", { username, password });
      authAuthenticated = Boolean(login.authenticated);
      authUser = login.user ?? null;
      sessionMaxAgeSeconds = normalizeSessionMaxAgeSeconds(login.sessionMaxAgeSeconds);
      state.permissions = normalizePermissions(login.permissions, authAuthenticated);
      signedInThisAttempt = authAuthenticated;
      renderLoginConnect();
      setConnectMessage("Connecting", false);
    }
    const connection = { ...DEFAULT_EAGLE_CONNECTION };
    const data = await postJson<ConnectResponse>("/api/connect", connection);
    serverReachable = true;
    showViewer(data);
    await Promise.all([loadFolders(), loadSmartFolders(), loadItems(), loadAllFoldersTotal(), loadShortcutCounts(), loadItemTypes()]);
  } catch (error) {
    if (signedInThisAttempt && handlePostLoginAuthError(error)) return;
    if (loginAttempted && !signedInThisAttempt && isLoginAuthFailure(error)) {
      showLogin();
      setConnectMessage(connectErrorMessage(error), true);
      return;
    }
    if (handleAuthError(error)) return;
    if (isEagleConnectionError(error)) serverReachable = false;
    showLogin();
    setConnectMessage(connectErrorMessage(error), true);
  } finally {
    setConnectBusy(false);
  }
}

async function logout() {
  changeSearch.cancel();
  setConnectMessage("", false);
  setConnectBusy(true);
  try {
    const logoutStatus = await postJson<AuthStatusResponse>("/api/auth/logout", {});
    const nextAuthRequired = Boolean(logoutStatus.required);
    clearAuthState(nextAuthRequired);
    sessionMaxAgeSeconds = normalizeSessionMaxAgeSeconds(logoutStatus.sessionMaxAgeSeconds);
    state.permissions = normalizePermissions(logoutStatus.permissions, !nextAuthRequired);
    clearViewerSessionState();
    renderLoginConnect();
    showLogin();
  } catch (error) {
    setConnectMessage(errorMessage(error), true);
  } finally {
    setConnectBusy(false);
  }
}

async function loadAuthStatus() {
  try {
    const data = await getJson<AuthStatusResponse>("/api/auth/status");
    serverReachable = true;
    authAuthenticated = Boolean(data.authenticated);
    authRequired = Boolean(data.required);
    authUser = data.user ?? null;
    sessionMaxAgeSeconds = normalizeSessionMaxAgeSeconds(data.sessionMaxAgeSeconds);
    state.permissions = normalizePermissions(data.permissions, !authRequired || authAuthenticated);
  } catch {
    serverReachable = false;
    clearAuthState(false);
  }
  renderLoginConnect();
}

function defaultPermissions(read = true): ViewerPermissions {
  return {
    manageLibrary: false,
    read,
    writeMetadata: false,
    writeRating: false,
  };
}

function normalizePermissions(value: AuthStatusResponse["permissions"], readFallback = true): ViewerPermissions {
  return {
    ...defaultPermissions(readFallback),
    manageLibrary: Boolean(value?.manageLibrary),
    read: Boolean(value?.read ?? readFallback),
    writeMetadata: Boolean(value?.writeMetadata),
    writeRating: Boolean(value?.writeRating),
  };
}

function normalizeSessionMaxAgeSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 7 * 24 * 60 * 60;
}

function clearAuthState(nextAuthRequired: boolean) {
  authAuthenticated = false;
  authRequired = nextAuthRequired;
  authUser = null;
  state.permissions = defaultPermissions(!authRequired);
}

function handleAuthError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  clearAuthState(true);
  clearViewerSessionState();
  renderLoginConnect();
  showLogin();
  setConnectMessage("Your session expired. Sign in again.", true);
  return true;
}

function handlePostLoginAuthError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  clearAuthState(true);
  clearViewerSessionState();
  renderLoginConnect();
  showLogin();
  setConnectMessage("Sign-in succeeded, but the browser did not keep the session cookie. Allow cookies for this address and try again.", true);
  return true;
}

function isLoginAuthFailure(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function connectErrorMessage(error: unknown) {
  const message = errorMessage(error);
  if (isEagleConnectionError(error, message)) {
    return "Cannot connect to Eagle. Make sure Eagle is running and the local Eagle API is available.";
  }
  if (error instanceof ApiError && error.status >= 500) {
    return "The preview server could not reach Eagle. Check Eagle, then try connecting again.";
  }
  return message;
}

function loadErrorMessage(error: unknown) {
  const message = errorMessage(error);
  if (isEagleConnectionError(error, message)) {
    return {
      title: "Eagle connection lost",
      text: "The preview server could not reach Eagle while loading items.",
      detail: "Make sure Eagle is running on this computer, then reconnect from the login screen if the problem continues.",
    };
  }
  if (error instanceof ApiError && error.status >= 500) {
    return {
      title: "Unable to load this library",
      text: "Eagle returned an error while the preview server was loading items.",
      detail: message,
    };
  }
  return {
    title: "Unable to load items",
    text: message,
    detail: "",
  };
}

function isEagleConnectionError(error: unknown, message = errorMessage(error)) {
  if (error instanceof ApiError && error.status === 502) return true;
  return /unable to connect to eagle api|eagle unavailable|econnrefused|failed to fetch|networkerror/i.test(message);
}

function showLogin() {
  document.title = DEFAULT_DOCUMENT_TITLE;
  setShellView("login");
  stopEagleStatusPolling();
}

function showViewer(data: ConnectResponse) {
  setShellView("viewer");
  setLibraryFooterName(libraryLabel(data));
  setLibraryName(data.library?.name || "");
  setEagleStatus(data.app ? "online" : "offline");
  startEagleStatusPolling();
  document.title = libraryTitle(data);
  resetViewerResults();
  resetTagList();
  renderSearchControlButtons();
  applyControlsFromState();
  updateStatus();
  updatePager();
}

function clearViewerSessionState() {
  changeSearch.cancel();
  state.requestId += 1;
  allFoldersTotalRequestId += 1;
  allFoldersTotal = 0;
  shortcutCountsRequestId += 1;
  uncategorizedTotal = 0;
  untaggedTotal = 0;
  tagsTotal = 0;
  availableExts = [];
  resetViewerResults({ resetOffset: true });
  Object.assign(state, resetFilterState());
  hideTagSuggestions();
  resetTileAutoLoading();
  closePreview({ skipHistory: true });
  syncUrlState({ replace: true });
  setLibraryFooterName("");
  setLibraryName("");
  stopEagleStatusPolling();
  renderTagChips();
  renderSearchControlButtons();
  updateStatus();
  updatePager();
}

function resetViewerResults({ resetOffset = false }: { resetOffset?: boolean } = {}) {
  pendingRatingItemIds.clear();
  state.tilesLoadingMore = false;
  state.items = [];
  state.folders = [];
  state.smartFolders = [];
  state.total = 0;
  if (resetOffset) state.offset = 0;
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
    authenticated: authAuthenticated,
    authRequired,
    disabled: connectBusy,
    isError: connectMessageIsError,
    message: connectMessageText,
    serverStatus: serverReachable ? "online" : "error",
    sessionMaxAgeSeconds,
    user: authUser,
  });
}

function startEagleStatusPolling() {
  if (eagleStatusTimer) return;
  eagleStatusTimer = setInterval(checkEagleStatus, EAGLE_STATUS_POLL_INTERVAL_MS);
  unsubscribeEagleStatusRequests = subscribeRequestOutcome(recheckEagleStatusAfterRequest);
  document.addEventListener("visibilitychange", checkEagleStatusWhenVisible);
  window.addEventListener("online", checkEagleStatus);
}

function stopEagleStatusPolling() {
  eagleStatusRequestId += 1;
  eagleStatusCheckInFlight = false;
  if (eagleStatusTimer) clearInterval(eagleStatusTimer);
  eagleStatusTimer = null;
  unsubscribeEagleStatusRequests?.();
  unsubscribeEagleStatusRequests = null;
  document.removeEventListener("visibilitychange", checkEagleStatusWhenVisible);
  window.removeEventListener("online", checkEagleStatus);
  setEagleStatus("checking");
}

function checkEagleStatusWhenVisible() {
  if (document.visibilityState === "visible") void checkEagleStatus();
}

// Reacts to regular API traffic so the dot changes without waiting for the next poll.
function recheckEagleStatusAfterRequest({ ok, status, url }: RequestOutcome) {
  if (url.startsWith("/api/health")) return;
  const failedLikeOffline = !ok && (status === 0 || status >= 500);
  const current = getEagleStatus();
  if ((failedLikeOffline && current !== "offline") || (ok && current === "offline")) {
    void checkEagleStatus();
  }
}

async function checkEagleStatus() {
  if (document.visibilityState === "hidden" || eagleStatusCheckInFlight) return;
  const requestId = ++eagleStatusRequestId;
  eagleStatusCheckInFlight = true;
  try {
    const data = await getJson<{ app?: unknown }>("/api/health");
    if (requestId !== eagleStatusRequestId) return;
    setEagleStatus(data.app ? "online" : "offline");
  } catch (error) {
    if (requestId !== eagleStatusRequestId) return;
    if (handleAuthError(error)) return;
    // The preview server itself being unreachable also means Eagle cannot be reached.
    setEagleStatus("offline");
  } finally {
    if (requestId === eagleStatusRequestId) eagleStatusCheckInFlight = false;
  }
}

function libraryLabel(data: ConnectResponse) {
  const name = data.library?.name || LIBRARY_EMPTY_LABEL;
  const version = data.app?.version ? `Eagle ${data.app.version}` : EAGLE_UNAVAILABLE_LABEL;
  return `${name} - ${version}`;
}

function libraryTitle(data: ConnectResponse) {
  const name = data.library?.name || LIBRARY_EMPTY_LABEL;
  return `${name} - Media Preview Server`;
}

async function loadFolders() {
  try {
    const data = await getJson<LoadFoldersResponse>("/api/folders");
    state.folders = flattenFolders(data.items);
    renderSearchControlButtons();
  } catch (error) {
    if (handleAuthError(error)) return;
    state.folders = [];
    // Folder loading is optional; item browsing still works without it.
  }
}

async function loadItemTypes() {
  try {
    const data = await getJson<{ items?: Array<{ ext?: string }> }>("/api/item-types");
    availableExts = (data.items || []).map((entry) => String(entry.ext || "").toLowerCase()).filter(Boolean);
  } catch (error) {
    if (handleAuthError(error)) return;
    availableExts = [];
  }
  renderSearchControlButtons();
}

async function loadSmartFolders() {
  try {
    const data = await getJson<LoadSmartFoldersResponse>("/api/smart-folders");
    state.smartFolders = flattenFolders(data.items);
    renderSearchControlButtons();
  } catch (error) {
    if (handleAuthError(error)) return;
    state.smartFolders = [];
    renderSearchControlButtons();
  }
}

async function loadItems({ append = false }: LoadItemsOptions = {}) {
  if (state.section === "tags") {
    await Promise.all([loadTagOverview(), loadAllFoldersTotal()]);
    return;
  }
  const requestId = ++state.requestId;
  if (append) {
    state.tilesLoadingMore = true;
  } else {
    resetTileAutoLoading();
    state.tilesLoadingMore = false;
    state.items = [];
    renderMessage("Loading", "loading");
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
    if (!append && !hasActiveFilters(state)) {
      const previousAllFoldersTotal = allFoldersTotal;
      allFoldersTotal = state.total;
      if (previousAllFoldersTotal !== allFoldersTotal) renderSearchControlButtons();
    } else if (!append) {
      loadAllFoldersTotal();
    }
    if (append && !items.length) {
      state.total = state.items.length;
    }
    state.items = append ? [...state.items, ...items] : items;
    state.tilesLoadingMore = false;
    if (append) {
      render();
    } else {
      render();
      refreshOpenedFolderCounts();
      if (state.viewMode === "tiles" && new URLSearchParams(window.location.search).has("page")) {
        syncUrlState({ replace: true });
      }
    }
    syncPreviewFromState();
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (handleAuthError(error)) return;
    state.tilesLoadingMore = false;
    if (append) {
      renderTilesSentinel(errorMessage(error));
      updatePager();
      return;
    }
    state.items = [];
    state.total = 0;
    renderLoadError(error);
    updateStatus();
    updatePager();
    setupTileAutoLoading();
  }
}

async function loadAllFoldersTotal() {
  if (allFoldersTotal > 0 || (!hasActiveFilters(state) && state.section !== "tags")) return;
  const requestId = ++allFoldersTotalRequestId;
  try {
    const params = new URLSearchParams({ offset: "0", limit: "1" });
    const data = await getJson<LoadItemsResponse>(`/api/items?${params.toString()}`);
    if (requestId !== allFoldersTotalRequestId) return;
    const previousAllFoldersTotal = allFoldersTotal;
    allFoldersTotal = Number(data.total || 0);
    if (previousAllFoldersTotal !== allFoldersTotal) renderSearchControlButtons();
  } catch (error) {
    if (requestId === allFoldersTotalRequestId) handleAuthError(error);
  }
}

// Totals for the sidebar shortcuts; each request asks for a single item and reads only `total`.
async function loadShortcutCounts() {
  const requestId = ++shortcutCountsRequestId;
  const itemsTotal = (folderId: string) =>
    getJson<LoadItemsResponse>(`/api/items?${new URLSearchParams({ offset: "0", limit: "1", folderId }).toString()}`);
  const [uncategorized, untagged, tags] = await Promise.allSettled([
    itemsTotal(UNCATEGORIZED_FOLDER_ID),
    itemsTotal(UNTAGGED_FOLDER_ID),
    getJson<{ total?: number }>(`/api/tags?${new URLSearchParams({ limit: "1" }).toString()}`),
  ]);
  if (requestId !== shortcutCountsRequestId) return;
  for (const result of [uncategorized, untagged, tags]) {
    if (result.status === "rejected" && handleAuthError(result.reason)) return;
  }
  uncategorizedTotal = uncategorized.status === "fulfilled" ? Number(uncategorized.value.total || 0) : 0;
  untaggedTotal = untagged.status === "fulfilled" ? Number(untagged.value.total || 0) : 0;
  tagsTotal = tags.status === "fulfilled" ? Number(tags.value.total || 0) : 0;
  renderSearchControlButtons();
}

function refreshOpenedFolderCounts() {
  if (state.smartFolderId) {
    void loadSmartFolders();
  } else if (state.folderId) {
    void loadFolders();
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

function openPreview(item: EagleItem, { replaceHistory = false, skipHistory = false }: OpenPreviewOptions = {}) {
  state.previewItemId = String(item.id || "");
  setPreviewTextState({
    displayName: displayFileName(item),
    meta: itemMeta(item),
    originalName: originalFileName(item),
  });
  clearPreviewBodyState();
  renderPreviewRating(item);
  renderPreviewDetails(item);

  const { kind, srcKind } = previewBodyForItem(item);
  const index = state.items.findIndex((entry) => entry.id === item.id);
  setPreviewDialogState({
    hasNext: index >= 0 && index < state.items.length - 1,
    hasPrevious: index > 0,
    infoOpen: state.previewInfoOpen,
    mode: kind,
    open: true,
  });
  setPreviewBodyState({ item, kind, srcKind });

  if (!skipHistory) syncUrlState({ replace: replaceHistory });
}

function stepPreview(delta: number) {
  if (!state.previewItemId) return;
  const index = state.items.findIndex((entry) => entry.id === state.previewItemId);
  const next = index >= 0 ? state.items[index + delta] : undefined;
  if (next) openPreview(next, { replaceHistory: true });
}

function previewBodyForItem(item: EagleItem): { kind: PreviewBodyKind; srcKind?: "file" | "thumb" } {
  const ext = (item.ext || "").toLowerCase();
  if (playableVideoExts.has(ext)) return { kind: "video" };
  if (playableAudioExts.has(ext)) return { kind: "audio" };
  if (textPreviewExts.has(ext)) return { kind: "text" };
  if (pdfPreviewExts.has(ext)) return { kind: "pdf" };
  if (urlPreviewExts.has(ext)) return { kind: "url" };
  if (isTimedMedia(item)) return { kind: "unsupported" };
  return { kind: "image", srcKind: browserImageExts.has(ext) ? "file" : "thumb" };
}

function setViewMode(mode: string) {
  if (!isViewerMode(mode)) return;
  if (state.viewMode === mode) return;
  const previousMode = state.viewMode;
  state.viewMode = mode;
  writeSavedViewerMode(mode);
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
  state.viewMode = readSavedViewerMode();
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

function applyFilterChange(patch: Partial<Pick<typeof state, "query" | "tags" | "folderId" | "smartFolderId" | "ext" | "rating" | "limit">>) {
  Object.assign(state, patch, { offset: 0, section: "items" });
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
  } catch (error) {
    if (requestId === state.tagSuggestionsRequestId && handleAuthError(error)) return;
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
    allFoldersTotal,
    availableExts,
    tagsTotal,
    uncategorizedTotal,
    untaggedTotal,
    filtersOpen: state.filtersOpen,
    folders: state.folders,
    hasActiveFilters: hasActiveFilters(state),
    hasResettableFilters: hasResettableFilters(state),
    searchQuery: state.query,
    section: state.section,
    selectedExt: state.ext,
    selectedFolderId: state.folderId,
    selectedLimit: state.limit,
    selectedRating: state.rating,
    selectedSmartFolderId: state.smartFolderId,
    smartFolders: state.smartFolders,
  });
}

function resetPreviewState() {
  if (!state.previewItemId && !state.previewInfoOpen) return;
  state.previewItemId = "";
  state.previewInfoOpen = false;
  if (isPreviewDialogOpen()) {
    closePreview({ skipHistory: true });
  }
}

function syncPreviewFromState() {
  if (!state.previewItemId) {
    if (isPreviewDialogOpen()) closePreview({ skipHistory: true });
    return;
  }
  const item = state.items.find((entry) => entry.id === state.previewItemId);
  if (!item) {
    if (isPreviewDialogOpen()) closePreview({ skipHistory: true });
    return;
  }
  openPreview(item, { skipHistory: true });
}

function clearPreviewContents() {
  clearPreviewInfoState();
  clearPreviewBodyState();
  clearPreviewRatingState();
  setPreviewTextState({
    displayName: "",
    meta: "",
    originalName: "",
  });
}

async function setItemStar(item: EagleItem, star: number) {
  if (!state.permissions.writeRating) return;
  const itemId = String(item.id || "");
  if (!itemId || pendingRatingItemIds.has(itemId)) return;
  const previous = normalizeRating(item.star);
  pendingRatingItemIds.add(itemId);
  item.star = star;
  updateItemInState(itemId, { star });
  render();
  if (isCurrentPreviewItem(itemId)) renderPreviewRating(item);

  try {
    const data = await postJson<{ star?: unknown }>(`/api/items/${encodeURIComponent(itemId)}/star`, { star });
    const savedStar = normalizeRating(data.star ?? star);
    item.star = savedStar;
    updateItemInState(itemId, { star: savedStar });
    showSuccessToast("Rating saved", {
      description: ratingSavedDescription(savedStar),
    });
  } catch (error) {
    item.star = previous;
    updateItemInState(itemId, { star: previous });
    if (handleAuthError(error)) return;
    showErrorToast("Unable to save rating", {
      description: errorMessage(error),
    });
  } finally {
    pendingRatingItemIds.delete(itemId);
    render();
    if (isCurrentPreviewItem(itemId)) renderPreviewRating(item);
  }
}

function renderPreviewRating(item: EagleItem) {
  setPreviewRatingState({
    canEdit: state.permissions.writeRating,
    item,
    onSelect: (star) => setItemStar(item, star),
    saving: pendingRatingItemIds.has(String(item.id || "")),
  });
}

function ratingSavedDescription(star: number) {
  if (star <= 0) return "Rating was cleared.";
  return `Rating was set to ${star}.`;
}

function isPreviewDialogOpen() {
  return getPreviewDialogState().open;
}

function isCurrentPreviewItem(itemId: string) {
  return isPreviewDialogOpen() && state.previewItemId === itemId;
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
  const pageCount = totalPages(state.total, state.limit);
  setPagerState({
    current,
    hidden: isTiles || (pageCount <= 1 && state.offset <= 0),
    nextDisabled: state.offset + state.limit >= state.total,
    onSelectPage: goToPage,
    pages: pageButtonList(current, pageCount),
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
  resetPreviewState();
  syncUrlState();
  loadItems();
}

function renderPreviewDetails(item: EagleItem) {
  setPreviewInfoState({
    item,
    detailRows: previewDetailRows(item),
    canEditMetadata: state.permissions.writeMetadata,
    canManageLibrary: state.permissions.manageLibrary,
    folders: state.folders,
    onTagSuggestions: tagSuggestionItems,
    onFolderSuggestions: folderSuggestionItems,
    onSaveMetadata: savePreviewMetadata,
    onToggleTrash: setItemTrash,
  });
}

async function setItemTrash(item: EagleItem, isDeleted: boolean) {
  if (!state.permissions.manageLibrary) {
    throw new Error("Admin actions are not allowed for this viewer");
  }
  const itemId = String(item.id || "");
  if (!itemId) return;
  const previous = Boolean(item.isDeleted);
  item.isDeleted = isDeleted;
  updateItemInState(itemId, { isDeleted });
  render();
  if (isCurrentPreviewItem(itemId)) renderPreviewDetails(item);
  try {
    const data = await postJson<{ isDeleted?: unknown }>(`/api/items/${encodeURIComponent(itemId)}/trash`, { isDeleted });
    const savedIsDeleted = typeof data.isDeleted === "boolean" ? data.isDeleted : isDeleted;
    item.isDeleted = savedIsDeleted;
    updateItemInState(itemId, { isDeleted: savedIsDeleted });
    showSuccessToast(savedIsDeleted ? "Moved to trash" : "Restored from trash", {
      description: savedIsDeleted ? "Item was moved to trash." : "Item was restored from trash.",
    });
  } catch (error) {
    item.isDeleted = previous;
    updateItemInState(itemId, { isDeleted: previous });
    if (handleAuthError(error)) return;
    showErrorToast(isDeleted ? "Unable to move to trash" : "Unable to restore from trash", {
      description: errorMessage(error),
    });
    throw error;
  } finally {
    render();
    if (isCurrentPreviewItem(itemId)) renderPreviewDetails(item);
  }
}

async function savePreviewMetadata(item: EagleItem, { tags, folders }: { tags: string[]; folders: string[] }) {
  if (!state.permissions.writeMetadata) {
    throw new Error("Metadata editing is not allowed for this viewer");
  }
  const previousFolderIds = folderIds(item.folders);
  const folderBaselines = folderCountBaselines(state.folders);
  const itemId = String(item.id || "");
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
    updateItemInState(itemId, patch);
    removeItemIfOutsideCurrentFolderFilter(item);
    applyMetadataFolderCountChanges(previousFolderIds, patch.folders);
    render();
    await loadFolders();
    applyMetadataFolderCountChanges(previousFolderIds, patch.folders, folderBaselines);
    void loadShortcutCounts();
    if (isCurrentPreviewItem(itemId)) renderPreviewDetails(item);
    return patch;
  } catch (error) {
    handleAuthError(error);
    throw error instanceof Error ? error : new Error(errorMessage(error));
  }
}

function removeItemIfOutsideCurrentFolderFilter(item: EagleItem) {
  if (itemMatchesFolderFilter(item, state)) return;
  const itemId = String(item.id || "");
  const previousLength = state.items.length;
  state.items = state.items.filter((entry) => String(entry.id || "") !== itemId);
  if (state.items.length !== previousLength) {
    state.total = Math.max(0, state.total - (previousLength - state.items.length));
  }
}

function applyMetadataFolderCountChanges(
  previousFolderIds: readonly string[],
  nextFolderIds: readonly string[],
  baselines?: ReadonlyMap<string, number>,
) {
  state.folders = applyFolderCountChanges(state.folders, previousFolderIds, nextFolderIds, baselines);
  renderSearchControlButtons();
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
    .catch((error) => {
      handleAuthError(error);
      return buildTagSuggestionItems({ query, selectedValues, recentTags });
    });
}

function folderSuggestionItems(query: string, selectedValues: string[]) {
  return buildFolderSuggestionItems({
    query,
    selectedValues,
    recentFolderIds: readRecentList(RECENT_FOLDERS_STORAGE_KEY),
    folders: state.folders,
  });
}

function renderLoadError(error: unknown) {
  const message = loadErrorMessage(error);
  setResultSurfaceState({
    kind: "message",
    className: "error",
    title: message.title,
    text: message.text,
    detail: message.detail,
    viewMode: state.viewMode,
  });
}

function renderMessage(text: string, className = "empty") {
  setResultSurfaceState({ kind: "message", text, className, viewMode: state.viewMode });
}

function renderEmptyState() {
  setResultSurfaceState({
    kind: "empty",
    hasActiveFilters: hasActiveFilters(state),
    hasClearableFilters: hasResettableFilters(state),
    onClearFilters: resetFilters,
    viewMode: state.viewMode,
  });
}

function openTagList() {
  changeSearch.cancel();
  hideTagSuggestions();
  state.requestId += 1;
  Object.assign(state, resetFilterState(), { section: "tags", filtersOpen: false });
  resetPreviewState();
  resetTileAutoLoading();
  renderTagChips();
  renderSearchControlButtons();
  syncUrlState();
  void loadTagOverview();
}

function selectTagFromList(tag: string) {
  applyFilterChange({ query: "", tags: [tag], folderId: "", smartFolderId: "" });
  renderTagChips();
  renderSearchControlButtons();
  window.scrollTo({ top: 0 });
}

let tagOverviewRequestId = 0;

async function loadTagOverview() {
  const requestId = ++tagOverviewRequestId;
  renderSearchControlButtons();
  setTagListState({ error: "", onSelectTag: selectTagFromList, query: "", status: "loading" });
  try {
    const overview = await getJson<TagOverviewResponse>("/api/tag-overview");
    if (requestId !== tagOverviewRequestId) return;
    clearTagCovers();
    setTagListState({ overview, status: "ready" });
  } catch (error) {
    if (requestId !== tagOverviewRequestId) return;
    if (handleAuthError(error)) return;
    setTagListState({ error: errorMessage(error), status: "error" });
  }
}

function resetTagList() {
  tagOverviewRequestId += 1;
  clearTagCovers();
  setTagListState({ error: "", overview: null, status: "idle" });
}

function resetFilters() {
  if (!hasResettableFilters(state)) return;
  Object.assign(state, resetFilterState(state));
  renderTagChips();
  syncResetFiltersButton();
  syncUrlState();
  loadItems();
}
