import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import qrcodeFactory from "qrcode-generator";
import { CloseIcon } from "./components/Icons";
import { ServerStatusPanel } from "./components/ServerStatusPanel";
import { SettingsForm } from "./components/SettingsForm";
import type { AuthUser, PluginSettings, PluginStatus, ServerState, SettingsTab, UserRole } from "./types";

interface ServerManager {
  init(): Promise<PluginStatus>;
  saveSettings(payload: Record<string, unknown>): Promise<PluginStatus>;
  start(): Promise<PluginStatus>;
  status(): Promise<PluginStatus>;
  stop(): Promise<PluginStatus>;
}

interface EagleRuntime {
  clipboard?: { writeText?: (value: string) => Promise<void> };
  onPluginCreate?: (callback: () => void) => void;
  onPluginShow?: (callback: () => void) => void;
  shell?: { openExternal?: (value: string) => Promise<void> };
  window?: { close?: () => void; hide?: () => void };
}

declare global {
  interface Window {
    require?: (id: string) => unknown;
  }

  var eagle: EagleRuntime | undefined;
}

const busyStoppedFrames = Object.freeze([".", "..", "...", "....", "....."]);
const AUTH_PASSWORD_REQUIRED_MESSAGE = "Enter a password for every user before enabling password protection.";
const HTTPS_CERTIFICATE_REQUIRED_MESSAGE = "Enter certificate and key paths before enabling HTTPS.";
const PUBLIC_NETWORK_WITHOUT_PASSWORD_MESSAGE = "Public Network is enabled and password protection is off. Anyone on this network may be able to access the viewer. Start the server anyway?";
const PUBLIC_NETWORK_HTTP_WITH_PASSWORD_MESSAGE = "HTTPS is disabled, so the connection is not protected. Start the server?";
const HTTPS_DOCS_URL = "https://github.com/tuki0918/eagle-media-preview-server/blob/main/docs/https-mkcert.md";

