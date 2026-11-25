import { useEffect, useMemo, useRef, useState } from "react";
import { authUserKey, SettingsForm } from "../components/SettingsForm";
import { ServerAlert, ServerStartAlert } from "../components/ServerAlert";
import { ServerStatusPanel } from "../components/ServerStatusPanel";
import { createQrDataUrl } from "../qrCode";
import type { PanelServer, PanelSnapshot } from "../service/standalonePanel.cjs";
import type { PanelSettings, PanelSettingSwitch } from "../service/standaloneSettings.cjs";
import type { AuthUser, LibraryCandidate, PluginSettings, SettingsTab, SharedLibrary } from "../types";
import { errorMessage, PanelApiError, postJson, request } from "./panelApi";
import { LibrarySortIndexes } from "./LibrarySortIndexes";

function StandaloneServerStatus({ server, autoStart, pending, busy, onPower, onSwitch }: {
  server: PanelServer;
  autoStart?: boolean;
  pending: "Starting" | "Stopping" | "Restarting" | null;
  busy: boolean;
  onPower(checked: boolean): void;
  onSwitch?: (field: PanelSettingSwitch, checked: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const qrSrc = useMemo(() => server.url ? createQrDataUrl(server.url) : "", [server.url]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(server.url);
      setCopyError("");
      setCopied(true);
    } catch (error) {
      setCopyError(errorMessage(error));
    }
  }

  return (
    <>
      {server.state === "error" && !pending && <ServerStartAlert message={server.error} port={server.port} />}
      {copyError && <ServerAlert title="Could not copy the endpoint URL" message={copyError} />}
      <ServerStatusPanel
        authEnabled={server.authEnabled}
        formDisabled={pending !== null || busy}
        powerDisabled={!server.libraries.length}
        httpsEnabled={server.httpsEnabled}
        publicNetwork={server.publicNetwork}
        qrSrc={qrSrc}
        serverState={server.state}
        settings={{ autoStart }}
        settingsLocked={server.state === "running"}
        sortIndexDetails={server.sortIndexes && <LibrarySortIndexes libraries={server.sortIndexes} />}
        statusLabel={pending || { running: "Running", stopped: "Stopped", error: "Error" }[server.state]}
        statusPending={pending !== null}
        url={server.url}
        urlCopied={copied}
        onAutoStartChange={onSwitch && ((checked) => onSwitch("autoStart", checked))}
        autoStartDescription="Start the server when the CLI starts. When off, start it here."
        onPasswordProtectionChange={onSwitch && ((checked) => onSwitch("authEnabled", checked))}
        onPublicNetworkChange={onSwitch && ((checked) => onSwitch("host", checked))}
        onHttpsEnabledChange={onSwitch && ((checked) => onSwitch("httpsEnabled", checked))}
        onHttpsDocsOpen={() => window.open("https://github.com/tuki0918/eagle-media-preview-server/blob/main/docs/https-mkcert.md", "_blank", "noopener")}
        onCopyAccessUrl={() => void copyUrl()}
        onOpenEndpointUrl={() => server.url && window.open(server.url, "_blank", "noopener")}
        onServerPowerChange={onPower}
      />
      {!server.libraries.length && (
        <p className="m-0 px-1 text-[12px] text-[#5f6670]">Add a library in Settings, then start the server.</p>
      )}
    </>
  );
}

async function submitSettings(path: string, payload: Record<string, unknown>) {
  let response: Response;
  try {
    response = await postJson(path, payload);
  } catch (error) {
    if (!(error instanceof PanelApiError) || error.code !== "confirm_anonymous_lan") throw error;
    if (!window.confirm(error.message)) return null;
    response = await postJson(path, { ...payload, allowAnonymousLan: true });
  }
  const saved: { form: PanelSettings; snapshot: PanelSnapshot } = await response.json();
  return saved;
}

export function StandaloneSettings({ server, pending, onPower, onSnapshot }: {
  server: PanelServer;
  pending: "Starting" | "Stopping" | null;
  onPower(checked: boolean): void;
  onSnapshot(snapshot: PanelSnapshot): void;
}) {
  const [form, setForm] = useState<PanelSettings | null>(null);
  const [draft, setDraft] = useState<PluginSettings>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [passwordRevision, setPasswordRevision] = useState(0);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [expanded, setExpanded] = useState(true);
  const [libraryPath, setLibraryPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState<PanelSettingSwitch | null>(null);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const unshared = useRef(new Map<string, SharedLibrary>());
  const running = server.state === "running";
  const locked = running || pending !== null || busy || switching !== null;
  const users = draft.authUsers || [];
  const shares = draft.sharedLibraries || [];
  const libraries = [...(form?.libraries || [])];
  for (const library of shares) {
    if (!libraries.some((entry) => entry.path === library.path)) {
      libraries.push({ ...library, id: library.path, current: false, shared: false });
    }
  }
  const passwordFor = (user: AuthUser) => {
    const key = authUserKey(user);
    return Object.hasOwn(passwords, key) ? passwords[key] : "";
  };

  function applyForm(next: PanelSettings) {
    setForm(next);
    setDraft(next.settings);
    setNotice(null);
    setPasswords({});
    setLibraryPath("");
    setVisible({});
    setPasswordRevision((current) => current + 1);
    unshared.current.clear();
  }

  async function load(signal?: AbortSignal) {
    setBusy(true);
    try {
      const response = await request("/api/settings", { signal });
      const next: PanelSettings = await response.json();
      if (signal?.aborted) return;
      applyForm(next);
    } catch (error) {
      if (!signal?.aborted) setNotice({ message: errorMessage(error), error: true });
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  function reload() {
    const unsaved = JSON.stringify(draft) !== JSON.stringify(form?.settings) || Object.values(passwords).some(Boolean);
    if (form && unsaved && !window.confirm("Discard unsaved settings and reload from disk?")) return;
    void load();
  }

  function update(patch: PluginSettings) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateUser(index: number, patch: AuthUser) {
    update({ authUsers: users.map((user, i) => i === index ? { ...user, rowKey: authUserKey(user), ...patch } : user) });
  }

  function addUser() {
    let index = users.length + 1;
    const names = new Set(users.map((user) => user.username?.trim().toLowerCase()));
    while (names.has(`viewer${index}`)) index += 1;
    update({ authUsers: [...users, { username: `viewer${index}`, role: "viewer", rowKey: `\u0000${crypto.randomUUID()}` }] });
  }

  function removeUser(index: number) {
    const user = users[index];
    if (!window.confirm(`Remove ${user.username || "this user"} when settings are saved?`)) return;
    const key = authUserKey(user);
    setPasswords((current) => ({ ...current, [key]: "" }));
    setVisible((current) => ({ ...current, [key]: false }));
    setPasswordRevision((current) => current + 1);
    update({ authUsers: users.filter((_, i) => i !== index) });
  }

  function addLibrary() {
    const path = libraryPath.trim().replace(/[\\/]+$/, "");
    if (!path) return;
    const name = path.split(/[\\/]/).pop()?.replace(/\.library$/i, "") || path;
    if (!shares.some((library) => library.path === path)) update({ sharedLibraries: [...shares, { path, name }] });
    setLibraryPath("");
  }

  function changeLibraryShared(library: LibraryCandidate, shared: boolean) {
    const others = shares.filter((entry) => entry.path !== library.path);
    if (shared) {
      update({ sharedLibraries: [...others, unshared.current.get(library.path) ?? { name: library.name, path: library.path }] });
    } else {
      const entry = shares.find((candidate) => candidate.path === library.path);
      if (entry) unshared.current.set(library.path, entry);
      update({ sharedLibraries: others });
    }
  }

  function changeLibraryUsers(library: LibraryCandidate, access: "all" | "selected", selected: string[]) {
    update({
      sharedLibraries: shares.map((entry) => {
        if (entry.path !== library.path) return entry;
        const { access: _access, users: _users, ...rest } = entry;
        return access === "selected" ? { ...rest, access, users: selected } : rest;
      }),
    });
  }

  async function save() {
    if (!form || locked) return;
    setBusy(true);
    setNotice(null);
    try {
      const usernameByKey = new Map(users.map((user) => [authUserKey(user), user.username?.trim() || ""]));
      const payload = {
        revision: form.revision,
        settings: {
          ...draft,
          authUsers: users.map(({ hasPassword: _hasPassword, ...user }) => ({
            ...user,
            password: passwordFor(user) || undefined,
          })),
          sharedLibraries: shares.map((library) => library.access === "selected"
            ? { ...library, users: (library.users || []).flatMap((key) => usernameByKey.get(key) || []) }
            : library),
        },
      };
      const saved = await submitSettings("/api/settings", payload);
      if (!saved) return;
      applyForm(saved.form);
      onSnapshot(saved.snapshot);
      setNotice({ message: "Settings saved. They apply when the viewer starts.", error: false });
    } catch (error) {
      showSettingsError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function showSettingsError(message: string) {
    setExpanded(true);
    setNotice({ message, error: true });
  }

  async function changeSwitch(field: PanelSettingSwitch, checked: boolean) {
    if (!form || pending || busy || switching) return;
    setNotice(null);
    if (checked && field === "authEnabled" && (!form.settings.authUsers.length || form.settings.authUsers.some((user) => !user.hasPassword))) {
      showSettingsError("Save a password for each user in Settings → Access before enabling password protection.");
      return;
    }
    if (checked && field === "httpsEnabled" && (!form.settings.httpsCertPath || !form.settings.httpsKeyPath)) {
      showSettingsError("Save the certificate and key paths in Settings → Security before enabling HTTPS.");
      return;
    }
    setSwitching(field);
    try {
      const saved = await submitSettings("/api/settings/switch", { revision: form.revision, field, checked });
      if (!saved) return;
      const { authEnabled, autoStart, host, httpsEnabled } = saved.form.settings;
      setForm(saved.form);
      update({ authEnabled, autoStart, host, httpsEnabled });
      onSnapshot(saved.snapshot);
    } catch (error) {
      showSettingsError(errorMessage(error));
    } finally {
      setSwitching(null);
    }
  }

  const status = (
    <StandaloneServerStatus
      server={server}
      autoStart={form?.settings.autoStart}
      pending={pending || (switching && switching !== "autoStart" && running ? "Restarting" : null)}
      busy={busy || switching !== null}
      onPower={onPower}
      onSwitch={form ? (field, checked) => void changeSwitch(field, checked) : undefined}
    />
  );

  if (!form) {
    return (
      <>
        {status}
        <section className="rounded-2xl border border-[#e6e6e9] bg-white p-4 text-[13px]">
          {notice ? <><p role="alert">{notice.message}</p><button type="button" onClick={reload} disabled={busy}>Retry loading settings</button></> : <p role="status">Loading settings…</p>}
        </section>
      </>
    );
  }

  return (
    <>
      {status}
      <SettingsForm
        standalone
        authEnabled={Boolean(draft.authEnabled)}
        authUsers={users}
        busy={busy || switching !== null}
        httpsEnabled={Boolean(draft.httpsEnabled)}
        libraries={{ current: null, items: libraries }}
        libraryOptions={
          <div className="flex flex-wrap gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-[#e1e2e6] px-2.5 py-1.5 text-[12px]" type="text" aria-label="Library folder path" placeholder="/path/to/Photos.library" value={libraryPath} disabled={locked}
              onChange={(event) => setLibraryPath(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addLibrary();
              }} />
            <button className="rounded-lg border border-[#e1e2e6] px-3 text-[12px] disabled:opacity-40" type="button" disabled={locked || !libraryPath.trim()} onClick={addLibrary}>Add library</button>
          </div>
        }
        message={notice?.message || ""}
        messageIsError={Boolean(notice?.error)}
        passwordDraftRevision={passwordRevision}
        passwordVisibleByIndex={Object.fromEntries(users.map((user, index) => [index, visible[authUserKey(user)] === true]))}
        serverRunning={running}
        settings={draft}
        settingsExpanded={expanded}
        settingsInputDisabled={locked}
        settingsTab={tab}
        userPasswords={Object.fromEntries(users.map((user, index) => [index, passwordFor(user)]))}
        onAddAuthUser={addUser}
        onCustomDomainChange={(customDomain) => update({ customDomain })}
        onExperimentalSortChange={(experimentalSort) => update({ experimentalSort })}
        onHttpsCertPathChange={(httpsCertPath) => update({ httpsCertPath })}
        onHttpsKeyPathChange={(httpsKeyPath) => update({ httpsKeyPath })}
        onLibraryProtectionChange={(libraryProtectionEnabled) => update({ libraryProtectionEnabled })}
        onLibrarySharedChange={changeLibraryShared}
        onLibraryUsersChange={changeLibraryUsers}
        onPortChange={(port) => update({ port })}
        onReloadLibraries={reload}
        onRemoveAuthUser={removeUser}
        onSaveSettings={() => void save()}
        onSessionDurationDaysChange={(sessionDurationDays) => update({ sessionDurationDays })}
        onSettingsExpandedChange={setExpanded}
        onSettingsTabChange={setTab}
        onTogglePasswordVisible={(index) => {
          const key = authUserKey(users[index]);
          setVisible((current) => ({ ...current, [key]: current[key] !== true }));
        }}
        onUpdateAuthUser={updateUser}
        onUserPasswordDraftChange={(index, value) => {
          const key = authUserKey(users[index]);
          setPasswords((current) => ({ ...current, [key]: value }));
        }}
      />
    </>
  );
}
