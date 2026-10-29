import type { ReactNode } from "react";
import type { AuthUser, LibraryCandidate, LibraryList, PluginSettings, SettingsTab, UserRole } from "../types";
import { ChevronIcon, CloseIcon, EyeIcon, EyeOffIcon, FolderOpenIcon, PlusIcon, RefreshIcon, SettingsIcon } from "./Icons";

interface SettingsFormProps {
  authEnabled: boolean;
  authUsers: AuthUser[];
  busy: boolean;
  httpsEnabled: boolean;
  libraries: LibraryList | null;
  message: string;
  messageIsError: boolean;
  passwordDraftRevision: number;
  passwordVisibleByIndex: Record<string, boolean>;
  serverRunning: boolean;
  settings: PluginSettings;
  settingsExpanded: boolean;
  settingsInputDisabled: boolean;
  settingsTab: SettingsTab;
  userPasswords: Record<string, string>;
  onAddAuthUser: () => void;
  /** Opens Eagle's file picker for a TLS file; omitted when the dialog API is unavailable. */
  onChooseHttpsFile?: (field: HttpsFileField) => void;
  onCustomDomainChange: (value: string) => void;
  onHttpsCertPathChange: (value: string) => void;
  onHttpsKeyPathChange: (value: string) => void;
  onLibraryProtectionChange: (checked: boolean) => void;
  onLibrarySharedChange: (library: LibraryCandidate, shared: boolean) => void;
  onPortChange: (value: string) => void;
  onReloadLibraries: () => void;
  onRemoveAuthUser: (index: number) => void;
  onSaveSettings: () => void;
  onSessionDurationDaysChange: (value: string) => void;
  onSettingsExpandedChange: (updater: (current: boolean) => boolean) => void;
  onSettingsTabChange: (tab: SettingsTab) => void;
  onTogglePasswordVisible: (index: number) => void;
  onUpdateAuthUser: (index: number, patch: AuthUser) => void;
  onUserPasswordDraftChange: (index: number, value: string) => void;
}

export type HttpsFileField = "cert" | "key";

const DEFAULT_PORT = 41532;
const MIN_SESSION_DURATION_DAYS = 1;
const MAX_SESSION_DURATION_DAYS = 365;
const settingInputClassName = "h-8 min-w-0 rounded-lg border border-[#e1e2e6] bg-white px-2.5 text-[12px] text-[#171717] outline-0 transition-shadow placeholder:text-[#a3a7ae] focus:border-[#171717] focus:shadow-[0_0_0_3px_rgba(23,23,23,0.08)] disabled:cursor-not-allowed disabled:bg-[#f4f5f7] disabled:text-[#8a8f99]";
const authActionButtonClassName = "border border-[#e1e2e6] bg-white text-[#555c66] hover:bg-[#f4f4f6] disabled:cursor-not-allowed disabled:opacity-45";
const primaryButtonClassName = "border border-[#171717] bg-[#171717] text-white hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-35";

