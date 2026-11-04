import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthUser, LibraryCandidate, LibraryList, PluginSettings, SettingsTab, SharedLibrary, UserRole } from "../types";
import { ChevronIcon, EyeIcon, EyeOffIcon, FolderOpenIcon, MinusIcon, PlusIcon, RefreshIcon, SettingsIcon, UsersIcon } from "./Icons";

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
  /** "all" lets every user open the library; "selected" only the given users (admins always can). */
  onLibraryUsersChange: (library: LibraryCandidate, access: "all" | "selected", users: string[]) => void;
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
// Table cells drop the input border until hover/focus, so rows read as one list like Libraries.
const tableInputClassName = "h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 text-[12px] text-[#171717] outline-0 transition-[background-color,box-shadow] placeholder:text-[#a3a7ae] hover:bg-[#f4f4f6] focus:border-[#171717] focus:bg-white focus:shadow-[0_0_0_3px_rgba(23,23,23,0.08)] disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[#8a8f99]";
const tableIconButtonClassName = "border-0 bg-transparent p-0 text-[#555c66] hover:bg-[#ececef] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
const authActionButtonClassName = "border border-[#e1e2e6] bg-white text-[#555c66] hover:bg-[#f4f4f6] disabled:cursor-not-allowed disabled:opacity-45";
// Header and rows share one template so the Library, Status, and Users columns line up.
// How a library's `users` refers to an account row while settings are being edited.
export function authUserKey(user: AuthUser) {
  return user.rowKey ?? user.username ?? "";
}