function App() {
  const managerRef = useRef<ServerManager | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyFrame, setBusyFrame] = useState(0);
  const [message, setMessageState] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [passwordVisibleByIndex, setPasswordVisibleByIndex] = useState<Record<string, boolean>>({});
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [passwordDraftRevision, setPasswordDraftRevision] = useState(0);
  const userPasswordsRef = useRef<Record<string, string>>({});
  const [status, setStatus] = useState<PluginStatus>(() => ({
    settings: {
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
  const restartingStopped = busy && serverState === "stopped";
  const statusLabel = restartingStopped ? busyStoppedFrames[busyFrame] : titleCase(serverState);
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
      const init = () => runCommand(() => managerRef.current?.init(), { quiet: true });
      if (globalThis.eagle?.onPluginCreate) {
        globalThis.eagle.onPluginCreate(init);
        globalThis.eagle.onPluginShow?.(() => runCommand(() => managerRef.current?.status(), { quiet: true }));
      } else {
        init();
      }
    } catch (error) {
      setErrorMessage(error);
    }
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      setBusyFrame((current) => (current + 1) % busyStoppedFrames.length);
    }, 650);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function runCommand(command: () => Promise<PluginStatus> | PluginStatus | null | undefined, { quiet = false } = {}) {
    setBusy(true);
    setBusyFrame(0);
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
      autoStart: settings.autoStart,
      host: nextHost,
      httpsCertPath: settings.httpsCertPath || "",
      httpsEnabled: nextHttpsEnabled,
      httpsKeyPath: settings.httpsKeyPath || "",
      port: settings.port || 41532,
      sessionDurationDays: settings.sessionDurationDays || 7,
      ...patch,
      authEnabled: nextAuthEnabled,
      authUsers: effectiveAuthUsers,
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
      if (willRestartServer(status, payload)) {
        setStatus((current) => ({ ...current, state: "stopped" }));
      }
      const saved = await runCommand(() => managerRef.current?.saveSettings(payload), { quiet: true });
      if (!saved) setStatus(previousStatus);
      if (saved && hasUserPasswords) clearUserPasswordDrafts();
      if (saved) setMessage(successMessage);
      return saved;
    }
    try {
      const nextStatus = await managerRef.current?.saveSettings(payload);
      if (nextStatus) setStatus(nextStatus);
      if (hasUserPasswords) clearUserPasswordDrafts();
      setMessage(successMessage);
      return true;
    } catch (error) {
      setErrorMessage(error);
      return false;
    }
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
    updateSettings({
      authUsers: nextUsers,
    });
  }

  function addAuthUser() {
    updateAuthUsers([...authUsers, nextDefaultUser(authUsers)]);
  }

  function removeAuthUser(index: number) {
    if (authUsers.length <= 1) return;
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
      await runCommand(() => managerRef.current?.start());
    } else {
      await runCommand(() => managerRef.current?.stop());
    }
  }

  function confirmUnsafePublicStart() {
    if (!publicNetwork) return true;
    if (!authEnabled) return confirmUnsafePublicNetwork();
    if (!httpsEnabled) return confirmInsecurePublicHttp();
    return true;
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

  return (
    <main className="h-screen min-h-screen w-full overflow-auto bg-white text-[#111]">
      <header className="[-webkit-app-region:drag] flex h-[46px] items-center justify-between gap-2.5 border-b border-[#e1e3e7] bg-[rgba(255,255,255,0.86)] px-3">
        <div className="inline-flex min-w-0 items-center gap-2.5">
          <img className="block h-6 w-6 rounded-md object-cover" src={serverState === "running" ? "./assets/icon_on.svg" : "./assets/icon_off.svg"} alt="" aria-hidden="true" />
          <h1 className="m-0 text-[15px] font-[760] leading-none">Media Preview Server</h1>
        </div>
        <button className="[-webkit-app-region:no-drag] grid h-[26px] w-[26px] place-items-center rounded-md border-0 bg-transparent p-[5px] text-[#555b65] hover:bg-[#f1f2f4] hover:text-[#111]" type="button" aria-label="Close" title="Close" onClick={closeWindow}>
          <CloseIcon className="h-[13px] w-[13px]" />
        </button>
      </header>

      <ServerStatusPanel
        authEnabled={authEnabled}
        formDisabled={formDisabled}
        httpsEnabled={httpsEnabled}
        publicNetwork={publicNetwork}
        qrSrc={qrSrc}
        serverState={serverState}
        settings={settings}
        statusLabel={statusLabel}
        url={status.url || ""}
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
        authEnabled={authEnabled}
        authUsers={authUsers}
        busy={busy}
        httpsEnabled={httpsEnabled}
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
        onHttpsCertPathChange={(value) => updateSettings({ httpsCertPath: value })}
        onHttpsKeyPathChange={(value) => updateSettings({ httpsKeyPath: value })}
        onPortChange={(value) => updateSettings({ port: value })}
        onRemoveAuthUser={removeAuthUser}
        onSaveSettings={() => saveSettings({ forceSave: true, successMessage: "Saved" })}
        onSessionDurationDaysChange={(value) => updateSettings({ sessionDurationDays: value })}
        onSettingsExpandedChange={setSettingsExpanded}
        onSettingsTabChange={setSettingsTab}
        onTogglePasswordVisible={togglePasswordVisible}
        onUpdateAuthUser={updateAuthUser}
        onUserPasswordDraftChange={setUserPasswordDraft}
      />
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

function settingsPayloadChanged(current: PluginSettings | undefined, nextSettings: Record<string, unknown>) {
  if (!current) return true;
  if (Boolean(nextSettings.autoStart ?? current.autoStart) !== Boolean(current.autoStart)) return true;
  return serverSettingsChanged(current, nextSettings);
}

function serverSettingsChanged(current: PluginSettings, nextSettings: Record<string, unknown>) {
  if ((nextSettings.host ?? current.host) !== current.host) return true;
  if (Boolean(nextSettings.httpsEnabled ?? current.httpsEnabled) !== Boolean(current.httpsEnabled)) return true;
  if ((nextSettings.httpsCertPath ?? current.httpsCertPath ?? "") !== (current.httpsCertPath ?? "")) return true;
  if ((nextSettings.httpsKeyPath ?? current.httpsKeyPath ?? "") !== (current.httpsKeyPath ?? "")) return true;
  if (Number(nextSettings.port ?? current.port) !== Number(current.port)) return true;
  if (Number(nextSettings.sessionDurationDays ?? current.sessionDurationDays ?? 7) !== Number(current.sessionDurationDays ?? 7)) return true;
  if (Boolean(nextSettings.authEnabled ?? current.authEnabled) !== Boolean(current.authEnabled)) return true;
  if (JSON.stringify(nextSettings.authUsers ?? current.authUsers ?? []) !== JSON.stringify(current.authUsers ?? [])) return true;
  return false;
}

function serverRestartSettingsChanged(current: PluginSettings, nextSettings: Record<string, unknown>) {
  const currentAuthEnabled = Boolean(current.authEnabled);
  const nextAuthEnabled = Boolean(nextSettings.authEnabled ?? current.authEnabled);
  if ((nextSettings.host ?? current.host) !== current.host) return true;
  if (Boolean(nextSettings.httpsEnabled ?? current.httpsEnabled) !== Boolean(current.httpsEnabled)) return true;
  if ((nextSettings.httpsCertPath ?? current.httpsCertPath ?? "") !== (current.httpsCertPath ?? "")) return true;
  if ((nextSettings.httpsKeyPath ?? current.httpsKeyPath ?? "") !== (current.httpsKeyPath ?? "")) return true;
  if (Number(nextSettings.port ?? current.port) !== Number(current.port)) return true;
  if (Number(nextSettings.sessionDurationDays ?? current.sessionDurationDays ?? 7) !== Number(current.sessionDurationDays ?? 7)) return true;
  if (nextAuthEnabled !== currentAuthEnabled) return true;
  if (!currentAuthEnabled && !nextAuthEnabled) return false;
  if (hasPasswordUpdates(nextSettings.userPasswords)) return true;
  if (JSON.stringify(nextSettings.authUsers ?? current.authUsers ?? []) !== JSON.stringify(current.authUsers ?? [])) return true;
  return false;
}

function hasPasswordUpdates(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length);
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
  return {
    username: String(user.username || "").trim(),
    passwordHash: String(user.passwordHash || ""),
    role: normalizeRole(user.role),
  };
}

function normalizeRole(role: unknown): UserRole {
  return role === "admin" || role === "editor" ? role : "viewer";
}

function authUsersMissingPassword(users: AuthUser[], values: Record<string, string>) {
  return users.some((user, index) => !user.passwordHash && !values[String(index)]?.trim());
}

function replaceAuthUser(users: AuthUser[], index: number, patch: AuthUser) {
  return users.map((user, userIndex) => userIndex === index ? normalizeAuthUser({ ...user, ...patch }) : user);
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

function nextDefaultUser(users: AuthUser[]): AuthUser {
  let index = users.length + 1;
  const names = new Set(users.map((user) => String(user.username || "").toLowerCase()));
  while (names.has(`viewer${index}`)) index += 1;
  return {
    username: `viewer${index}`,
    passwordHash: "",
    role: "viewer",
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
