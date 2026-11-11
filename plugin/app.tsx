import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import qrcodeFactory from "qrcode-generator";
import { AccessLogPanel, accessLogSearchKeys, RECENT_EVENT_LIMIT } from "./components/AccessLogPanel";
import { CloseIcon } from "./components/Icons";
import { ServerStatusPanel } from "./components/ServerStatusPanel";
import { authUserKey, SettingsForm, type HttpsFileField } from "./components/SettingsForm";
import { serverRestartSettingsChanged, settingsPayloadChanged } from "./settingsChange";
import type { AiStatus, AccessLogEventFilter, AccessLogFilter, AccessLogRange, AccessLogSearchKeys, AccessLogSummary, AuthUser, LibraryCandidate, LibraryList, PluginSettings, PluginStatus, ServerState, SettingsTab, SharedLibrary, UserRole } from "./types";

interface ServerManager {
  accessLogConnectedCount?(): number;
  accessLogPath?(): string;
  aiStatus?(input?: { reload?: boolean }): AiStatus;
  openAiSettings?(): void;
  accessLogSummary?(input: { filters?: AccessLogFilter[]; limit?: number; range: AccessLogRange; search?: string; searchKeys?: AccessLogSearchKeys; type?: string }): Promise<AccessLogSummary>;
  blockAddress?(address: string): Promise<PluginStatus>;
  clearAccessLog?(): Promise<void>;
  switchLibrary?(libraryPath: string): Promise<void>;
  exportAccessLog?(filePath: string, format: "csv" | "jsonl"): Promise<{ count: number; filePath: string }>;
  init(): Promise<PluginStatus>;
  libraries?(input: { current: SharedLibrary | null; userDataPath: string }): Promise<LibraryList>;
  libraryChanged?(libraryPath?: string): unknown;
  saveSettings(payload: Record<string, unknown>): Promise<PluginStatus>;
  start(): Promise<PluginStatus>;
  status(): Promise<PluginStatus>;
  stop(): Promise<PluginStatus>;
  unblockAddress?(address: string): Promise<PluginStatus>;
}

interface EagleRuntime {
  app?: { getPath?: (name: string) => Promise<string> };
  clipboard?: { writeText?: (value: string) => Promise<void> };
  item?: {
    getById?: (itemId: string) => Promise<unknown>;
    /** Eagle 4.0 build12+: replaces the main window's selection. */
    select?: (itemIds: string[]) => Promise<boolean | void>;
  };
  library?: { name?: string; path?: string };
  dialog?: {
    showOpenDialog?: (options: {
      defaultPath?: string;
      filters?: Array<{ extensions: string[]; name: string }>;
      properties?: string[];
      title?: string;
    }) => Promise<{ canceled: boolean; filePaths: string[] }>;
    showSaveDialog?: (options: {
      defaultPath?: string;
      filters?: Array<{ extensions: string[]; name: string }>;
      title?: string;
    }) => Promise<{ canceled: boolean; filePath?: string }>;
    showMessageBox?: (options: {
      buttons?: string[];
      detail?: string;
      message: string;
      title?: string;
      type?: "error" | "info" | "none" | "question" | "warning";
    }) => Promise<{ response: number }>;
  };
  onLibraryChanged?: (callback: (libraryPath: string) => void) => void;
  onPluginCreate?: (callback: () => void) => void;
  onPluginShow?: (callback: () => void) => void;
  shell?: { openExternal?: (value: string) => Promise<void>; showItemInFolder?: (value: string) => Promise<void> | void };
  window?: { close?: () => void; hide?: () => void };
}

declare global {
  interface Window {
    require?: (id: string) => unknown;
  }

  var eagle: EagleRuntime | undefined;
}

type BusyAction = "restarting" | "starting" | "stopping";

const busyActionLabels = Object.freeze({ restarting: "Restarting", starting: "Starting", stopping: "Stopping" });
const AUTH_PASSWORD_REQUIRED_MESSAGE = "Enter a password for every user before enabling password protection.";
const HTTPS_CERTIFICATE_REQUIRED_MESSAGE = "Enter certificate and key paths before enabling HTTPS.";
const PUBLIC_NETWORK_WITHOUT_PASSWORD_MESSAGE = "Public Network is enabled and password protection is off. Anyone on this network may be able to access the viewer. Start the server anyway?";
const PUBLIC_NETWORK_HTTP_WITH_PASSWORD_MESSAGE = "HTTPS is disabled, so the connection is not protected. Start the server?";
// Only the connected-device count is live; the detailed view reloads on demand or with Auto refresh.
const CONNECTED_COUNT_REFRESH_MS = 3000;
// How often the panel asks for the Advanced Sort index's progress until it is ready.
const SORT_INDEX_REFRESH_MS = 1000;
const SORT_INDEX_FAILED_REFRESH_MS = 5000;
const ACCESS_LOG_AUTO_REFRESH_MS = 10000;
const ACCESS_LOG_SEARCH_DELAY_MS = 250;
const HTTPS_DOCS_URL = "https://github.com/tuki0918/eagle-media-preview-server/blob/main/docs/https-mkcert.md";

