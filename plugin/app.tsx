import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import qrcodeFactory from "qrcode-generator";

type ServerState = "error" | "running" | "stopped";
type SettingsTab = "access" | "general" | "security";
type UserRole = "admin" | "editor" | "viewer";

interface AuthUser {
  passwordHash?: string;
  role?: UserRole;
  username?: string;
}

interface PluginSettings {
  allowMetadataEditing?: boolean;
  authUsers?: AuthUser[];
  authEnabled?: boolean;
  autoStart?: boolean;
  basicAuthUser?: string;
  host?: string;
  httpsCertPath?: string;
  httpsEnabled?: boolean;
  httpsKeyPath?: string;
  passwordHash?: string;
  port?: number | string;
}

interface PluginStatus {
  lastError?: string;
  settings?: PluginSettings;
  state?: ServerState | string;
  url?: string;
}

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
const HTTPS_DOCS_URL = "https://github.com/tuki0918/eagle-media-preview-server#use-https-with-mkcert";
const settingInputClassName = "h-7 min-w-0 rounded-md border border-[#d7d9de] bg-white px-2 text-[11px] text-[#111] outline-0 focus:border-[rgba(31,116,255,0.58)] focus:shadow-[0_0_0_3px_rgba(31,116,255,0.12)] disabled:cursor-not-allowed disabled:bg-[#f4f5f7] disabled:text-[#8a8f99]";
const authActionButtonClassName = "border border-[#d7d9de] bg-white text-[#555c66] hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-45";

