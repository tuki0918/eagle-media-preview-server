import { clearTagCovers } from "./viewer/tagCovers";
import { clearFolderCovers } from "./viewer/folderCovers";
import { setTagListState } from "./viewer/tagListState";
import type { TagOverviewResponse } from "./viewer/tagOverview";
import {
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
import { ApiError, debounce, errorMessage, getJson, postJson, setConnectedLibraryId, setMediaFallbackCheck, subscribeRequestOutcome, type RequestOutcome } from "./viewer/api";
import {
  displayFileName,
  applyFolderCountChanges,
  flattenFolders,
  folderCountBaselines,
  folderIds,
  isTimedMedia,
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
import { showOfflinePage } from "./viewer/offlinePage";
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
  HealthResponse,
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
let currentLibraryId = "";
let sessionMaxAgeSeconds = 7 * 24 * 60 * 60;
let allFoldersTotal = 0;
let availableExts: string[] = [];
// Scanning a large library for its extensions takes many Eagle requests, so it waits until the
// type menu is first opened instead of competing with the initial item load.
let itemTypesRequestId = 0;
let itemTypesState: "idle" | "loading" | "loaded" = "idle";
let allFoldersTotalRequestId = 0;
let uncategorizedTotal = 0;
let untaggedTotal = 0;
let tagsTotal = 0;
let shortcutCountsRequestId = 0;
let eagleStatusTimer: ReturnType<typeof setInterval> | null = null;
let eagleStatusRequestId = 0;
let eagleStatusCheckInFlight: Promise<void> | null = null;
// Bumped whenever status polling stops, so work started for an earlier viewer session can tell it ended.
let eagleStatusSession = 0;
let unsubscribeEagleStatusRequests: (() => void) | null = null;
const EAGLE_STATUS_POLL_INTERVAL_MS = 30_000;
// Long enough for Eagle's local API, short enough that a stopped server shows as offline quickly.
const EAGLE_STATUS_TIMEOUT_MS = 5_000;
const pendingRatingItemIds = new Set<string>();
const DEFAULT_DOCUMENT_TITLE = "Media Library";
const OFFLINE_PAGE_TITLE = "Media Library is offline";
const LIBRARY_NOT_SHARED_MESSAGE = "This library isn't shared right now. Please try again later.";
const LIBRARY_CHANGED_MESSAGE = "The media server switched to a different library.";
const changeSearch = debounce((query: string) => {
  applyFilterChange({ query: query.trim() });
  loadTagSuggestions();
}, 220);

export function initViewer() {
  return init();
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
    allItemsOpened: openAllItems,
    mediaTypeChanged: (ext: string) => {
      applyFilterChange({ ext });
    },
    mediaTypesOpened: () => {
      void loadItemTypes();
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
  if (serverReachable) await showOfflinePageIfLibraryNotShared();
}

// Checked at startup so visitors land on the offline page instead of discovering it after Connect.
async function showOfflinePageIfLibraryNotShared() {
  try {
    const data = await getJson<{ libraryStatus?: string | null }>("/api/library-status");
    if (data.libraryStatus === "not_shared") handleLibraryNotShared();
  } catch {
    // Older servers lack this route; Connect still reports an unshared library.
  }
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
    const data = await postJson<ConnectResponse>("/api/connect", {});
    serverReachable = true;
    showViewer(data);
    await Promise.all([loadFolders(), loadSmartFolders(), loadItems(), loadAllFoldersTotal(), loadShortcutCounts()]);
  } catch (error) {
    if (signedInThisAttempt && handlePostLoginAuthError(error)) return;
    if (loginAttempted && !signedInThisAttempt && isLoginAuthFailure(error)) {
      showLogin();
      setConnectMessage(connectErrorMessage(error), true);
      return;
    }
    if (handleAuthError(error)) return;
    if (isLibraryNotSharedError(error)) {
      handleLibraryNotShared();
      return;
    }
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

function isLibraryNotSharedError(error: unknown) {
  return error instanceof ApiError && error.code === "LIBRARY_NOT_SHARED";
}

// The host opened a library that is not shared: drop what was loaded and show the offline page.
function handleLibraryNotShared() {
  clearViewerSessionState();
  showLogin();
  showOfflinePage({ reason: "library-not-shared", title: OFFLINE_PAGE_TITLE, message: LIBRARY_NOT_SHARED_MESSAGE });
}

// Eagle switched to another shared library; folders and items from the old one are invalid,
// so drop them and let the visitor reconnect on purpose.
function handleLibraryChanged() {
  clearViewerSessionState();
  showLogin();
  setConnectMessage(LIBRARY_CHANGED_MESSAGE, false);
}

function libraryChangedSinceConnect(libraryId: string) {
  return Boolean(currentLibraryId && libraryId && libraryId !== currentLibraryId);
}

function connectErrorMessage(error: unknown) {
  if (isLibraryNotSharedError(error)) return LIBRARY_NOT_SHARED_MESSAGE;
  const message = errorMessage(error);
  if (isEagleConnectionError(error, message)) {
    return "Can't reach the media server right now. Please try again in a bit.";
  }
  if (error instanceof ApiError && error.status >= 500) {
    return "The media server isn't responding right now. Please try again in a bit.";
  }
  return message;
}

function loadErrorMessage(error: unknown) {
  if (isLibraryNotSharedError(error)) {
    return {
      title: "Library not shared",
      text: "The library open on the media server isn't shared.",
      detail: "Please try again later.",
    };
  }
  const message = errorMessage(error);
  if (isEagleConnectionError(error, message)) {
    return {
      title: "Media server unavailable",
      text: "Couldn't load items from the media server.",
      detail: "Please try again in a bit.",
    };
  }
  if (error instanceof ApiError && error.status >= 500) {
    return {
      title: "Unable to load this library",
      text: "Something went wrong while loading items.",
      detail: "Please try again in a bit.",
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
  currentLibraryId = data.library?.id || "";
  setConnectedLibraryId(currentLibraryId);
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
  itemTypesRequestId += 1;
  itemTypesState = "idle";
  resetViewerResults({ resetOffset: true });
  renderMessage("");
  resetTagList();
  Object.assign(state, resetFilterState());
  hideTagSuggestions();
  resetTileAutoLoading();
  closePreview({ skipHistory: true });
  syncUrlState({ replace: true });
  setLibraryFooterName("");
  setLibraryName("");
  currentLibraryId = "";
  setConnectedLibraryId("");
  stopEagleStatusPolling();
  renderTagChips();
  renderSearchControlButtons();
  updateStatus();
  updatePager();
}

function resetViewerResults({ resetOffset = false }: { resetOffset?: boolean } = {}) {
  clearFolderCovers();
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
  setMediaFallbackCheck(async () => {
    const libraryId = currentLibraryId;
    const session = eagleStatusSession;
    if (getShellView() !== "viewer") return false;
    // Health checks pause while the tab is hidden, so decide once it is shown again
    // rather than leaving an image that failed in the background broken for good.
    await whenDocumentVisible();
    // Sign-out or a library switch while waiting ends this viewer session; never
    // send a health request on its behalf.
    if (session !== eagleStatusSession || getShellView() !== "viewer") return false;
    await checkEagleStatus();
    return getShellView() === "viewer" && getEagleStatus() === "online" && currentLibraryId === libraryId;
  });
  eagleStatusTimer = setInterval(checkEagleStatus, EAGLE_STATUS_POLL_INTERVAL_MS);
  unsubscribeEagleStatusRequests = subscribeRequestOutcome(recheckEagleStatusAfterRequest);
  document.addEventListener("error", recheckEagleStatusAfterMediaError, true);
  document.addEventListener("visibilitychange", checkEagleStatusWhenVisible);
  window.addEventListener("online", checkEagleStatus);
}

function stopEagleStatusPolling() {
  eagleStatusRequestId += 1;
  eagleStatusSession += 1;
  eagleStatusCheckInFlight = null;
  releaseDocumentVisibleWaiters();
  setMediaFallbackCheck(async () => false);
  if (eagleStatusTimer) clearInterval(eagleStatusTimer);
  eagleStatusTimer = null;
  unsubscribeEagleStatusRequests?.();
  unsubscribeEagleStatusRequests = null;
  document.removeEventListener("error", recheckEagleStatusAfterMediaError, true);
  document.removeEventListener("visibilitychange", checkEagleStatusWhenVisible);
  window.removeEventListener("online", checkEagleStatus);
  setEagleStatus("checking");
}

let documentVisible: { promise: Promise<void>; release: () => void } | null = null;

// One shared listener serves every media error that waits for the tab to be shown.
function whenDocumentVisible(): Promise<void> {
  if (document.visibilityState !== "hidden") return Promise.resolve();
  if (!documentVisible) {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    const onChange = () => {
      if (document.visibilityState !== "hidden") release();
    };
    const release = () => {
      document.removeEventListener("visibilitychange", onChange);
      documentVisible = null;
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
    documentVisible = { promise, release };
  }
  return documentVisible.promise;
}

// Lets waiters finish (they then see the ended session) and drops the listener.
function releaseDocumentVisibleWaiters() {
  documentVisible?.release();
}

function checkEagleStatusWhenVisible() {
  if (document.visibilityState === "visible") void checkEagleStatus();
}

// Reacts to regular API traffic so the dot changes without waiting for the next poll.
function recheckEagleStatusAfterRequest({ libraryId, ok, status, url }: RequestOutcome) {
  if (libraryChangedSinceConnect(libraryId)) {
    handleLibraryChanged();
    return;
  }
  if (url.startsWith("/api/health")) return;
  // 409 means the server refused an answer because Eagle switched libraries mid-request.
  if (status === 409) {
    void checkEagleStatus();
    return;
  }
  const failedLikeOffline = !ok && (status === 0 || status >= 500);
  const current = getEagleStatus();
  if ((failedLikeOffline && current !== "offline") || (ok && current === "offline")) {
    void checkEagleStatus();
  }
}

// Media elements hide the server's 409 for a switched library, so a failed load of a pinned media
// URL triggers a status check; health then reports the new library id.
function recheckEagleStatusAfterMediaError(event: Event) {
  const target = event.target as { currentSrc?: string; src?: string } | null;
  const src = target?.currentSrc || target?.src || "";
  if (typeof src === "string" && /[?&]library=/.test(src)) void checkEagleStatus();
}

function checkEagleStatus(): Promise<void> {
  if (document.visibilityState === "hidden") return Promise.resolve();
  if (eagleStatusCheckInFlight) return eagleStatusCheckInFlight;
  // Timers, event listeners and media fallbacks share this promise and some ignore it,
  // so it must never reject; performEagleStatusCheck already reports failures as status.
  const check = performEagleStatusCheck().catch(() => {});
  eagleStatusCheckInFlight = check;
  void check.finally(() => {
    if (eagleStatusCheckInFlight === check) eagleStatusCheckInFlight = null;
  });
  return check;
}

async function performEagleStatusCheck() {
  const requestId = ++eagleStatusRequestId;
  try {
    const data = await getJson<HealthResponse>("/api/health", { timeoutMs: EAGLE_STATUS_TIMEOUT_MS });
    if (requestId !== eagleStatusRequestId) return;
    if (data.libraryStatus === "not_shared") {
      handleLibraryNotShared();
      return;
    }
    if (libraryChangedSinceConnect(data.library?.id || "")) {
      handleLibraryChanged();
      return;
    }
    setEagleStatus(data.app ? "online" : "offline");
  } catch (error) {
    if (requestId !== eagleStatusRequestId) return;
    if (handleAuthError(error)) return;
    // The preview server itself being unreachable also means Eagle cannot be reached.
    setEagleStatus("offline");
  }
}

function libraryLabel(data: ConnectResponse) {
  return data.library?.name || LIBRARY_EMPTY_LABEL;
}

function libraryTitle(data: ConnectResponse) {
  const name = data.library?.name || LIBRARY_EMPTY_LABEL;
  return `${name} - Media Library`;
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
  if (itemTypesState !== "idle") return;
  const requestId = ++itemTypesRequestId;
  itemTypesState = "loading";
  renderSearchControlButtons();
  try {
    // The server answers with the extensions found so far until its scan is complete.
    for (;;) {
      const data = await getJson<{ complete?: boolean; items?: Array<{ ext?: string }> }>("/api/item-types");
      if (requestId !== itemTypesRequestId) return;
      availableExts = (data.items || []).map((entry) => String(entry.ext || "").toLowerCase()).filter(Boolean);
      if (data.complete !== false) break;
      renderSearchControlButtons();
    }
    itemTypesState = "loaded";
  } catch (error) {
    if (requestId !== itemTypesRequestId) return;
    // Let the next menu open retry.
    itemTypesState = "idle";
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
  // The browser may answer the preview from its cache, so ask the server whether it is still up
  // and still on the connected library.
  if (eagleStatusTimer) void checkEagleStatus();

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
    availableExtsLoading: itemTypesState === "loading",
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
  // Server messages are technical, so keep them in the console instead of on screen.
  console.error("Failed to load items:", error);
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

function openAllItems() {
  changeSearch.cancel();
  hideTagSuggestions();
  resetTagList();
  state.filtersOpen = false;
  applyFilterChange(resetFilterState());
  renderTagChips();
  renderSearchControlButtons();
  window.scrollTo({ top: 0 });
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
