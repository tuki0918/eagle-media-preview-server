// The page scripts/settings-screenshots.mjs captures: the real settings form with sample data.
// Only for those screenshots; it never ships with the plugin.
import { createRoot } from "react-dom/client";
import { SettingsForm } from "../plugin/components/SettingsForm";
import type { AuthUser, LibraryList, PluginSettings, SettingsTab } from "../plugin/types";

const authUsers: AuthUser[] = [
  { passwordHash: "sample", role: "admin", username: "admin" },
  { passwordHash: "sample", role: "viewer", username: "guest@example.com" },
];
const sharedLibraries = [
  { name: "MY", path: "/Users/xxx/MY.library" },
  { access: "selected" as const, name: "ICON", path: "/Users/xxx/ICON.library", users: ["guest@example.com"] },
];
const libraries: LibraryList = {
  current: sharedLibraries[1],
  items: [
    { ...sharedLibraries[0], current: false, shared: true },
    { ...sharedLibraries[1], current: true, shared: true },
    { current: false, name: "TEST", path: "/Users/xxx/TEST.library", shared: false },
  ],
};
const settings: PluginSettings = {
  httpsCertPath: "/Users/xxx/127.0.0.1+2.pem",
  httpsKeyPath: "/Users/xxx/127.0.0.1+2-key.pem",
  libraryProtectionEnabled: true,
  port: 41532,
  sessionDurationDays: 7,
  sharedLibraries,
};
const noop = () => {};
const root = document.getElementById("root")!;
const tab = (new URLSearchParams(location.search).get("tab") || "general") as SettingsTab;
// A library only shows Online while the server runs, and a running server locks the settings.
const serverRunning = tab === "libraries";

createRoot(root).render(
  <SettingsForm
    authEnabled
    authUsers={authUsers}
    busy={false}
    httpsEnabled
    libraries={libraries}
    message=""
    messageIsError={false}
    passwordDraftRevision={0}
    passwordVisibleByIndex={{}}
    serverRunning={serverRunning}
    settings={settings}
    settingsExpanded
    settingsInputDisabled={serverRunning}
    settingsTab={tab}
    userPasswords={{}}
    onAddAuthUser={noop}
    onChooseHttpsFile={noop}
    onCustomDomainChange={noop}
    onHttpsCertPathChange={noop}
    onHttpsKeyPathChange={noop}
    onLibraryProtectionChange={noop}
    onLibrarySharedChange={noop}
    onLibraryUsersChange={noop}
    onSwitchLibrary={noop}
    onPortChange={noop}
    onReloadLibraries={noop}
    onRemoveAuthUser={noop}
    onSaveSettings={noop}
    onSessionDurationDaysChange={noop}
    onSettingsExpandedChange={noop}
    onSettingsTabChange={noop}
    onTogglePasswordVisible={noop}
    onUpdateAuthUser={noop}
    onUserPasswordDraftChange={noop}
  />,
);

// The capture script reads this to size the window to the form.
void document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    document.documentElement.dataset.captureHeight = String(Math.ceil(root.getBoundingClientRect().height));
  });
});