function App() {
  const managerRef = useRef<ServerManager | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyFrame, setBusyFrame] = useState(0);
  const [message, setMessageState] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [passwordVisibleByIndex, setPasswordVisibleByIndex] = useState<Record<string, boolean>>({});
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [passwordDraftRevision, setPasswordDraftRevision] = useState(0);
  const userPasswordsRef = useRef<Record<string, string>>({});
  const [status, setStatus] = useState<PluginStatus>(() => ({
    settings: {
      autoStart: false,
      allowMetadataEditing: false,
      authUsers: [],
      authEnabled: false,
      basicAuthUser: "eagle",
      host: "0.0.0.0",
      httpsCertPath: "",
      httpsEnabled: false,
      httpsKeyPath: "",
      port: 41532,
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
  const publicNetwork = (settings.host || "0.0.0.0") === "0.0.0.0";
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
      host: publicNetwork ? "0.0.0.0" : "127.0.0.1",
      httpsCertPath: settings.httpsCertPath || "",
      httpsEnabled: nextHttpsEnabled,
      httpsKeyPath: settings.httpsKeyPath || "",
      port: settings.port || 41532,
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
      if (willRestartServer(status, payload)) {
        setStatus((current) => ({ ...current, state: "stopped" }));
      }
      const saved = await runCommand(() => managerRef.current?.saveSettings(payload), { quiet: true });
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
      const saved = await saveSettings({ restartRunning: false });
      if (!saved) return;
      await runCommand(() => managerRef.current?.start());
    } else {
      await runCommand(() => managerRef.current?.stop());
    }
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

      <section className="m-[9px] rounded-[10px] border border-[#d7d9de] bg-white px-3.5 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading icon={<ServerIcon />}>Server Status</SectionHeading>
          <div className="inline-flex items-center gap-2.5">
            <StatusBadge state={serverState} label={statusLabel} />
            <PowerSwitch checked={serverState === "running"} disabled={formDisabled} onChange={startOrStopServer} />
          </div>
        </div>

        <div className="my-3.5 h-px bg-[#e1e3e7]" />

        <div className="grid grid-cols-[minmax(0,1fr)_148px] items-stretch gap-3.5 max-[520px]:grid-cols-1">
          <div className="grid min-w-0 border-r border-[#e1e3e7] pr-3.5 max-[520px]:border-r-0 max-[520px]:pr-0">
            <label className="block text-[11px] font-medium leading-tight text-[#676c75]" htmlFor="accessUrl">Endpoint URL</label>
            <div className="my-2 grid grid-cols-[minmax(0,1fr)_38px] items-center gap-2 max-[520px]:grid-cols-[20px_minmax(0,1fr)]">
              <input id="accessUrl" className="h-8 min-w-0 cursor-pointer rounded-lg border border-[#d7d9de] bg-[#f8f9fb] px-2.5 text-xs text-[#111] outline-0" type="text" readOnly value={status.url || ""} onClick={openEndpointUrl} />
              <button className="inline-flex h-8 w-[38px] items-center justify-center rounded-lg border border-[#d7d9de] bg-white p-0 text-[#363b44] hover:bg-[#f8f9fb] max-[520px]:col-start-2 max-[520px]:w-[84px]" type="button" aria-label="Copy endpoint URL" title="Copy endpoint URL" disabled={formDisabled} onClick={copyAccessUrl}>
                <CopyIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="grid h-full content-center gap-3 py-1.5">
              <OptionRow
                checked={Boolean(settings.autoStart)}
                disabled={formDisabled}
                icon={<PowerIcon />}
                title="Auto start"
                description="Start server automatically when app launches."
                onChange={(checked) => {
                  updateSettings({ autoStart: checked });
                  saveSettings({ patch: { autoStart: checked } });
                }}
              />
              <OptionRow
                checked={authEnabled}
                disabled={formDisabled}
                icon={<ShieldIcon />}
                title="Password protection"
                description="Require username & password to access."
                onChange={(checked) => {
                  if (checked && authUsersMissingPassword(authUsers, userPasswordsRef.current)) {
                    setMessage(AUTH_PASSWORD_REQUIRED_MESSAGE, true);
                    return;
                  }
                  const patch = { authEnabled: checked };
                  updateSettings(patch);
                  saveSettings({ patch });
                }}
              />
              <OptionRow
                checked={publicNetwork}
                disabled={formDisabled}
                icon={<GlobeIcon />}
                title="Public Network"
                description="Allow access from other devices on the network."
                onChange={(checked) => {
                  const host = checked ? "0.0.0.0" : "127.0.0.1";
                  updateSettings({ host });
                  saveSettings({ patch: { host } });
                }}
              />
              <OptionRow
                checked={httpsEnabled}
                disabled={formDisabled}
                icon={<ShieldIcon />}
                title="HTTPS"
                description="Use TLS when certificate paths are set."
                actionLabel="Read docs"
                onAction={openHttpsDocs}
                onChange={(checked) => {
                  if (checked && (!String(settings.httpsCertPath || "").trim() || !String(settings.httpsKeyPath || "").trim())) {
                    setMessage(HTTPS_CERTIFICATE_REQUIRED_MESSAGE, true);
                    return;
                  }
                  updateSettings({ httpsEnabled: checked });
                  saveSettings({ patch: { httpsEnabled: checked } });
                }}
              />
            </div>
          </div>

          <aside className="grid min-h-full content-stretch justify-items-center gap-2.5 pt-0.5">
            <span className="block text-center text-[11px] font-medium leading-tight text-[#676c75]">Quick Access (QR)</span>
            <div className="grid h-[124px] w-[124px] place-items-center overflow-hidden rounded-[10px] border border-[#e1e3e7] bg-white text-[#c8ccd4]" aria-label="QR code">
              {qrSrc ? <img className="h-[106px] w-[106px]" src={qrSrc} alt={status.url || "QR code"} /> : <EmptyQrIcon className="h-9 w-9" />}
            </div>
          </aside>
        </div>
      </section>

      <form
        className="m-[9px] rounded-[10px] border border-[#d7d9de] bg-white px-3.5 pb-2.5 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) saveSettings({ forceSave: true, successMessage: "Saved" });
        }}
      >
        <button
          className={`${settingsExpanded ? "mb-2.5 border-b border-[#e1e3e7] pb-2.5" : ""} flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left`}
          type="button"
          aria-controls="settingsPanel"
          aria-expanded={settingsExpanded}
          aria-label={settingsExpanded ? "Hide settings" : "Show settings"}
          id="settingsToggleButton"
          onClick={() => setSettingsExpanded((current) => !current)}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true"><SettingsIcon /></span>
            <span className="m-0 text-base font-[420] leading-none text-[#111]">Settings</span>
          </span>
          <ChevronIcon className={`h-[12px] w-[12px] text-[#555c66] transition-transform ${settingsExpanded ? "rotate-180" : ""}`} />
        </button>
        <div id="settingsPanel" className="mt-2.5 grid gap-2.5" hidden={!settingsExpanded}>
          <div className="grid grid-cols-3 rounded-md border border-[#d7d9de] bg-[#f4f5f7] p-0.5" role="tablist" aria-label="Settings sections">
            <SettingsTabButton active={settingsTab === "general"} controls="generalSettingsPanel" id="generalSettingsTab" onClick={() => setSettingsTab("general")}>General</SettingsTabButton>
            <SettingsTabButton active={settingsTab === "access"} controls="accessSettingsPanel" id="accessSettingsTab" onClick={() => setSettingsTab("access")}>Access</SettingsTabButton>
            <SettingsTabButton active={settingsTab === "security"} controls="securitySettingsPanel" id="securitySettingsTab" onClick={() => setSettingsTab("security")}>Security</SettingsTabButton>
          </div>

          <div id="generalSettingsPanel" role="tabpanel" aria-labelledby="generalSettingsTab" hidden={settingsTab !== "general"}>
            <SettingRow label="Port" help={serverState === "running" ? "Stop the server before changing the port." : "The port the server listens on."}>
              <input
                className={`${settingInputClassName} w-full`}
                type="number"
                min="1"
                max="65535"
                disabled={settingsInputDisabled}
                value={settings.port || 41532}
                onChange={(event) => updateSettings({ port: event.currentTarget.value })}
              />
            </SettingRow>
          </div>

          <div id="accessSettingsPanel" role="tabpanel" aria-labelledby="accessSettingsTab" hidden={settingsTab !== "access"}>
            <SettingRow label="Users" help={authEnabled ? "Viewer can browse. Editor can edit metadata. Admin has all permissions." : "Saved users apply when password protection is enabled."}>
              <div className="grid gap-2">
                <div className="grid grid-cols-[minmax(80px,1fr)_86px_minmax(76px,0.8fr)_28px_28px] gap-1.5 px-0.5 text-[9px] font-medium uppercase leading-none text-[#8a8f99]">
                  <span>Username</span>
                  <span>Role</span>
                  <span>Password</span>
                  <span aria-hidden="true" />
                  <span aria-hidden="true" />
                </div>
                {authUsers.map((user, index) => {
                  const canTogglePasswordVisible = !user.passwordHash;
                  const passwordVisible = canTogglePasswordVisible && passwordVisibleByIndex[String(index)];
                  return (
                    <div key={index} className="grid grid-cols-[minmax(80px,1fr)_86px_minmax(76px,0.8fr)_28px_28px] items-center gap-1.5">
                      <input
                        className={settingInputClassName}
                        type="text"
                        aria-label={`Username for user ${index + 1}`}
                        autoComplete="username"
                        disabled={settingsInputDisabled}
                        value={user.username}
                        onChange={(event) => updateAuthUser(index, { username: event.currentTarget.value })}
                      />
                      <select
                        className={`${settingInputClassName} px-1.5`}
                        aria-label={`Role for ${user.username || `user ${index + 1}`}`}
                        disabled={settingsInputDisabled}
                        value={user.role}
                        onChange={(event) => updateAuthUser(index, { role: event.currentTarget.value as UserRole })}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <input
                        key={`${passwordDraftRevision}-${index}`}
                        className={settingInputClassName}
                        type={passwordVisible ? "text" : "password"}
                        aria-label={`Password for ${user.username || `user ${index + 1}`}`}
                        autoComplete="new-password"
                        disabled={settingsInputDisabled}
                        placeholder={user.passwordHash ? "••••••••" : "Password"}
                        defaultValue={userPasswordsRef.current[String(index)] || ""}
                        onChange={(event) => setUserPasswordDraft(index, event.currentTarget.value)}
                      />
                      <button
                        className={`grid h-7 w-7 place-items-center rounded-md p-1 ${authActionButtonClassName}`}
                        type="button"
                        aria-label={canTogglePasswordVisible ? (passwordVisible ? `Hide password for ${user.username || `user ${index + 1}`}` : `Show password for ${user.username || `user ${index + 1}`}`) : `Saved password for ${user.username || `user ${index + 1}`} is hidden`}
                        title={canTogglePasswordVisible ? (passwordVisible ? "Hide password" : "Show password") : "Saved password is hidden"}
                        disabled={settingsInputDisabled || !canTogglePasswordVisible}
                        onClick={canTogglePasswordVisible ? () => togglePasswordVisible(index) : undefined}
                      >
                        {passwordVisible ? <EyeIcon className="h-[13px] w-[13px]" /> : <EyeOffIcon className="h-[13px] w-[13px]" />}
                      </button>
                      <button className={`grid h-7 w-7 place-items-center rounded-md ${authActionButtonClassName}`} type="button" aria-label={`Remove ${user.username || "user"}`} title="Remove user" disabled={settingsInputDisabled || authUsers.length <= 1} onClick={() => removeAuthUser(index)}>
                        <CloseIcon className="h-[11px] w-[11px]" />
                      </button>
                    </div>
                  );
                })}
                <div className="flex items-center justify-start gap-2">
                  <button className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-[#111] ${authActionButtonClassName}`} type="button" disabled={settingsInputDisabled} onClick={addAuthUser}>
                    <PlusIcon className="h-[12px] w-[12px]" />
                    <span>Add user</span>
                  </button>
                </div>
              </div>
            </SettingRow>
          </div>

          <div id="securitySettingsPanel" role="tabpanel" aria-labelledby="securitySettingsTab" hidden={settingsTab !== "security"}>
            <SettingRow label="TLS Cert" help="PEM certificate file used when HTTPS is enabled.">
              <input
                className={`${settingInputClassName} w-full`}
                type="text"
                disabled={settingsInputDisabled}
                placeholder="/path/to/cert.pem"
                value={settings.httpsCertPath || ""}
                onChange={(event) => updateSettings({ httpsCertPath: event.currentTarget.value })}
              />
            </SettingRow>
            <SettingRow label="TLS Key" help="PEM private key file used when HTTPS is enabled.">
              <input
                className={`${settingInputClassName} w-full`}
                type="text"
                disabled={settingsInputDisabled}
                placeholder="/path/to/key.pem"
                value={settings.httpsKeyPath || ""}
                onChange={(event) => updateSettings({ httpsKeyPath: event.currentTarget.value })}
              />
            </SettingRow>
          </div>

          <div className="flex justify-end border-t border-[#e1e3e7] pt-2">
            <button className={`inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-[#111] ${authActionButtonClassName}`} type="submit" disabled={settingsInputDisabled}>
              Save settings
            </button>
          </div>
        </div>
      </form>
      <p className={`mx-[9px] mb-2.5 mt-0 px-0.5 text-center text-[10px] ${messageIsError ? "text-[#d92d20]" : "text-[#178c35]"}`} aria-live="polite" hidden={!message}>
        {message}
      </p>
    </main>
  );
}

