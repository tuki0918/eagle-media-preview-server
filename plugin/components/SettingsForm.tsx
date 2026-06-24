import type { ReactNode } from "react";
import type { AuthUser, PluginSettings, SettingsTab, UserRole } from "../types";
import { ChevronIcon, CloseIcon, EyeIcon, EyeOffIcon, PlusIcon, SettingsIcon } from "./Icons";

interface SettingsFormProps {
  authEnabled: boolean;
  authUsers: AuthUser[];
  busy: boolean;
  httpsEnabled: boolean;
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
  onHttpsCertPathChange: (value: string) => void;
  onHttpsKeyPathChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onRemoveAuthUser: (index: number) => void;
  onSaveSettings: () => void;
  onSessionDurationDaysChange: (value: string) => void;
  onSettingsExpandedChange: (updater: (current: boolean) => boolean) => void;
  onSettingsTabChange: (tab: SettingsTab) => void;
  onTogglePasswordVisible: (index: number) => void;
  onUpdateAuthUser: (index: number, patch: AuthUser) => void;
  onUserPasswordDraftChange: (index: number, value: string) => void;
}

const MIN_SESSION_DURATION_DAYS = 1;
const MAX_SESSION_DURATION_DAYS = 365;
const settingInputClassName = "h-7 min-w-0 rounded-md border border-[#d7d9de] bg-white px-2 text-[11px] text-[#111] outline-0 focus:border-[rgba(31,116,255,0.58)] focus:shadow-[0_0_0_3px_rgba(31,116,255,0.12)] disabled:cursor-not-allowed disabled:bg-[#f4f5f7] disabled:text-[#8a8f99]";
const authActionButtonClassName = "border border-[#d7d9de] bg-white text-[#555c66] hover:bg-[#f4f5f7] disabled:cursor-not-allowed disabled:opacity-45";

export function SettingsForm({
  authEnabled,
  authUsers,
  busy,
  httpsEnabled,
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
  onHttpsCertPathChange,
  onHttpsKeyPathChange,
  onPortChange,
  onRemoveAuthUser,
  onSaveSettings,
  onSessionDurationDaysChange,
  onSettingsExpandedChange,
  onSettingsTabChange,
  onTogglePasswordVisible,
  onUpdateAuthUser,
  onUserPasswordDraftChange,
}: SettingsFormProps) {
  return (
    <form
      className="m-[9px] rounded-[10px] border border-[#d7d9de] bg-white px-3.5 pb-2.5 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSaveSettings();
      }}
    >
      <button
        className={`${settingsExpanded ? "mb-2.5 border-b border-[#e1e3e7] pb-2.5" : ""} flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left`}
        type="button"
        aria-controls="settingsPanel"
        aria-expanded={settingsExpanded}
        aria-label={settingsExpanded ? "Hide settings" : "Show settings"}
        id="settingsToggleButton"
        onClick={() => onSettingsExpandedChange((current) => !current)}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true"><SettingsIcon /></span>
          <span className="m-0 text-base font-[420] leading-none text-[#111]">Settings</span>
        </span>
        <ChevronIcon className={`h-[12px] w-[12px] text-[#555c66] transition-transform ${settingsExpanded ? "rotate-180" : ""}`} />
      </button>
      <div id="settingsPanel" className="mt-2.5 grid gap-2.5" hidden={!settingsExpanded}>
        <div className="grid grid-cols-3 rounded-md border border-[#d7d9de] bg-[#f4f5f7] p-0.5" role="tablist" aria-label="Settings sections">
          <SettingsTabButton active={settingsTab === "general"} controls="generalSettingsPanel" id="generalSettingsTab" onClick={() => onSettingsTabChange("general")}>General</SettingsTabButton>
          <SettingsTabButton active={settingsTab === "access"} controls="accessSettingsPanel" id="accessSettingsTab" onClick={() => onSettingsTabChange("access")}>Access</SettingsTabButton>
          <SettingsTabButton active={settingsTab === "security"} controls="securitySettingsPanel" id="securitySettingsTab" onClick={() => onSettingsTabChange("security")}>Security</SettingsTabButton>
        </div>

        <div id="generalSettingsPanel" role="tabpanel" aria-labelledby="generalSettingsTab" hidden={settingsTab !== "general"}>
          <SettingRow label="Port" help={serverRunning ? "Stop the server before changing the port." : "The port the server listens on."}>
            <input
              className={`${settingInputClassName} w-full`}
              type="number"
              min="1"
              max="65535"
              disabled={settingsInputDisabled}
              value={settings.port || 41532}
              onChange={(event) => onPortChange(event.currentTarget.value)}
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
                      className={`grid h-7 w-7 place-items-center rounded-md p-1 ${authActionButtonClassName}`}
                      type="button"
                      aria-label={canTogglePasswordVisible ? (passwordVisible ? `Hide password for ${user.username || `user ${index + 1}`}` : `Show password for ${user.username || `user ${index + 1}`}`) : `Saved password for ${user.username || `user ${index + 1}`} is hidden`}
                      title={canTogglePasswordVisible ? (passwordVisible ? "Hide password" : "Show password") : "Saved password is hidden"}
                      disabled={settingsInputDisabled || !canTogglePasswordVisible}
                      onClick={canTogglePasswordVisible ? () => onTogglePasswordVisible(index) : undefined}
                    >
                      {passwordVisible ? <EyeIcon className="h-[13px] w-[13px]" /> : <EyeOffIcon className="h-[13px] w-[13px]" />}
                    </button>
                    <button className={`grid h-7 w-7 place-items-center rounded-md ${authActionButtonClassName}`} type="button" aria-label={`Remove ${user.username || "user"}`} title="Remove user" disabled={settingsInputDisabled || authUsers.length <= 1} onClick={() => onRemoveAuthUser(index)}>
                      <CloseIcon className="h-[11px] w-[11px]" />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center justify-start gap-2">
                <button className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-[#111] ${authActionButtonClassName}`} type="button" disabled={settingsInputDisabled} onClick={onAddAuthUser}>
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

        <div id="securitySettingsPanel" role="tabpanel" aria-labelledby="securitySettingsTab" hidden={settingsTab !== "security"}>
          <SettingRow label="TLS Cert" help="PEM certificate file used when HTTPS is enabled.">
            <input
              className={`${settingInputClassName} w-full`}
              type="text"
              disabled={settingsInputDisabled}
              placeholder="/path/to/cert.pem"
              value={settings.httpsCertPath || ""}
              onChange={(event) => onHttpsCertPathChange(event.currentTarget.value)}
            />
          </SettingRow>
          <SettingRow label="TLS Key" help="PEM private key file used when HTTPS is enabled.">
            <input
              className={`${settingInputClassName} w-full`}
              type="text"
              disabled={settingsInputDisabled}
              placeholder="/path/to/key.pem"
              value={settings.httpsKeyPath || ""}
              onChange={(event) => onHttpsKeyPathChange(event.currentTarget.value)}
            />
          </SettingRow>
        </div>

        <div className="flex min-h-8 items-center justify-between gap-3 border-t border-[#e1e3e7] pt-2">
          <p className={`min-w-0 flex-1 truncate px-0.5 text-[10px] ${messageIsError ? "text-[#d92d20]" : "text-[#178c35]"}`} aria-live="polite" hidden={!message}>
            {message}
          </p>
          <button className={`ml-auto inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-[#111] ${authActionButtonClassName}`} type="submit" disabled={settingsInputDisabled}>
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

function SettingRow({ children, help, label }: { children: ReactNode; help: string; label: string }) {
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