export function SettingsForm({
  authEnabled,
  authUsers,
  busy,
  httpsEnabled,
  libraries,
  message,
  messageIsError,
  passwordDraftRevision,
  passwordVisibleByIndex,
  serverRunning,
  settings,
  settingsExpanded,
  settingsInputDisabled,
  settingsTab,
  userPasswords,
  onAddAuthUser,
  onChooseHttpsFile,
  onCustomDomainChange,
  onHttpsCertPathChange,
  onHttpsKeyPathChange,
  onLibraryProtectionChange,
  onLibrarySharedChange,
  onPortChange,
  onReloadLibraries,
  onRemoveAuthUser,
  onSaveSettings,
  onSessionDurationDaysChange,
  onSettingsExpandedChange,
  onSettingsTabChange,
  onTogglePasswordVisible,
  onUpdateAuthUser,
  onUserPasswordDraftChange,
}: SettingsFormProps) {
  const libraryProtectionEnabled = Boolean(settings.libraryProtectionEnabled);
  // Checkboxes reflect the unsaved draft; the running server keeps the list it started with.
  const sharedLibraryPaths = new Set((settings.sharedLibraries || []).map((library) => library.path));
  const currentLibraryUnshared = libraryProtectionEnabled && Boolean(libraries?.items.some((library) => library.current && !sharedLibraryPaths.has(library.path)));
  return (
    <form
      className="rounded-2xl border border-[#e6e6e9] bg-white px-4 pb-3 pt-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSaveSettings();
      }}
    >
      <button
        className={`${settingsExpanded ? "mb-1" : ""} flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left`}
        type="button"
        aria-controls="settingsPanel"
        aria-expanded={settingsExpanded}
        aria-label={settingsExpanded ? "Hide settings" : "Show settings"}
        id="settingsToggleButton"
        onClick={() => onSettingsExpandedChange((current) => !current)}
      >
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true"><SettingsIcon /></span>
          <span className="m-0 text-[15px] font-semibold leading-none text-[#171717]">Settings</span>
        </span>
        <ChevronIcon className={`h-[14px] w-[14px] text-[#555c66] transition-transform ${settingsExpanded ? "rotate-180" : ""}`} />
      </button>
      <div id="settingsPanel" className="mt-2.5 grid gap-2.5" hidden={!settingsExpanded}>
        <div className="grid grid-cols-4 rounded-full bg-[#f1f1f3] p-1" role="tablist" aria-label="Settings sections">
          <SettingsTabButton active={settingsTab === "general"} controls="generalSettingsPanel" id="generalSettingsTab" onClick={() => onSettingsTabChange("general")}>General</SettingsTabButton>
          <SettingsTabButton active={settingsTab === "access"} controls="accessSettingsPanel" id="accessSettingsTab" onClick={() => onSettingsTabChange("access")}>Access</SettingsTabButton>
          <SettingsTabButton active={settingsTab === "libraries"} controls="librariesSettingsPanel" id="librariesSettingsTab" onClick={() => onSettingsTabChange("libraries")}>Libraries</SettingsTabButton>
          <SettingsTabButton active={settingsTab === "security"} controls="securitySettingsPanel" id="securitySettingsTab" onClick={() => onSettingsTabChange("security")}>Security</SettingsTabButton>
        </div>

        <div id="generalSettingsPanel" role="tabpanel" aria-labelledby="generalSettingsTab" hidden={settingsTab !== "general"}>
          <SettingRow label="Hostname" help="Optional. Used for the endpoint URL and QR code.">
            <input
              className={`${settingInputClassName} w-full`}
              type="text"
              aria-label="Hostname"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              disabled={settingsInputDisabled}
              placeholder="hostname.local"
              value={settings.customDomain || ""}
              onChange={(event) => onCustomDomainChange(event.currentTarget.value)}
            />
          </SettingRow>
          <SettingRow label="Port" help={serverRunning ? "Stop the server before changing the port." : `The port the server listens on. Default: ${DEFAULT_PORT}.`}>
            <input
              className={`${settingInputClassName} w-24`}
              type="number"
              min="1"
              max="65535"
              aria-label="Port"
              disabled={settingsInputDisabled}
              value={settings.port ?? DEFAULT_PORT}
              onChange={(event) => onPortChange(event.currentTarget.value)}
            />
          </SettingRow>
        </div>

        <div id="accessSettingsPanel" role="tabpanel" aria-labelledby="accessSettingsTab" hidden={settingsTab !== "access"}>
          <SettingRow label="Users" help={authEnabled ? "Viewer can browse. Editor can edit metadata. Admin has all permissions." : "Saved users apply when password protection is enabled."}>
            <div className="grid gap-2">
              <div className="grid grid-cols-[minmax(80px,1fr)_86px_minmax(76px,0.8fr)_32px_32px] gap-1.5 px-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-[#8a8f99]">
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
                  <div key={index} className="grid grid-cols-[minmax(80px,1fr)_86px_minmax(76px,0.8fr)_32px_32px] items-center gap-1.5">
                    <input
                      className={settingInputClassName}
                      type="text"
                      aria-label={`Username for user ${index + 1}`}
                      autoComplete="username"
                      disabled={settingsInputDisabled}
                      value={user.username}
                      onChange={(event) => onUpdateAuthUser(index, { username: event.currentTarget.value })}
                    />
                    <select
                      className={`${settingInputClassName} px-1.5`}
                      aria-label={`Role for ${user.username || `user ${index + 1}`}`}
                      disabled={settingsInputDisabled}
                      value={user.role}
                      onChange={(event) => onUpdateAuthUser(index, { role: event.currentTarget.value as UserRole })}
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
                      defaultValue={userPasswords[String(index)] || ""}
                      onChange={(event) => onUserPasswordDraftChange(index, event.currentTarget.value)}
                    />
                    <button
                      className={`grid h-8 w-8 place-items-center rounded-lg p-1 ${authActionButtonClassName}`}
                      type="button"
                      aria-label={canTogglePasswordVisible ? (passwordVisible ? `Hide password for ${user.username || `user ${index + 1}`}` : `Show password for ${user.username || `user ${index + 1}`}`) : `Saved password for ${user.username || `user ${index + 1}`} is hidden`}
                      title={canTogglePasswordVisible ? (passwordVisible ? "Hide password" : "Show password") : "Saved password is hidden"}
                      disabled={settingsInputDisabled || !canTogglePasswordVisible}
                      onClick={canTogglePasswordVisible ? () => onTogglePasswordVisible(index) : undefined}
                    >
                      {passwordVisible ? <EyeIcon className="h-[13px] w-[13px]" /> : <EyeOffIcon className="h-[13px] w-[13px]" />}
                    </button>
                    <button className={`grid h-8 w-8 place-items-center rounded-lg ${authActionButtonClassName}`} type="button" aria-label={`Remove ${user.username || "user"}`} title="Remove user" disabled={settingsInputDisabled || authUsers.length <= 1} onClick={() => onRemoveAuthUser(index)}>
                      <CloseIcon className="h-[11px] w-[11px]" />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-start gap-2">
                <button className={`inline-flex h-8 items-center gap-1.5 rounded-full border-dashed px-3 text-[12px] font-medium text-[#171717] ${authActionButtonClassName}`} type="button" disabled={settingsInputDisabled} onClick={onAddAuthUser}>
                  <PlusIcon className="h-[12px] w-[12px]" />
                  <span>Add user</span>
                </button>
              </div>
            </div>
          </SettingRow>
          <SettingRow label="Session" help="How long browser sign-ins stay active. Shorter durations can require signing in again.">
            <div className="grid grid-cols-[minmax(0,96px)_1fr] items-center gap-2">
              <input
                className={`${settingInputClassName} w-full`}
                type="number"
                min={MIN_SESSION_DURATION_DAYS}
                max={MAX_SESSION_DURATION_DAYS}
                disabled={settingsInputDisabled}
                aria-label="Session duration in days"
                value={settings.sessionDurationDays || 7}
                onChange={(event) => onSessionDurationDaysChange(event.currentTarget.value)}
              />
              <span className="min-w-0 text-[11px] leading-tight text-[#676c75]">days</span>
            </div>
          </SettingRow>
        </div>

        <div id="librariesSettingsPanel" role="tabpanel" aria-labelledby="librariesSettingsTab" hidden={settingsTab !== "libraries"}>
          <SettingRow label="Protection" help={serverRunning ? "Stop the server before changing shared libraries." : "When on, the viewer serves only the libraries checked below. While another library is open in Eagle, viewers see it as offline."}>
            <label className="inline-flex items-center gap-2 text-[12px] text-[#171717] has-[:disabled]:opacity-60">
              <input
                type="checkbox"
                aria-label="Share only selected libraries"
                disabled={settingsInputDisabled}
                checked={libraryProtectionEnabled}
                onChange={(event) => onLibraryProtectionChange(event.currentTarget.checked)}
              />
              <span>Share only selected libraries</span>
            </label>
          </SettingRow>
          <SettingRow label="Libraries" help="Applied when the server starts. Libraries come from Eagle's recent list.">
            <div className="grid gap-2">
              {libraries && !libraries.eagleAvailable ? (
                <p className="m-0 text-[11px] leading-snug text-[#8a5a00]" role="note">Eagle API is unavailable, so only saved libraries are listed.</p>
              ) : null}
              {currentLibraryUnshared ? (
                <p className="m-0 rounded-lg border border-[#f5dfa8] bg-[#fffaeb] px-2.5 py-1.5 text-[11px] leading-snug text-[#8a5a00]" role="note">
                  The library open in Eagle is not shared. Viewers see the server as offline.
                </p>
              ) : null}
              <ul className="m-0 grid list-none gap-0 overflow-hidden rounded-xl border border-[#e6e6e9] p-0" aria-label="Libraries">
                {libraries?.items.length ? libraries.items.map((library) => (
                  <li key={library.path} className="border-b border-[#efeff1] last:border-b-0">
                    <label className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 has-[:disabled]:opacity-60">
                      <input
                        type="checkbox"
                        aria-label={`Share ${library.name}`}
                        disabled={settingsInputDisabled || !libraryProtectionEnabled}
                        checked={sharedLibraryPaths.has(library.path)}
                        onChange={(event) => onLibrarySharedChange(library, event.currentTarget.checked)}
                      />
                      <span className="min-w-0">
                        <strong className="block truncate text-[12.5px] font-semibold text-[#171717]">{library.name}</strong>
                        <small className="block truncate text-[10.5px] text-[#7a808a]" title={library.path}>{library.path}</small>
                      </span>
                      {library.current ? (
                        <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[10px] font-semibold text-[#1d4ed8]">Open in Eagle</span>
                      ) : <span aria-hidden="true" />}
                    </label>
                  </li>
                )) : (
                  <li className="px-3 py-2 text-[11.5px] text-[#7a808a]">No libraries found.</li>
                )}
              </ul>
              <div className="flex items-center justify-start gap-2">
                <button className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-[#171717] ${authActionButtonClassName}`} type="button" disabled={busy} onClick={onReloadLibraries}>
                  <RefreshIcon className="h-[12px] w-[12px]" />
                  <span>Reload libraries</span>
                </button>
              </div>
            </div>
          </SettingRow>
        </div>

        <div id="securitySettingsPanel" role="tabpanel" aria-labelledby="securitySettingsTab" hidden={settingsTab !== "security"}>
          <SettingRow label="TLS Cert" help="PEM certificate file used when HTTPS is enabled.">
            <FilePathInput
              chooseLabel="Choose certificate file"
              disabled={settingsInputDisabled}
              inputLabel="TLS certificate path"
              placeholder="/path/to/cert.pem"
              value={settings.httpsCertPath || ""}
              onChange={onHttpsCertPathChange}
              onChoose={onChooseHttpsFile ? () => onChooseHttpsFile("cert") : undefined}
            />
          </SettingRow>
          <SettingRow label="TLS Key" help="PEM private key file used when HTTPS is enabled.">
            <FilePathInput
              chooseLabel="Choose private key file"
              disabled={settingsInputDisabled}
              inputLabel="TLS key path"
              placeholder="/path/to/key.pem"
              value={settings.httpsKeyPath || ""}
              onChange={onHttpsKeyPathChange}
              onChoose={onChooseHttpsFile ? () => onChooseHttpsFile("key") : undefined}
            />
          </SettingRow>
        </div>

        <div className="flex min-h-9 items-center justify-between gap-3 border-t border-[#efeff1] pt-3">
          <p className={`min-w-0 flex-1 truncate px-0.5 text-[10px] ${messageIsError ? "text-[#d92d20]" : "text-[#178c35]"}`} aria-live="polite" hidden={!message}>
            {message}
          </p>
          <button className={`ml-auto inline-flex h-8 items-center rounded-full px-4 text-[12px] font-semibold ${primaryButtonClassName}`} type="submit" disabled={settingsInputDisabled}>
            Save settings
          </button>
        </div>
      </div>
    </form>
  );
}