function SectionHeading({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
      <h2 className="m-0 text-base font-[420] leading-none">{children}</h2>
    </div>
  );
}

function StatusBadge({ label, state }: { label: string; state: ServerState }) {
  const palette = {
    error: "border-[#fecaca] bg-[#fef2f2] text-[#b42318] [&>span]:bg-[#d92d20]",
    running: "border-[#b5ebc1] bg-[#e7f8eb] text-[#178c35] [&>span]:bg-[#34c759]",
    stopped: "border-[#d5d9df] bg-[#f3f4f6] text-[#626975] [&>span]:bg-[#9aa2ae]",
  }[state];
  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-[7px] border px-[9px] text-[13px] font-medium ${palette}`}>
      <span className="h-2 w-2 rounded-full" />
      <strong>{label}</strong>
    </span>
  );
}

function PowerSwitch({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="[-webkit-app-region:no-drag] relative block h-7 w-12 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60" aria-label="Start or stop server">
      <input className="absolute opacity-0" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className={`absolute inset-0 rounded-full transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-[22px] after:w-[22px] after:rounded-full after:bg-white after:transition-transform ${checked ? "bg-[#1f74ff] after:translate-x-5" : "bg-[#d7dbe1]"}`} />
    </label>
  );
}

function OptionRow({ actionLabel, checked, description, disabled, icon, onAction, onChange, title }: {
  actionLabel?: string;
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: React.ReactNode;
  onAction?: () => void;
  onChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[14px_24px_minmax(0,1fr)] items-center gap-x-[11px] gap-y-2 has-[:disabled]:opacity-60">
      <input className="h-3.5 w-3.5 cursor-pointer accent-[#1463e8] disabled:cursor-not-allowed" type="checkbox" aria-label={title} checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="grid h-6 w-6 place-items-center rounded-md border border-[#e1e3e7] bg-white text-[#565c66] [&_svg]:h-3 [&_svg]:w-3" aria-hidden="true">{icon}</span>
      <span>
        <strong className="block text-[11px] font-[620] text-[#111]">{title}</strong>
        <small className="mt-0.5 block text-[10px] leading-tight text-[#8a8f99]">
          {description}
          {actionLabel && onAction ? (
            <>
              {" "}
              <button className="border-0 bg-transparent p-0 text-[10px] font-medium text-[#1463e8] underline underline-offset-2 disabled:cursor-not-allowed disabled:text-[#8a8f99]" type="button" disabled={disabled} onClick={onAction}>
                {actionLabel}
              </button>
            </>
          ) : null}
        </small>
      </span>
    </div>
  );
}

function SettingsTabButton({ active, children, controls, id, onClick }: { active: boolean; children: React.ReactNode; controls: string; id: string; onClick: () => void }) {
  return (
    <button
      className={`h-7 rounded-[5px] border-0 px-2 text-[11px] font-medium transition-colors ${active ? "bg-white text-[#111] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "bg-transparent text-[#626975] hover:bg-white/70 hover:text-[#111]"}`}
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SettingRow({ children, help, label }: { children: React.ReactNode; help: string; label: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2.5 border-t border-[#e1e3e7] py-2 first:border-t-0 max-[520px]:grid-cols-1">
      <span className="pt-[7px] text-[11px] font-medium text-[#111]">{label}</span>
      <span className="grid gap-1">
        {children}
        <small className="text-[9px] text-[#8a8f99]">{help}</small>
      </span>
    </div>
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

function Svg({ children, className = "h-6 w-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9">
      {children}
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
}

function ChevronIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="m6 9 6 6 6-6" /></Svg>;
}

function CopyIcon({ className }: { className?: string }) {
  return <Svg className={className}><rect x="9" y="9" width="10" height="10" rx="2" /><rect x="5" y="5" width="10" height="10" rx="2" /></Svg>;
}

function EmptyQrIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="m15 18-.722-3.25" /><path d="M2 8a10.645 10.645 0 0 0 20 0" /><path d="m20 15-1.726-2.05" /><path d="m4 15 1.726-2.05" /><path d="m9 18 .722-3.25" /></Svg>;
}

function EyeIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
}

function EyeOffIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M3 3l18 18" /><path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-3.2 4.1" /><path d="M6.7 6.7C4.1 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.4 4.9-1" /><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" /></Svg>;
}

function GlobeIcon() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9S14.6 18.3 12 21M12 3c-2.6 2.7-3.9 5.7-3.9 9s1.3 6.3 3.9 9" /></Svg>;
}

function PowerIcon() {
  return <Svg><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></Svg>;
}

function PlusIcon({ className }: { className?: string }) {
  return <Svg className={className}><path d="M12 5v14M5 12h14" /></Svg>;
}

function ServerIcon() {
  return <Svg><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></Svg>;
}

function SettingsIcon() {
  return <Svg><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></Svg>;
}

function ShieldIcon() {
  return <Svg><path d="M12 3l7 3v5c0 4.4-2.8 8.3-7 10-4.2-1.7-7-5.6-7-10V6l7-3z" /><path d="m9.5 12 1.8 1.8 3.5-4" /></Svg>;
}

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