const libraryGridClassName = "grid grid-cols-[minmax(0,1fr)_96px_52px] items-center gap-2 px-3";
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
  onLibraryUsersChange,
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
  const sharedLibraryByPath = new Map((settings.sharedLibraries || []).map((library) => [library.path, library]));
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
      <div id="settingsPanel" className="mt-4 grid gap-2.5" hidden={!settingsExpanded}>
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
            <div className="overflow-hidden rounded-xl border border-[#e6e6e9]" role="table" aria-label="Users">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_28px_86px_28px] items-center gap-1 border-b border-[#efeff1] bg-[#f7f7f8] px-1.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-[#8a8f99]" role="row">
                {/* Headers share the rows' grid and start at the controls' text inset (6px padding + 1px border). */}
                <span className="px-[7px]" role="columnheader">Username</span>
                <span className="px-[7px]" role="columnheader">Password</span>
                <span role="columnheader"><span className="sr-only">Password visibility</span></span>
                <span className="px-[7px]" role="columnheader">Role</span>
                <span className="grid place-items-center" role="columnheader">
                  <span className="sr-only">Actions</span>
                  <button className={`grid h-7 w-7 place-items-center rounded-lg ${tableIconButtonClassName}`} type="button" aria-label="Add user" title="Add user" disabled={settingsInputDisabled} onClick={onAddAuthUser}>
                    <PlusIcon className="h-[14px] w-[14px]" />
                  </button>
                </span>
              </div>
              {authUsers.map((user, index) => {
                const canTogglePasswordVisible = !user.passwordHash;
                const passwordVisible = canTogglePasswordVisible && passwordVisibleByIndex[String(index)];
                return (
                  <div key={index} className="grid min-h-10 grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_28px_86px_28px] items-center gap-1 border-b border-[#efeff1] py-1 pl-1.5 pr-1.5 last:border-b-0" role="row">
                    <div className="min-w-0" role="cell">
                      <input
                        className={tableInputClassName}
                        type="text"
                        aria-label={`Username for user ${index + 1}`}
                        autoComplete="username"
                        disabled={settingsInputDisabled}
                        placeholder="Username"
                        value={user.username}
                        onChange={(event) => onUpdateAuthUser(index, { username: event.currentTarget.value })}
                      />
                    </div>
                    <div className="min-w-0" role="cell">
                      <input
                        key={`${passwordDraftRevision}-${index}`}
                        className={tableInputClassName}
                        type={passwordVisible ? "text" : "password"}
                        aria-label={`Password for ${user.username || `user ${index + 1}`}`}
                        autoComplete="new-password"
                        disabled={settingsInputDisabled}
                        placeholder={user.passwordHash ? "••••••••" : "Password"}
                        defaultValue={userPasswords[String(index)] || ""}
                        onChange={(event) => onUserPasswordDraftChange(index, event.currentTarget.value)}
                      />
                    </div>
                    <div className="grid place-items-center" role="cell">
                      <button
                        className={`grid h-7 w-7 place-items-center rounded-lg ${tableIconButtonClassName}`}
                        type="button"
                        aria-label={canTogglePasswordVisible ? (passwordVisible ? `Hide password for ${user.username || `user ${index + 1}`}` : `Show password for ${user.username || `user ${index + 1}`}`) : `Saved password for ${user.username || `user ${index + 1}`} is hidden`}
                        title={canTogglePasswordVisible ? (passwordVisible ? "Hide password" : "Show password") : "Saved password is hidden"}
                        disabled={settingsInputDisabled || !canTogglePasswordVisible}
                        onClick={canTogglePasswordVisible ? () => onTogglePasswordVisible(index) : undefined}
                      >
                        {passwordVisible ? <EyeIcon className="h-[13px] w-[13px]" /> : <EyeOffIcon className="h-[13px] w-[13px]" />}
                      </button>
                    </div>
                    <div className="relative min-w-0" role="cell">
                      {/* The native select adds its own text inset, so it is drawn plainly to line up with the header. */}
                      <select
                        className={`${tableInputClassName} appearance-none pr-6`}
                        aria-label={`Role for ${user.username || `user ${index + 1}`}`}
                        disabled={settingsInputDisabled}
                        value={user.role}
                        onChange={(event) => onUpdateAuthUser(index, { role: event.currentTarget.value as UserRole })}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <ChevronIcon className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a8f99]" />
                    </div>
                    <div className="grid place-items-center" role="cell">
                      <button className={`grid h-7 w-7 place-items-center rounded-lg ${tableIconButtonClassName} hover:text-[#d92d20]`} type="button" aria-label={`Remove ${user.username || "user"}`} title="Remove user" disabled={settingsInputDisabled || authUsers.length <= 1} onClick={() => onRemoveAuthUser(index)}>
                        <MinusIcon className="h-[14px] w-[14px]" />
                      </button>
                    </div>
                  </div>
                );
              })}
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
          <SettingRow label="Libraries" help="A shared library can be limited to selected users. Admins can always open shared libraries.">
            <div className="grid gap-2">
              {currentLibraryUnshared ? (
                <p className="m-0 rounded-lg border border-[#f5dfa8] bg-[#fffaeb] px-2.5 py-1.5 text-[11px] leading-snug text-[#8a5a00]" role="note">
                  The library open in Eagle is not shared. Viewers see the server as offline.
                </p>
              ) : null}
              {/* Not overflow-hidden: the "Who can open" popover extends past the list. */}
              <div className="rounded-xl border border-[#e6e6e9]">
                {/* Visual only: each checkbox is already named "Share <library>", so the list stays a plain list. */}
                <div className={`${libraryGridClassName} rounded-t-xl border-b border-[#efeff1] bg-[#f7f7f8] py-2 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-[#8a8f99]`} aria-hidden="true">
                  {/* Starts where the library name starts, after the 16px checkbox and its gap. */}
                  <span className="pl-[26px]">Library</span>
                  {/* Ends where the badge text ends, inside the badges' 8px side padding. */}
                  <span className="pr-2 text-right">Status</span>
                  <span className="text-center">Users</span>
                </div>
                <ul className="m-0 grid list-none gap-0 p-0" aria-label="Libraries">
                  {libraries?.items.length ? libraries.items.map((library) => {
                    const checked = sharedLibraryPaths.has(library.path);
                    // Locked inputs only dim the checkbox, so shared rows (white) and unshared rows (gray, muted text)
                    // stay distinct while the server runs.
                    const shared = libraryProtectionEnabled && checked;
                    return (
                      <li key={library.path} className={`relative ${libraryGridClassName} border-b border-[#efeff1] last:rounded-b-xl last:border-b-0 ${shared ? "bg-white" : "bg-[#f7f7f8]"}`}>
                        {/* Only the checkbox toggles sharing: a click on the row is often just closing the user picker. */}
                        <div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-2.5 py-2">
                          <input
                            className="disabled:opacity-50"
                            type="checkbox"
                            aria-label={`Share ${library.name}`}
                            disabled={settingsInputDisabled || !libraryProtectionEnabled}
                            checked={checked}
                            onChange={(event) => onLibrarySharedChange(library, event.currentTarget.checked)}
                          />
                          <span className="min-w-0">
                            <strong className={`block truncate text-[12.5px] font-semibold ${shared ? "text-[#171717]" : "text-[#8a8f99]"}`}>{library.name}</strong>
                            <small className={`block truncate text-[10.5px] ${shared ? "text-[#5f6670]" : "text-[#a3a7ae]"}`} title={library.path}>{library.path}</small>
                          </span>
                        </div>
                        {/* Two fixed slots, so the folder icons line up whether or not the row has a status badge. */}
                        <span className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-1 py-2">
                          <LibraryOpenIcon open={library.current} />
                          {library.shared ? <LibraryStatusBadge online={serverRunning && library.current} /> : null}
                        </span>
                        <span className="flex justify-center py-2">
                          {shared ? (
                            <LibraryUserAccess
                              authEnabled={authEnabled}
                              authUsers={authUsers}
                              disabled={settingsInputDisabled}
                              entry={sharedLibraryByPath.get(library.path)}
                              libraryName={library.name}
                              onChange={(access, users) => onLibraryUsersChange(library, access, users)}
                            />
                          ) : null}
                        </span>
                      </li>
                    );
                  }) : (
                    <li className="px-3 py-2 text-[11.5px] text-[#7a808a]">No libraries found.</li>
                  )}
                </ul>
              </div>
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