function App() {
  const managerRef = useRef<ServerManager | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [message, setMessageState] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [passwordVisibleByIndex, setPasswordVisibleByIndex] = useState<Record<string, boolean>>({});
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [passwordDraftRevision, setPasswordDraftRevision] = useState(0);
  const userPasswordsRef = useRef<Record<string, string>>({});
  const [libraries, setLibraries] = useState<LibraryList | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [accessLog, setAccessLog] = useState<AccessLogSummary | null>(null);
  const [accessLogRange, setAccessLogRange] = useState<AccessLogRange>("24h");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);
  const [accessLogEventFilter, setAccessLogEventFilter] = useState<AccessLogEventFilter>("");
  const [accessLogFilters, setAccessLogFilters] = useState<AccessLogFilter[]>([]);
  const [accessLogSearch, setAccessLogSearch] = useState("");
  // What the log is asked for: follows the search box once typing pauses.
  const [accessLogSearchQuery, setAccessLogSearchQuery] = useState("");
  // The search the listed events came back for; set together with them.
  const [accessLogSearchedText, setAccessLogSearchedText] = useState("");
  const accessLogRequestRef = useRef(0);
  const [accessLogAutoRefresh, setAccessLogAutoRefresh] = useState(false);
  const [accessLogLoading, setAccessLogLoading] = useState(false);
  // Libraries unshared since the last save, with their user limits, in case they are rechecked.
  const unsharedLibrariesRef = useRef(new Map<string, SharedLibrary>());
  const [activityNotice, setActivityNotice] = useState<{ isError: boolean; text: string } | null>(null);
  const [selectNotice, setSelectNotice] = useState<{ isError: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<PluginStatus>(() => ({
    settings: {
      customDomain: "",
      autoStart: false,
      allowMetadataEditing: false,
      authUsers: [],
      authEnabled: false,
      basicAuthUser: "eagle",
      host: "127.0.0.1",
      httpsCertPath: "",
      httpsEnabled: false,
      httpsKeyPath: "",
      port: 41532,
      sessionDurationDays: 7,
    },
    state: "stopped",
    url: "",
  }));

  const serverState = normalizeServerState(status.state);
  const settings = status.settings || {};
  const formDisabled = busy || !managerRef.current;
  const settingsInputDisabled = formDisabled || serverState === "running";
  const statusLabel = busy && busyAction ? busyActionLabels[busyAction] : titleCase(serverState);
  const authEnabled = Boolean(settings.authEnabled);
  const authUsers = normalizedAuthUsers(settings);
  const httpsEnabled = Boolean(settings.httpsEnabled);
  const publicNetwork = (settings.host || "127.0.0.1") === "0.0.0.0";
  const qrSrc = useMemo(() => {
    if (!status.url || serverState !== "running") return "";
    return createQrDataUrl(status.url);
  }, [serverState, status.url]);

  useEffect(() => {
    try {
      if (typeof window.require !== "function") {
        throw new Error("Node require() is not available in this Eagle plugin window");
      }
      const runtimePath = pluginRequirePath("service/runtime.cjs");
      const runtime = window.require(runtimePath) as { createServerManager: () => ServerManager };
      managerRef.current = runtime.createServerManager();
      const init = () => {
        void runCommand(() => managerRef.current?.init(), { quiet: true }).then(() => refreshLibraries());
        refreshAiStatus();
      };
      // The viewer server must stop answering from the previous library the moment Eagle switches.
      globalThis.eagle?.onLibraryChanged?.((libraryPath) => {
        // The server starts indexing the new library; reading its status again shows that, which
        // also restarts following the progress if the previous library's index was ready.
        void Promise.resolve(managerRef.current?.libraryChanged?.(libraryPath || globalThis.eagle?.library?.path))
          .catch(() => {})
          .then(() => refreshSortIndexStatus());
        void refreshLibraries();
      });
      if (globalThis.eagle?.onPluginCreate) {
        globalThis.eagle.onPluginCreate(init);
        globalThis.eagle.onPluginShow?.(() => {
          void runCommand(() => managerRef.current?.status(), { quiet: true }).then(() => refreshLibraries());
          // The admin may have just set a model in Eagle's preferences.
          refreshAiStatus({ reload: true });
        });
      } else {
        init();
      }
    } catch (error) {
      setErrorMessage(error);
    }
  }, []);

  // Polls even while collapsed, so the header can show how many devices are connected.
  useEffect(() => {
    const refresh = () => {
      try {
        const count = managerRef.current?.accessLogConnectedCount?.();
        if (typeof count === "number") setConnectedCount(count);
      } catch {
        // The count keeps its last value.
      }
    };
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, CONNECTED_COUNT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Follows the background index build; only the progress is taken, so unsaved settings stay as they are.
  // Asks on a steady interval while the scan is pending, so an answer that changes nothing (no index
  // started yet) or a failed check never ends the following.
  const sortIndexPending = serverState === "running" && status.sortIndex !== undefined && status.sortIndex?.status !== "ready";
  const sortIndexRefreshMs = status.sortIndex?.status === "failed" ? SORT_INDEX_FAILED_REFRESH_MS : SORT_INDEX_REFRESH_MS;
  useEffect(() => {
    if (!sortIndexPending) return;
    const timer = window.setInterval(() => void refreshSortIndexStatus(), sortIndexRefreshMs);
    return () => window.clearInterval(timer);
  }, [sortIndexPending, sortIndexRefreshMs]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAccessLogSearchQuery(accessLogSearch.trim()), ACCESS_LOG_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [accessLogSearch]);

  // Details load when the panel opens or the view changes, then only on request.
  useEffect(() => {
    if (!activityExpanded) return;
    void refreshAccessLog();
    if (!accessLogAutoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshAccessLog();
    }, ACCESS_LOG_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activityExpanded, accessLogAutoRefresh, accessLogRange, accessLogEventFilter, accessLogFilters, accessLogSearchQuery]);

  useEffect(() => {
    if (!activityNotice || activityNotice.isError) return;
    const timer = window.setTimeout(() => setActivityNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [activityNotice]);

  useEffect(() => {
    if (!message || messageIsError) return;
    const timer = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [message, messageIsError]);

  useEffect(() => {
    if (!urlCopied) return;
    const timer = window.setTimeout(() => setUrlCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [urlCopied]);

  // Uses only refs and the state setter, so the library-change listener registered once can call it.
  async function refreshSortIndexStatus() {
    try {
      const next = await managerRef.current?.status();
      if (next) setStatus((current) => ({ ...current, sortIndex: next.sortIndex }));
    } catch {
      // The bar keeps its last value until the next check.
    }
  }

  async function runCommand(command: () => Promise<PluginStatus> | PluginStatus | null | undefined, { action = null, quiet = false }: { action?: BusyAction | null; quiet?: boolean } = {}) {
    setBusy(true);
    setBusyAction(action);
    try {
      const nextStatus = await command();
      if (nextStatus) setStatus(nextStatus);
      if (nextStatus?.state === "error") {
        setMessage(nextStatus.lastError || "Server failed to start", true);
      } else if (!quiet) {
        setMessage("");
      }
      return true;
    } catch (error) {
      setErrorMessage(error);
      return false;
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }

  async function saveSettings({ forceSave = false, restartRunning = true, patch = {}, passwordDrafts = userPasswordsRef.current, successMessage = "" }: { forceSave?: boolean; passwordDrafts?: Record<string, string>; restartRunning?: boolean; patch?: Record<string, unknown>; successMessage?: string } = {}) {
    const effectiveAuthUsers = Array.isArray(patch.authUsers)
      ? patch.authUsers.map((user) => normalizeAuthUser(user as AuthUser))
      : authUsers;
    if (!validateAuthUsers(effectiveAuthUsers)) return false;
    const nextAuthEnabled = Boolean(patch.authEnabled ?? authEnabled);
    const nextHttpsEnabled = Boolean(patch.httpsEnabled ?? httpsEnabled);
    const nextHost = String(patch.host ?? settings.host ?? "127.0.0.1").trim() || "127.0.0.1";
    const nextPublicNetwork = nextHost === "0.0.0.0";
    const nextHttpsCertPath = String(patch.httpsCertPath ?? settings.httpsCertPath ?? "").trim();
    const nextHttpsKeyPath = String(patch.httpsKeyPath ?? settings.httpsKeyPath ?? "").trim();
    if (nextAuthEnabled && authUsersMissingPassword(effectiveAuthUsers, passwordDrafts)) {
      setMessage(AUTH_PASSWORD_REQUIRED_MESSAGE, true);
      return false;
    }
    if (nextHttpsEnabled && (!nextHttpsCertPath || !nextHttpsKeyPath)) {
      setMessage(HTTPS_CERTIFICATE_REQUIRED_MESSAGE, true);
      return false;
    }
    const payload: Record<string, unknown> = {
      customDomain: settings.customDomain || "",
      autoStart: settings.autoStart,
      host: nextHost,
      httpsCertPath: settings.httpsCertPath || "",
      httpsEnabled: nextHttpsEnabled,
      httpsKeyPath: settings.httpsKeyPath || "",
      port: settings.port || 41532,
      sessionDurationDays: settings.sessionDurationDays || 7,
      libraryProtectionEnabled: Boolean(settings.libraryProtectionEnabled),
      experimentalSort: Boolean(settings.experimentalSort),
      aiChatEnabled: Boolean(settings.aiChatEnabled),
      ...patch,
      // Row keys end here: library access is saved by username, and the keys themselves never are.
      sharedLibraries: resolveLibraryUsers((patch.sharedLibraries ?? settings.sharedLibraries) as SharedLibrary[] | undefined, effectiveAuthUsers),
      authEnabled: nextAuthEnabled,
      authUsers: effectiveAuthUsers.map(({ rowKey: _rowKey, ...user }) => user),
    };
    const cleanUserPasswords = collectUserPasswords(effectiveAuthUsers, passwordDrafts);
    const hasUserPasswords = Object.keys(cleanUserPasswords).length > 0;
    if (hasUserPasswords) {
      payload.userPasswords = cleanUserPasswords;
    }
    if (!forceSave && !hasUserPasswords && !settingsPayloadChanged(settings, payload)) {
      setMessage(successMessage);
      return true;
    }

    if (restartRunning) {
      const previousStatus = status;
      const restarting = willRestartServer(status, payload);
      if (restarting) {
        setStatus((current) => ({ ...current, state: "stopped" }));
      }
      const saved = await runCommand(() => managerRef.current?.saveSettings(payload), { action: restarting ? "restarting" : null, quiet: true });
      if (!saved) setStatus(previousStatus);
      if (saved) unsharedLibrariesRef.current.clear();
      if (saved && hasUserPasswords) clearUserPasswordDrafts();
      if (saved) setMessage(successMessage);
      // The status badges follow the saved settings, so refresh them after every save.
      if (saved) void refreshLibraries();
      return saved;
    }
    try {
      const nextStatus = await managerRef.current?.saveSettings(payload);
      if (nextStatus) setStatus(nextStatus);
      unsharedLibrariesRef.current.clear();
      if (hasUserPasswords) clearUserPasswordDrafts();
      setMessage(successMessage);
      void refreshLibraries();
      return true;
    } catch (error) {
      setErrorMessage(error);
      return false;
    }
  }

  async function refreshLibraries({ reportErrors = false } = {}) {
    try {
      // This panel runs on the admin's machine, so it reads Eagle's own state directly.
      const eagleLibrary = globalThis.eagle?.library;
      const current = eagleLibrary?.path ? { name: eagleLibrary.name || "", path: eagleLibrary.path } : null;
      const userDataPath = await globalThis.eagle?.app?.getPath?.("userData").catch(() => "") || "";
      const next = await managerRef.current?.libraries?.({ current, userDataPath });
      if (next) setLibraries(next);
    } catch (error) {
      // The picker keeps the last list; sharing itself is enforced by the server.
      if (reportErrors) setErrorMessage(error);
    }
  }

  // Uses only refs and the state setter, so the listeners registered once can call it.
  function refreshAiStatus({ reload = false } = {}) {
    try {
      const next = managerRef.current?.aiStatus?.({ reload });
      if (next) setAiStatus(next);
    } catch {
      // The AI tab keeps what it showed.
    }
  }

  function openAiSettings() {
    try {
      managerRef.current?.openAiSettings?.();
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function refreshAccessLog() {
    // Only the latest request counts, so an older search can't replace the results of a newer one.
    const request = ++accessLogRequestRef.current;
    setAccessLogLoading(true);
    try {
      const next = await managerRef.current?.accessLogSummary?.({ filters: accessLogFilters, limit: RECENT_EVENT_LIMIT, range: accessLogRange, search: accessLogSearchQuery, searchKeys: accessLogSearchKeys(accessLogSearchQuery), type: accessLogEventFilter });
      if (next && request === accessLogRequestRef.current) {
        setAccessLog(next);
        setAccessLogSearchedText(accessLogSearchQuery);
        setConnectedCount(next.activeClients);
      }
    } catch {
      // The panel keeps the last summary; logging never blocks the server controls.
    } finally {
      if (request === accessLogRequestRef.current) setAccessLogLoading(false);
    }
  }

  // Takes only the saved block list, so unsaved edits in the Settings form are kept.
  function applyBlockedAddresses(nextStatus: PluginStatus) {
    setStatus((current) => ({
      ...current,
      settings: { ...(current.settings || {}), blockedAddresses: nextStatus.settings?.blockedAddresses || [] },
    }));
  }

  // Activity actions report inside the Activity panel; the Settings message line may be collapsed.
  function showActivityNotice(text: string, isError = false) {
    setActivityNotice(text ? { isError, text } : null);
  }

  function showActivityError(error: unknown) {
    showActivityNotice(errorMessage(error), true);
  }

  async function blockAddress(address: string) {
    const trimmed = address.trim();
    if (!trimmed) return false;
    const confirmMessage = `Block ${trimmed}?`;
    const detail = "Requests from this address are refused right away, including signed-in devices.";
    const showMessageBox = globalThis.eagle?.dialog?.showMessageBox;
    try {
      const confirmed = showMessageBox
        ? (await showMessageBox({ type: "warning", message: confirmMessage, detail, buttons: ["Cancel", "Block"] })).response === 1
        : typeof window.confirm !== "function" || window.confirm(`${confirmMessage}\n${detail}`);
      if (!confirmed) return false;
      const nextStatus = await managerRef.current?.blockAddress?.(trimmed);
      if (nextStatus) applyBlockedAddresses(nextStatus);
      return true;
    } catch (error) {
      showActivityError(error);
      return false;
    }
  }

  async function unblockAddress(address: string) {
    try {
      const nextStatus = await managerRef.current?.unblockAddress?.(address);
      if (nextStatus) applyBlockedAddresses(nextStatus);
    } catch (error) {
      showActivityError(error);
    }
  }

  async function exportAccessLog() {
    const showSaveDialog = globalThis.eagle?.dialog?.showSaveDialog;
    const manager = managerRef.current;
    if (!showSaveDialog || !manager?.exportAccessLog) {
      showActivityNotice("Exporting is unavailable in this Eagle window.", true);
      return;
    }
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const result = await showSaveDialog({
        title: "Export access log",
        defaultPath: `access-log-${stamp}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }, { name: "JSON Lines", extensions: ["jsonl"] }],
      });
      if (result.canceled || !result.filePath) return;
      const exported = await manager.exportAccessLog(result.filePath, result.filePath.endsWith(".jsonl") ? "jsonl" : "csv");
      showActivityNotice(`Exported ${exported.count} entries.`);
    } catch (error) {
      showActivityError(error);
    }
  }

  async function revealAccessLogFile() {
    const filePath = managerRef.current?.accessLogPath?.();
    if (!filePath) return;
    try {
      await globalThis.eagle?.shell?.showItemInFolder?.(filePath);
    } catch (error) {
      showActivityError(error);
    }
  }

  async function selectItemInEagle(itemId: string) {
    const item = globalThis.eagle?.item;
    if (!item?.select) return;
    try {
      if (item.getById && !(await item.getById(itemId))) {
        setSelectNotice({ isError: true, text: "Couldn't find this item in the current library." });
        return;
      }
      await item.select([itemId]);
      setSelectNotice(null);
    } catch (error) {
      setSelectNotice({ isError: true, text: errorMessage(error) });
    }
  }

  async function clearAccessLog() {
    const message = "Clear the access log?";
    const detail = "All recorded events are deleted. This cannot be undone.";
    const showMessageBox = globalThis.eagle?.dialog?.showMessageBox;
    let confirmed = false;
    try {
      confirmed = showMessageBox
        ? (await showMessageBox({ type: "warning", message, detail, buttons: ["Cancel", "Clear"] })).response === 1
        : typeof window.confirm === "function" && window.confirm(`${message}\n${detail}`);
      if (!confirmed) return;
      await managerRef.current?.clearAccessLog?.();
      await refreshAccessLog();
    } catch (error) {
      showActivityError(error);
    }
  }

  async function switchLibrary(library: LibraryCandidate) {
    const message = `Switch Eagle to ${library.name}?`;
    const detail = status.state === "running"
      ? "Eagle opens this library. Connected viewers return to the connect screen."
      : "Eagle opens this library.";
    const showMessageBox = globalThis.eagle?.dialog?.showMessageBox;
    try {
      const confirmed = showMessageBox
        ? (await showMessageBox({ type: "question", message, detail, buttons: ["Cancel", "Switch"] })).response === 1
        : typeof window.confirm === "function" && window.confirm(`${message}\n${detail}`);
      if (!confirmed) return;
      // The list updates when Eagle reports the switch through onLibraryChanged.
      await managerRef.current?.switchLibrary?.(library.path);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  function changeLibraryShared(library: LibraryCandidate, shared: boolean) {
    const current: SharedLibrary[] = Array.isArray(settings.sharedLibraries) ? settings.sharedLibraries : [];
    const others = current.filter((entry) => entry.path !== library.path);
    if (shared) {
      // Rechecked before saving: back to how it was, so a limited library doesn't open to everyone.
      const restored = unsharedLibrariesRef.current.get(library.path);
      unsharedLibrariesRef.current.delete(library.path);
      updateSettings({ sharedLibraries: [...others, restored ?? { name: library.name, path: library.path }] });
      return;
    }
    const entry = current.find((candidate) => candidate.path === library.path);
    if (entry) unsharedLibrariesRef.current.set(library.path, entry);
    updateSettings({ sharedLibraries: others });
  }

  function setMessage(value: string, isError = false) {
    setMessageState(value);
    setMessageIsError(isError);
  }

  function setErrorMessage(error: unknown) {
    setMessage(errorMessage(error), true);
  }

  function setUserPasswordDraft(index: number, value: string) {
    userPasswordsRef.current = {
      ...userPasswordsRef.current,
      [String(index)]: value,
    };
  }

  function replaceUserPasswordDrafts(nextDrafts: Record<string, string>) {
    userPasswordsRef.current = nextDrafts;
    setPasswordDraftRevision((current) => current + 1);
  }

  function clearUserPasswordDrafts() {
    replaceUserPasswordDrafts({});
  }

  function updateSettings(patch: PluginSettings) {
    setStatus((current) => ({
      ...current,
      settings: {
        ...(current.settings || {}),
        ...patch,
      },
    }));
  }

  function validateAuthUsers(users: AuthUser[]) {
    if (users.some((user) => !String(user.username || "").trim())) {
      setMessage("Enter a username for every user.", true);
      return false;
    }
    const duplicate = duplicateUsername(users);
    if (duplicate) {
      setMessage(`Username "${duplicate}" is already used.`, true);
      return false;
    }
    return true;
  }

  function updateAuthUser(index: number, patch: AuthUser) {
    updateAuthUsers(replaceAuthUser(authUsers, index, patch));
  }

  function updateAuthUsers(nextUsers: AuthUser[]) {
    updateSettings({ authUsers: nextUsers });
  }

  function changeLibraryUsers(library: LibraryCandidate, access: "all" | "selected", users: string[]) {
    const current: SharedLibrary[] = Array.isArray(settings.sharedLibraries) ? settings.sharedLibraries : [];
    updateSettings({
      sharedLibraries: current.map((entry) => {
        if (entry.path !== library.path) return entry;
        const { access: _access, users: _users, ...rest } = entry;
        return access === "selected" ? { ...rest, access, users } : rest;
      }),
    });
  }

  function addAuthUser() {
    updateAuthUsers([...authUsers, nextDefaultUser(authUsers)]);
  }

  async function removeAuthUser(index: number) {
    if (authUsers.length <= 1) return;
    if (!(await confirmRemoveAuthUser(authUsers[index]?.username || `user ${index + 1}`))) return;
    const nextUsers = authUsers.filter((_, userIndex) => userIndex !== index);
    const nextUserPasswords = removeIndexedValue(userPasswordsRef.current, index);
    setPasswordVisibleByIndex((current) => removeIndexedValue(current, index));
    replaceUserPasswordDrafts(nextUserPasswords);
    updateAuthUsers(nextUsers);
  }

  function togglePasswordVisible(index: number) {
    setPasswordVisibleByIndex((current) => ({
      ...current,
      [String(index)]: !current[String(index)],
    }));
  }

  async function startOrStopServer(checked: boolean) {
    if (busy) return;
    if (checked) {
      if (!confirmUnsafePublicStart()) return;
      const saved = await saveSettings({ restartRunning: false });
      if (!saved) return;
      await runCommand(() => managerRef.current?.start(), { action: "starting" });
    } else {
      await runCommand(() => managerRef.current?.stop(), { action: "stopping" });
    }
  }

  function confirmUnsafePublicStart() {
    if (!publicNetwork) return true;
    if (!authEnabled) return confirmUnsafePublicNetwork();
    if (!httpsEnabled) return confirmInsecurePublicHttp();
    return true;
  }

  async function confirmRemoveAuthUser(username: string) {
    const message = `Remove ${username}?`;
    const detail = "The user is removed when you save settings.";
    const showMessageBox = globalThis.eagle?.dialog?.showMessageBox;
    if (!showMessageBox) {
      return typeof window.confirm === "function" && window.confirm(`${message}\n${detail}`);
    }
    try {
      // Cancel comes first so pressing Enter by accident keeps the user.
      const result = await showMessageBox({ type: "warning", message, detail, buttons: ["Cancel", "Remove"] });
      return result.response === 1;
    } catch (error) {
      setErrorMessage(error);
      return false;
    }
  }

  function confirmUnsafePublicNetwork() {
    if (typeof window.confirm !== "function") {
      setMessage("Enable password protection or disable Public Network before starting the server.", true);
      return false;
    }
    return window.confirm(PUBLIC_NETWORK_WITHOUT_PASSWORD_MESSAGE);
  }

  function confirmInsecurePublicHttp() {
    if (typeof window.confirm !== "function") {
      setMessage("Enable HTTPS or disable Public Network before starting the server.", true);
      return false;
    }
    return window.confirm(PUBLIC_NETWORK_HTTP_WITH_PASSWORD_MESSAGE);
  }

  async function copyAccessUrl() {
    if (busy || !status.url) return;
    try {
      if (!globalThis.eagle?.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable in this Eagle window");
      }
      await globalThis.eagle.clipboard.writeText(status.url);
      setMessage("");
      setUrlCopied(true);
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function openEndpointUrl() {
    if (busy || !status.url) return;
    try {
      if (globalThis.eagle?.shell?.openExternal) {
        await globalThis.eagle.shell.openExternal(status.url);
        return;
      }
      window.open(status.url, "_blank", "noopener");
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function chooseHttpsFile(field: HttpsFileField) {
    const showOpenDialog = globalThis.eagle?.dialog?.showOpenDialog;
    if (!showOpenDialog) return;
    const currentPath = field === "cert" ? settings.httpsCertPath : settings.httpsKeyPath;
    try {
      const result = await showOpenDialog({
        title: field === "cert" ? "Choose TLS certificate" : "Choose TLS private key",
        ...(currentPath ? { defaultPath: currentPath } : {}),
        filters: [
          { name: "PEM files", extensions: ["pem", "crt", "cer", "key"] },
          { name: "All files", extensions: ["*"] },
        ],
        properties: ["openFile", "showHiddenFiles"],
      });
      const filePath = result.canceled ? "" : result.filePaths[0];
      if (!filePath) return;
      updateSettings(field === "cert" ? { httpsCertPath: filePath } : { httpsKeyPath: filePath });
    } catch (error) {
      setErrorMessage(error);
    }
  }

  async function openHttpsDocs() {
    try {
      if (globalThis.eagle?.shell?.openExternal) {
        await globalThis.eagle.shell.openExternal(HTTPS_DOCS_URL);
        return;
      }
      window.open(HTTPS_DOCS_URL, "_blank", "noopener");
    } catch (error) {
      setErrorMessage(error);
    }
  }

  function closeWindow() {
    try {
      if (globalThis.eagle?.window?.hide) {
        globalThis.eagle.window.hide();
        return;
      }
      if (globalThis.eagle?.window?.close) {
        globalThis.eagle.window.close();
        return;
      }
    } catch (error) {
      setErrorMessage(error);
    }
    window.close();
  }

  // `main` is the one scroller, and `relative` so absolutely positioned children (sr-only text) scroll inside it.
  return (
    <main className="relative h-screen min-h-screen w-full overflow-auto bg-[#f5f5f7] text-[#171717]">
      <header className="[-webkit-app-region:drag] sticky top-0 z-10 flex h-[46px] items-center justify-between gap-2.5 border-b border-[#e6e6e9] bg-[rgba(255,255,255,0.86)] px-3.5 backdrop-blur-xl">
        <div className="inline-flex min-w-0 items-center gap-2.5">
          <img className="block h-6 w-6 rounded-md object-cover" src={serverState === "running" ? "./assets/icon_on.svg" : "./assets/icon_off.svg"} alt="" aria-hidden="true" />
          <h1 className="m-0 text-[14px] font-semibold leading-none">Media Preview Server</h1>
        </div>
        <button className="[-webkit-app-region:no-drag] grid h-7 w-7 place-items-center rounded-full border-0 bg-transparent p-[7px] text-[#555b65] hover:bg-[#ececef] hover:text-[#171717]" type="button" aria-label="Close" title="Close" onClick={closeWindow}>
          <CloseIcon className="h-[13px] w-[13px]" />
        </button>
      </header>

      <div className="grid gap-3 p-3">
        <ServerStatusPanel
          authEnabled={authEnabled}
          formDisabled={formDisabled}
          httpsEnabled={httpsEnabled}
          publicNetwork={publicNetwork}
          qrSrc={qrSrc}
          serverState={serverState}
          settings={settings}
          sortIndex={serverState === "running" ? status.sortIndex : undefined}
          statusLabel={statusLabel}
          statusPending={busy && busyAction !== null}
          url={status.url || ""}
          urlCopied={urlCopied}
          settingsLocked={serverState === "running"}
          onAutoStartChange={(checked) => {
            updateSettings({ autoStart: checked });
            saveSettings({ patch: { autoStart: checked } });
          }}
          onCopyAccessUrl={copyAccessUrl}
          onHttpsDocsOpen={openHttpsDocs}
          onHttpsEnabledChange={(checked) => {
            if (checked && (!String(settings.httpsCertPath || "").trim() || !String(settings.httpsKeyPath || "").trim())) {
              setMessage(HTTPS_CERTIFICATE_REQUIRED_MESSAGE, true);
              return;
            }
            updateSettings({ httpsEnabled: checked });
            saveSettings({ patch: { httpsEnabled: checked } });
          }}
          onOpenEndpointUrl={openEndpointUrl}
          onPasswordProtectionChange={(checked) => {
            if (checked && authUsersMissingPassword(authUsers, userPasswordsRef.current)) {
              setMessage(AUTH_PASSWORD_REQUIRED_MESSAGE, true);
              return;
            }
            const patch = { authEnabled: checked };
            updateSettings(patch);
            saveSettings({ patch });
          }}
          onPublicNetworkChange={(checked) => {
            const host = checked ? "0.0.0.0" : "127.0.0.1";
            updateSettings({ host });
            saveSettings({ patch: { host } });
          }}
          onServerPowerChange={startOrStopServer}
        />

        <SettingsForm
          aiStatus={aiStatus}
          authEnabled={authEnabled}
          authUsers={authUsers}
          busy={busy}
          httpsEnabled={httpsEnabled}
          libraries={libraries}
          message={message}
          messageIsError={messageIsError}
          passwordDraftRevision={passwordDraftRevision}
          passwordVisibleByIndex={passwordVisibleByIndex}
          serverRunning={serverState === "running"}
          settings={settings}
          settingsExpanded={settingsExpanded}
          settingsInputDisabled={settingsInputDisabled}
          settingsTab={settingsTab}
          userPasswords={userPasswordsRef.current}
          onAddAuthUser={addAuthUser}
          onAiChatEnabledChange={(checked) => updateSettings({ aiChatEnabled: checked })}
          onOpenAiSettings={openAiSettings}
          onReloadAiStatus={() => refreshAiStatus({ reload: true })}
          onChooseHttpsFile={globalThis.eagle?.dialog?.showOpenDialog ? chooseHttpsFile : undefined}
          onCustomDomainChange={(value) => updateSettings({ customDomain: value })}
          onHttpsCertPathChange={(value) => updateSettings({ httpsCertPath: value })}
          onHttpsKeyPathChange={(value) => updateSettings({ httpsKeyPath: value })}
          onLibraryProtectionChange={(checked) => updateSettings({ libraryProtectionEnabled: checked })}
          onLibrarySharedChange={changeLibraryShared}
          onLibraryUsersChange={changeLibraryUsers}
          onSwitchLibrary={(library) => void switchLibrary(library)}
          onReloadLibraries={() => void refreshLibraries({ reportErrors: true })}
          onPortChange={(value) => updateSettings({ port: value })}
          onExperimentalSortChange={(checked) => updateSettings({ experimentalSort: checked })}
          onRemoveAuthUser={(index) => void removeAuthUser(index)}
          onSaveSettings={() => saveSettings({ forceSave: true, successMessage: "Saved" })}
          onSessionDurationDaysChange={(value) => updateSettings({ sessionDurationDays: value })}
          onSettingsExpandedChange={setSettingsExpanded}
          onSettingsTabChange={(tab) => {
            setSettingsTab(tab);
            if (tab === "ai") refreshAiStatus({ reload: true });
          }}
          onTogglePasswordVisible={togglePasswordVisible}
          onUpdateAuthUser={updateAuthUser}
          onUserPasswordDraftChange={setUserPasswordDraft}
        />

        <AccessLogPanel
          activeClients={connectedCount}
          autoRefresh={accessLogAutoRefresh}
          blockedAddresses={settings.blockedAddresses || []}
          eventFilter={accessLogEventFilter}
          filters={accessLogFilters}
          expanded={activityExpanded}
          loading={accessLogLoading}
          notice={activityNotice}
          selectNotice={selectNotice}
          onDismissNotice={() => setActivityNotice(null)}
          onDismissSelectNotice={() => setSelectNotice(null)}
          range={accessLogRange}
          search={accessLogSearch}
          searchedText={accessLogSearchedText}
          summary={accessLog}
          onFiltersChange={setAccessLogFilters}
          onAutoRefreshChange={setAccessLogAutoRefresh}
          onSearchChange={setAccessLogSearch}
          onBlock={blockAddress}
          onClear={() => void clearAccessLog()}
          onEventFilterChange={setAccessLogEventFilter}
          onRefresh={() => void refreshAccessLog()}
          onUnblock={(address) => void unblockAddress(address)}
          onExpandedChange={setActivityExpanded}
          onExport={() => void exportAccessLog()}
          onRangeChange={setAccessLogRange}
          onRevealFile={globalThis.eagle?.shell?.showItemInFolder ? () => void revealAccessLogFile() : undefined}
          onSelectItem={globalThis.eagle?.item?.select ? (itemId) => void selectItemInEagle(itemId) : undefined}
        />
      </div>
    </main>
  );
}

interface QrCodeFactoryResult {
  addData(value: string): void;
  createSvgTag(options: { alt: string; cellSize: number; margin: number; scalable: boolean }): string;
  make(): void;
}

function createQrDataUrl(value: string) {
  const qr = qrcodeFactory(0, "M") as QrCodeFactoryResult;
  qr.addData(value);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true, alt: value });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function willRestartServer(status: PluginStatus, nextSettings: Record<string, unknown>) {
  const current = status.settings;
  if (!current || status.state !== "running") return false;
  return serverRestartSettingsChanged(current, nextSettings);
}

function normalizedAuthUsers(settings: PluginSettings): AuthUser[] {
  const users = Array.isArray(settings.authUsers) ? settings.authUsers.map(normalizeAuthUser) : [];
  if (users.length) return users;
  return [{
    username: settings.basicAuthUser || "eagle",
    passwordHash: settings.passwordHash || "",
    role: settings.authEnabled && settings.allowMetadataEditing ? "editor" : "viewer",
  }];
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  const role = normalizeRole(user.role);
  return {
    username: String(user.username || "").trim(),
    passwordHash: String(user.passwordHash || ""),
    role,
    ...(role === "editor" && user.canUpload === true ? { canUpload: true } : {}),
    ...(user.rowKey === undefined ? {} : { rowKey: user.rowKey }),
  };
}

function normalizeRole(role: unknown): UserRole {
  return role === "admin" || role === "editor" ? role : "viewer";
}

function authUsersMissingPassword(users: AuthUser[], values: Record<string, string>) {
  return users.some((user, index) => !user.passwordHash && !values[String(index)]?.trim());
}

// Library access points at account rows until it is saved, then at the names those rows ended up
// with. A row that was removed drops out, which can leave a library with no users: it then stays
// limited rather than opening to everyone.
function resolveLibraryUsers(libraries: SharedLibrary[] | undefined, users: AuthUser[]) {
  const usernameByKey = new Map(users.map((user) => [authUserKey(user), user.username || ""]));
  return (Array.isArray(libraries) ? libraries : []).map((library) => library.access === "selected"
    ? { ...library, users: (library.users || []).flatMap((key) => usernameByKey.get(key) || []) }
    : library);
}

function replaceAuthUser(users: AuthUser[], index: number, patch: AuthUser) {
  return users.map((user, userIndex) => userIndex === index ? normalizeAuthUser({ ...user, ...patch, rowKey: authUserKey(user) }) : user);
}

function duplicateUsername(users: AuthUser[]) {
  const seen = new Set<string>();
  for (const user of users) {
    const username = String(user.username || "").trim().toLowerCase();
    if (!username) continue;
    if (seen.has(username)) return user.username || username;
    seen.add(username);
  }
  return "";
}

function removeIndexedValue<T>(values: Record<string, T>, removedIndex: number) {
  const next: Record<string, T> = {};
  for (const [rawIndex, value] of Object.entries(values)) {
    const index = Number.parseInt(rawIndex, 10);
    if (!Number.isInteger(index) || index === removedIndex) continue;
    next[String(index > removedIndex ? index - 1 : index)] = value;
  }
  return next;
}

function collectUserPasswords(users: AuthUser[], values: Record<string, string>) {
  const output: Record<string, string> = {};
  users.forEach((user, index) => {
    const username = String(user.username || "").trim();
    const password = values[String(index)] || "";
    if (username && password.trim()) output[username] = password;
  });
  return output;
}

let newUserRowCount = 0;

function nextDefaultUser(users: AuthUser[]): AuthUser {
  let index = users.length + 1;
  const names = new Set(users.map((user) => String(user.username || "").toLowerCase()));
  while (names.has(`viewer${index}`)) index += 1;
  newUserRowCount += 1;
  return {
    username: `viewer${index}`,
    passwordHash: "",
    role: "viewer",
    // Never reused, so a new row can't inherit a removed row's library access. No username contains NUL.
    rowKey: `\u0000new-${newUserRowCount}`,
  };
}

function normalizeServerState(value: unknown): ServerState {
  return value === "running" || value === "error" ? value : "stopped";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pluginRequirePath(relativePath: string) {
  const path = window.require?.("path") as { dirname: (value: string) => string; join: (...parts: string[]) => string };
  if (!path) throw new Error("Node path module is unavailable");
  const scriptUrl = document.currentScript?.getAttribute("src")
    ? new URL(document.currentScript.getAttribute("src") || "", location.href).href
    : location.href;
  let pluginDir = "";
  if (scriptUrl.startsWith("file://")) {
    pluginDir = decodeURIComponent(new URL(".", scriptUrl).pathname);
  } else {
    pluginDir = decodeURIComponent(location.pathname);
    if (!/[\\/]/.test(pluginDir.slice(-1))) pluginDir = path.dirname(pluginDir);
  }
  pluginDir = pluginDir.replace(/^[\\/]+([A-Za-z]:[\\/])/, "$1");
  return path.join(pluginDir, relativePath);
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