function SettingsTabButton({ active, children, controls, id, onClick }: { active: boolean; children: ReactNode; controls: string; id: string; onClick: () => void }) {
  return (
    <button
      className={`h-7 rounded-full border-0 px-2 text-[12px] font-medium transition-colors ${active ? "bg-white text-[#171717] shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "bg-transparent text-[#6b7079] hover:text-[#171717]"}`}
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

function FilePathInput({
  chooseLabel,
  disabled,
  inputLabel,
  placeholder,
  value,
  onChange,
  onChoose,
}: {
  chooseLabel: string;
  disabled: boolean;
  inputLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onChoose?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        className={`${settingInputClassName} w-full`}
        type="text"
        disabled={disabled}
        aria-label={inputLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {onChoose ? (
        <button
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${authActionButtonClassName}`}
          type="button"
          disabled={disabled}
          aria-label={chooseLabel}
          title={chooseLabel}
          onClick={onChoose}
        >
          <FolderOpenIcon className="h-[14px] w-[14px]" />
        </button>
      ) : null}
    </div>
  );
}

function SettingRow({ children, help, label }: { children: ReactNode; help: string; label: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t border-[#efeff1] py-3 first:border-t-0 max-[520px]:grid-cols-1">
      <span className="pt-[7px] text-[12px] font-medium text-[#171717]">{label}</span>
      <span className="grid gap-1.5">
        {children}
        <small className="text-[10.5px] leading-snug text-[#7a808a]">{help}</small>
      </span>
    </div>
  );
}