// Who can open one shared library: a compact button in the row (people icon with "All" or the number
// of people) that opens the picker. Every button looks the same and has one width, so the column
// lines up; the picker's note says when only admins, or nobody, can open the library. Admins are listed as always allowed, so limiting a
// library never locks out the people who manage the server.
// For a library shared by the saved settings. Online means viewers can open it right now: the server
// is running and this is the library open in Eagle. Otherwise viewers see it as offline.
function LibraryStatusBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 justify-self-end whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${online ? "bg-[#e3f6e8] text-[#16803a]" : "bg-[#f1f1f3] text-[#737373]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#16803a]" : "bg-[#a3a7ae]"}`} aria-hidden="true" />
      {online ? "Online" : "Offline"}
    </span>
  );
}

// Blue on the library open in Eagle, gray on the others; the name is for hover and screen readers.
function LibraryOpenIcon({ open }: { open: boolean }) {
  const label = open ? "Open in Eagle" : "Not open in Eagle";
  return (
    <span className={`grid h-[18px] w-6 place-items-center rounded-full ${open ? "bg-[#eef4ff] text-[#1d4ed8]" : "text-[#b4b8bf]"}`} role="img" aria-label={label} title={label}>
      <FolderOpenIcon className="h-[12px] w-[12px]" />
    </span>
  );
}

// Keeps the button one width; its label and title still give the exact number.
export function libraryUserCountLabel(count: number) {
  return count >= 9 ? "9+" : String(count);
}

function LibraryUserAccess({
  authEnabled,
  authUsers,
  disabled,
  entry,
  libraryName,
  onChange,
}: {
  authEnabled: boolean;
  authUsers: AuthUser[];
  disabled: boolean;
  entry?: SharedLibrary;
  libraryName: string;
  onChange: (access: "all" | "selected", users: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const selected = entry?.access === "selected";
  const users = entry?.users || [];
  const named = authUsers.filter((user) => user.username);
  const selectedCount = named.filter((user) => user.role !== "admin" && users.includes(authUserKey(user))).length;
  const adminCount = named.filter((user) => user.role === "admin").length;
  // Everyone who can open the library, the same people as the ticks in the picker: admins always can.
  const openCount = selectedCount + adminCount;
  const nobody = selected && selectedCount === 0;
  const locked = disabled || !authEnabled;
  const summary = !selected ? "all users" : openCount === 0 ? "nobody" : nobody ? "admins only" : `${openCount} ${openCount === 1 ? "user" : "users"}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        className={`inline-flex h-6 w-12 items-center gap-1 rounded-full border pl-2 pr-1.5 text-[10.5px] font-semibold tabular-nums border-[#e1e2e6] bg-white text-[#5f6670] transition-colors hover:bg-[#f4f4f6] ${authEnabled ? "" : "opacity-60"}`}
        type="button"
        aria-label={`Who can open ${libraryName}: ${summary}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={authEnabled ? `Who can open: ${summary}` : "Applies when password protection is on"}
        onClick={() => setOpen((current) => !current)}
      >
        <UsersIcon className="h-[12px] w-[12px]" />
        <span className="flex-1 text-center">{selected ? libraryUserCountLabel(openCount) : "All"}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1.5 grid w-[220px] gap-2 rounded-xl border border-[#e6e6e9] bg-white p-2.5 text-left shadow-[0_8px_24px_rgba(16,24,40,0.14)]" role="dialog" aria-label={`Who can open ${libraryName}`}>
          <div className="grid gap-1" role="radiogroup" aria-label={`Who can open ${libraryName}`}>
            {(["all", "selected"] as const).map((access) => (
              <label key={access} className="inline-flex items-center gap-1.5 text-[11.5px] text-[#171717] has-[:disabled]:opacity-60">
                <input
                  type="radio"
                  name={`libraryAccess-${entry?.path || libraryName}`}
                  aria-label={access === "all" ? `All users can open ${libraryName}` : `Only selected users can open ${libraryName}`}
                  disabled={locked}
                  checked={access === "selected" ? selected : !selected}
                  onChange={() => onChange(access, access === "selected" ? users : [])}
                />
                <span>{access === "all" ? "All users" : "Selected users"}</span>
              </label>
            ))}
          </div>
          {selected ? (
            <ul className="m-0 grid max-h-[180px] list-none gap-0.5 overflow-auto border-t border-[#efeff1] p-0 pt-2">
              {named.map((user) => {
                const admin = user.role === "admin";
                const key = authUserKey(user);
                return (
                  <li key={key}>
                    <label className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11.5px] text-[#171717] hover:bg-[#f4f4f6] has-[:disabled]:opacity-70" title={admin ? "Admins can open every shared library" : undefined}>
                      <input
                        type="checkbox"
                        aria-label={`Let ${user.username} open ${libraryName}`}
                        disabled={locked || admin}
                        checked={admin || users.includes(key)}
                        onChange={(event) => {
                          const next = event.currentTarget.checked
                            ? [...users, key]
                            : users.filter((entry) => entry !== key);
                          onChange("selected", next);
                        }}
                      />
                      <span className="min-w-0 truncate">{user.username}</span>
                      {admin ? <span className="ml-auto text-[10px] text-[#8a8f99]">admin</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {!authEnabled ? (
            <small className="text-[10.5px] leading-snug text-[#7a808a]">Applies when password protection is on.</small>
          ) : nobody ? (
            <small className={`text-[10.5px] leading-snug ${openCount ? "text-[#b54708]" : "font-semibold text-[#171717]"}`} role="note">{openCount ? "Only admins can open this library." : "Nobody can open this library."} Select users to let them in.</small>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function SettingRow({ children, help, label }: { children: ReactNode; help?: string; label: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t border-[#efeff1] py-3 first:border-t-0 max-[520px]:grid-cols-1">
      <span className="pt-[7px] text-[12px] font-medium text-[#171717]">{label}</span>
      <span className="grid gap-1.5">
        {children}
        {help ? <small className="text-[10.5px] leading-snug text-[#7a808a]">{help}</small> : null}
      </span>
    </div>
  );
}
