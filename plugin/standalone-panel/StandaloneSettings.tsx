import { useEffect, useRef, useState } from "react";
import { authUserKey, SettingsForm } from "../components/SettingsForm";
import type { PanelSnapshot } from "../service/standalonePanel.cjs";
import type { PanelSettings } from "../service/standaloneSettings.cjs";
import type { AuthUser, LibraryCandidate, PluginSettings, SettingsTab, SharedLibrary } from "../types";
import { errorMessage, postJson, request } from "./panelApi";

function publicNetwork(host: string | undefined) {
  return Boolean(host && !/^(localhost|\[?::1\]?|127\.(\d+\.){2}\d+)$/i.test(host));
}

export function StandaloneSettings({ snapshot, powerPending, onSavingChange, onSnapshot }: {
  snapshot: PanelSnapshot;
  powerPending: boolean;
  onSavingChange(saving: boolean): void;
  onSnapshot(snapshot: PanelSnapshot): void;
}) {
  const [form, setForm] = useState<PanelSettings | null>(null);
  const [draft, setDraft] = useState<PluginSettings>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [passwordRevision, setPasswordRevision] = useState(0);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const unshared = useRef(new Map<string, SharedLibrary>());
  const running = snapshot.servers.some((server) => server.state === "running");
  const locked = running || powerPending || busy;
  const users = draft.authUsers || [];
  const shares = draft.sharedLibraries || [];
  const passwordFor = (user: AuthUser) => {
    const key = authUserKey(user);
    return Object.hasOwn(passwords, key) ? passwords[key] : "";
  };

  function applyForm(next: PanelSettings) {
    setForm(next);
    setDraft(next.settings);
    setPasswords({});
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
      setNotice(null);
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
    const allowAnonymousLan = !draft.authEnabled && (
      (draft.host !== form.settings.host && publicNetwork(draft.host)) ||
      (form.settings.authEnabled && snapshot.servers.some((server) => server.publicNetwork))
    );
    if (allowAnonymousLan && !window.confirm("Public Network without password protection lets anyone on the network browse. Save these settings?")) return;
    setBusy(true);
    onSavingChange(true);
    setNotice(null);
    try {
      const usernameByKey = new Map(users.map((user) => [authUserKey(user), user.username?.trim() || ""]));
      const response = await postJson("/api/settings", {
        revision: form.revision,
        allowAnonymousLan,
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
      });
      const saved: { form: PanelSettings; snapshot: PanelSnapshot } = await response.json();
      applyForm(saved.form);
      onSnapshot(saved.snapshot);
      setNotice({ message: "Settings saved. They apply when the viewer servers start.", error: false });
    } catch (error) {
      setNotice({ message: errorMessage(error), error: true });
    } finally {
      setBusy(false);
      onSavingChange(false);
    }
  }

  if (!form) {
    return (
      <section className="rounded-2xl border border-[#e6e6e9] bg-white p-4 text-[13px]">
        {notice ? <><p role="alert">{notice.message}</p><button type="button" onClick={reload} disabled={busy}>Retry loading settings</button></> : <p role="status">Loading settings…</p>}
      </section>
    );
  }

  const networkOptions = [
    { label: "Public Network", checked: publicNetwork(draft.host), change: (checked: boolean) => update({ host: checked ? "0.0.0.0" : "127.0.0.1" }) },
    { label: "Password protection", checked: Boolean(draft.authEnabled), change: (checked: boolean) => update({ authEnabled: checked }) },
    { label: "HTTPS", checked: Boolean(draft.httpsEnabled), change: (checked: boolean) => update({ httpsEnabled: checked }) },
  ];
  return (
    <SettingsForm
      standalone
      authEnabled={Boolean(draft.authEnabled)}
      authUsers={users}
      busy={busy}
      httpsEnabled={Boolean(draft.httpsEnabled)}
      libraries={{ current: null, items: form.libraries }}
      message={notice?.message || ""}
      messageIsError={Boolean(notice?.error)}
      networkOptions={
        <div className="grid gap-2 border-b border-[#efeff1] pb-3 text-[12px]">
          {running ? <p className="m-0 text-[#8a5a00]" role="note">Stop all viewer servers to edit the shared settings.</p> : null}
          <p className="m-0 text-[#5f6670]">These defaults are shared with the Eagle plugin. CLI and standalone.json server overrides take precedence.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {networkOptions.map(({ label, checked, change }) => (
              <label key={label} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={checked} disabled={locked} onChange={(event) => change(event.currentTarget.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      }
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
  );
}
