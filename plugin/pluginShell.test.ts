import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build as esbuild } from "esbuild";
import { JSDOM } from "jsdom";

type PluginRequirePath = (relativePath: string) => string;
const generatedServiceUrl = new URL("../dist/.generated/plugin-service/", import.meta.url);

async function readPluginAppSource() {
  return readFile(new URL("./app.tsx", import.meta.url), "utf8");
}

async function readPluginComponentSource(name: string) {
  return readFile(new URL(`./components/${name}.tsx`, import.meta.url), "utf8");
}

async function readPluginUiSource() {
  const [app, serverStatusPanel, settingsForm, icons, types] = await Promise.all([
    readPluginAppSource(),
    readPluginComponentSource("ServerStatusPanel"),
    readPluginComponentSource("SettingsForm"),
    readPluginComponentSource("Icons"),
    readFile(new URL("./types.ts", import.meta.url), "utf8"),
  ]);
  return [app, serverStatusPanel, settingsForm, icons, types].join("\n");
}

async function waitFor(predicate: () => boolean, { timeoutMs = 1000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

test("manifest declares an Eagle background service management window", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.name, "Media Preview Server");
  assert.equal(manifest.description, "A local media preview server for your Eagle library.");
  assert.equal(manifest.logo, "/plugin/assets/icon_on.png");
  assert.equal(manifest.main.serviceMode, true);
  assert.equal(manifest.main.url, "plugin/index.html");
  assert.equal(manifest.main.width, 600);
  assert.equal(manifest.main.height, 600);
  assert.equal(manifest.main.minWidth, 600);
  assert.equal(manifest.main.minHeight, 600);
  assert.equal(manifest.main.resizable, true);
  assert.equal(manifest.main.maximizable, true);
});

test("plugin window renders the management UI from React", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readPluginAppSource();
  const uiSource = await readPluginUiSource();

  assert.match(html, /id="root"/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.match(app, /function App\(\)/);
  assert.match(app, /createRoot\(root\)\.render/);
  assert.match(uiSource, /Media Preview Server/);
  assert.match(uiSource, /Start or stop server/);
  assert.match(uiSource, /Endpoint URL/);
  assert.match(uiSource, /Quick Access \(QR\)/);
  assert.match(uiSource, /<span className="m-0 text-\[15px\] font-semibold leading-none text-\[#171717\]">Settings<\/span>/);
  assert.match(app, /src=\{serverState === "running" \? "\.\/assets\/icon_on\.svg" : "\.\/assets\/icon_off\.svg"\}/);
  assert.doesNotMatch(uiSource, /<select\s+hidden/);
  assert.doesNotMatch(uiSource, /<button type="submit" hidden/);
  assert.doesNotMatch(html, /id="requestLogBody"/);
  assert.doesNotMatch(html, /id="requestLogEnabledInput"/);
  assert.doesNotMatch(html, /id="grid"/);
});

test("plugin app delegates management panels to focused components", async () => {
  const app = await readPluginAppSource();
  const serverStatusPanel = await readPluginComponentSource("ServerStatusPanel");
  const settingsForm = await readPluginComponentSource("SettingsForm");

  assert.match(app, /<ServerStatusPanel/);
  assert.match(app, /<SettingsForm/);
  assert.match(serverStatusPanel, /function ServerStatusPanel/);
  assert.match(settingsForm, /function SettingsForm/);
});

test("plugin restart detection is shared between the window and runtime", async () => {
  const app = await readPluginAppSource();
  const runtimeSource = await readFile(new URL("./service/runtime.cts", import.meta.url), "utf8");

  assert.match(app, /from "\.\/settingsChange"/);
  assert.match(runtimeSource, /require\("\.\/settingsChange\.cjs"\)/);
  assert.doesNotMatch(app, /function serverRestartSettingsChanged\(/);
  assert.doesNotMatch(runtimeSource, /function needsServerRestart\(/);
});

test("plugin window uses per-user roles for metadata permissions", async () => {
  const app = await readPluginAppSource();
  const uiSource = await readPluginUiSource();

  assert.match(uiSource, /<option value="viewer">Viewer<\/option>/);
  assert.match(uiSource, /<option value="editor">Editor<\/option>/);
  assert.match(uiSource, /<option value="admin">Admin<\/option>/);
  assert.match(uiSource, /type SettingsTab = "access" \| "general" \| "libraries" \| "security";/);
  assert.match(app, /const \[settingsTab, setSettingsTab\] = useState<SettingsTab>\("general"\);/);
  assert.match(uiSource, /role="tablist" aria-label="Settings sections"/);
  assert.match(uiSource, /<SettingsTabButton active=\{settingsTab === "general"\} controls="generalSettingsPanel" id="generalSettingsTab" onClick=\{\(\) => onSettingsTabChange\("general"\)\}>General<\/SettingsTabButton>/);
  assert.match(uiSource, /<SettingsTabButton active=\{settingsTab === "access"\} controls="accessSettingsPanel" id="accessSettingsTab" onClick=\{\(\) => onSettingsTabChange\("access"\)\}>Access<\/SettingsTabButton>/);
  assert.match(uiSource, /<SettingsTabButton active=\{settingsTab === "security"\} controls="securitySettingsPanel" id="securitySettingsTab" onClick=\{\(\) => onSettingsTabChange\("security"\)\}>Security<\/SettingsTabButton>/);
  assert.match(uiSource, /id="generalSettingsPanel" role="tabpanel" aria-labelledby="generalSettingsTab" hidden=\{settingsTab !== "general"\}/);
  assert.match(uiSource, /id="accessSettingsPanel" role="tabpanel" aria-labelledby="accessSettingsTab" hidden=\{settingsTab !== "access"\}/);
  assert.match(uiSource, /id="securitySettingsPanel" role="tabpanel" aria-labelledby="securitySettingsTab" hidden=\{settingsTab !== "security"\}/);
  assert.doesNotMatch(uiSource, /id="authUsersStatus"/);
  assert.doesNotMatch(uiSource, /const metadataEditingEnabled/);
  assert.doesNotMatch(uiSource, /const authUsersStatusLabel/);
  assert.doesNotMatch(uiSource, /Active editors/);
  assert.doesNotMatch(uiSource, /Active viewers/);
  assert.doesNotMatch(uiSource, /Active/);
  assert.doesNotMatch(uiSource, /Inactive/);
  assert.doesNotMatch(uiSource, /metadataEditingEnabled\s*\?/);
  assert.doesNotMatch(uiSource, /id="authUsersStatus"[^>]+role="status"/);
  assert.match(uiSource, /Saved users apply when password protection is enabled\./);
  assert.match(uiSource, /Admin has all permissions\./);
  assert.match(uiSource, /<span className="px-\[7px\]" role="columnheader">Username<\/span>/);
  assert.match(uiSource, /<span className="px-\[7px\]" role="columnheader">Role<\/span>/);
  assert.match(uiSource, /<span className="px-\[7px\]" role="columnheader">Password<\/span>/);
  assert.match(uiSource, /aria-label=\{`Username for user \$\{index \+ 1\}`\}/);
  assert.match(uiSource, /aria-label=\{`Role for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\}/);
  assert.match(uiSource, /aria-label=\{`Password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\}/);
  assert.match(uiSource, /aria-label="Add user" title="Add user"/);
  assert.match(uiSource, /<PlusIcon className="h-\[14px\] w-\[14px\]" \/>/);
  assert.match(uiSource, /<MinusIcon className="h-\[14px\] w-\[14px\]" \/>/);
  assert.match(uiSource, /role="table" aria-label="Users"/);
  assert.match(uiSource, /const settingInputClassName = /);
  assert.match(uiSource, /className=\{tableInputClassName\}/);
  assert.match(uiSource, /className=\{`\$\{tableInputClassName\} appearance-none pr-6`\}/);
  assert.match(uiSource, /const authActionButtonClassName = /);
  assert.match(uiSource, /\$\{authActionButtonClassName\}/);
  assert.match(uiSource, /disabled:cursor-not-allowed disabled:opacity-45/);
  assert.match(uiSource, /disabled:cursor-not-allowed disabled:bg-\[#f4f5f7\] disabled:text-\[#8a8f99\]/);
  assert.match(uiSource, /has-\[:disabled\]:cursor-not-allowed has-\[:disabled\]:opacity-60/);
  assert.match(uiSource, /disabled:cursor-not-allowed" type="checkbox"/);
  assert.match(uiSource, /function SettingRow\(\{ children, help, label \}/);
  assert.doesNotMatch(uiSource, /<label className="grid grid-cols-\[72px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(uiSource, /Admin is reserved for full management permissions/);
  assert.doesNotMatch(uiSource, /title="Editor roles"/);
  assert.doesNotMatch(uiSource, /function EditIcon\(/);
  assert.doesNotMatch(app, /const \[password, setPassword\]/);
  assert.match(app, /const \[passwordVisibleByIndex, setPasswordVisibleByIndex\] = useState<Record<string, boolean>>\(\{\}\);/);
  assert.match(app, /const \[passwordDraftRevision, setPasswordDraftRevision\] = useState\(0\);/);
  assert.match(app, /const userPasswordsRef = useRef<Record<string, string>>\(\{\}\);/);
  assert.match(app, /const settingsInputDisabled = formDisabled \|\| serverState === "running";/);
  assert.match(app, /forceSave = false/);
  assert.match(app, /successMessage = ""/);
  assert.match(app, /if \(saved && hasUserPasswords\) clearUserPasswordDrafts\(\);/);
  assert.match(app, /if \(saved\) setMessage\(successMessage\);/);
  assert.match(app, /if \(hasUserPasswords\) clearUserPasswordDrafts\(\);/);
  assert.match(app, /if \(!forceSave && !hasUserPasswords && !settingsPayloadChanged\(settings, payload\)\)/);
  assert.match(app, /const AUTH_PASSWORD_REQUIRED_MESSAGE = "Enter a password for every user before enabling password protection\.";/);
  assert.match(app, /const nextAuthEnabled = Boolean\(patch\.authEnabled \?\? authEnabled\);/);
  assert.match(app, /if \(nextAuthEnabled && authUsersMissingPassword\(effectiveAuthUsers, passwordDrafts\)\)/);
  assert.match(app, /setMessage\(AUTH_PASSWORD_REQUIRED_MESSAGE, true\);/);
  assert.doesNotMatch(app, /const nextAllowMetadataEditing = nextAuthEnabled && authUsersCanEditMetadata\(effectiveAuthUsers\);/);
  assert.match(app, /function errorMessage\(error: unknown\)/);
  assert.match(app, /setMessage\(errorMessage\(error\), true\);/);
  assert.doesNotMatch(app, /setMessage\(error instanceof Error \? error\.message : String\(error\), true\);/);
  assert.match(app, /function updateAuthUsers\(nextUsers: AuthUser\[\]\)/);
  assert.doesNotMatch(app, /allowMetadataEditing: authEnabled && authUsersCanEditMetadata\(nextUsers\)/);
  assert.doesNotMatch(app, /function saveAuthUser/);
  assert.doesNotMatch(app, /saveAuthUser\(/);
  assert.match(uiSource, /onChange=\{\(event\) => onUpdateAuthUser\(index, ROLE_CHOICES\[event\.currentTarget\.value as RoleChoice\]\)\}/);
  assert.doesNotMatch(app, /saveSettings\(\{ patch: \{ authUsers: authUsers\.map/);
  assert.match(app, /const cleanUserPasswords = collectUserPasswords\(effectiveAuthUsers, passwordDrafts\);/);
  assert.match(app, /function collectUserPasswords\(users: AuthUser\[\], values: Record<string, string>\)/);
  assert.match(app, /function authUsersMissingPassword\(users: AuthUser\[\], values: Record<string, string>\)/);
  assert.doesNotMatch(app, /Object\.fromEntries\(effectiveAuthUsers\s*\n\s*\.map/);
  assert.doesNotMatch(app, /authUsers\.some\(\(user, index\) => !user\.passwordHash && !userPasswords/);
  assert.match(app, /import \{ serverRestartSettingsChanged, settingsPayloadChanged \} from "\.\/settingsChange";/);
  assert.doesNotMatch(app, /function settingsPayloadChanged\(current:/);
  assert.doesNotMatch(app, /function serverSettingsChanged\(current:/);
  assert.doesNotMatch(app, /function serverRestartSettingsChanged\(current:/);
  assert.match(app, /return serverRestartSettingsChanged\(current, nextSettings\);/);
  assert.doesNotMatch(app, /return serverSettingsChanged\(current, nextSettings\);/);
  assert.doesNotMatch(app, /if \(hasPasswordUpdates\(nextSettings\.userPasswords\)\) return true;/);
  assert.doesNotMatch(app, /function hasPasswordUpdates\(value: unknown\)/);
  assert.match(app, /role: settings\.authEnabled && settings\.allowMetadataEditing \? "editor" : "viewer"/);
  assert.doesNotMatch(app, /allowMetadataEditing: nextAllowMetadataEditing/);
  assert.doesNotMatch(app, /nextSettings\.password/);
  assert.match(app, /Enter a username for every user\./);
  assert.match(app, /is already used\./);
  assert.match(app, /if \(!saved\) return;/);
  assert.doesNotMatch(app, /map\(normalizeAuthUser\)\.filter/);
  assert.match(app, /function setUserPasswordDraft\(index: number, value: string\)/);
  assert.match(app, /function replaceUserPasswordDrafts\(nextDrafts: Record<string, string>\)/);
  assert.match(app, /function clearUserPasswordDrafts\(\)/);
  assert.match(app, /userPasswords=\{userPasswordsRef\.current\}/);
  assert.match(uiSource, /userPasswords\[String\(index\)\]/);
  assert.match(app, /removeIndexedValue\(userPasswordsRef\.current, index\)/);
  assert.match(app, /setPasswordVisibleByIndex\(\(current\) => removeIndexedValue\(current, index\)\);/);
  assert.match(app, /passwordDrafts = userPasswordsRef\.current/);
  assert.match(uiSource, /defaultValue=\{userPasswords\[String\(index\)\] \|\| ""\}/);
  assert.match(uiSource, /onChange=\{\(event\) => onUserPasswordDraftChange\(index, event\.currentTarget\.value\)\}/);
  assert.match(uiSource, /key=\{`\$\{passwordDraftRevision\}-\$\{index\}`\}/);
  assert.match(app, /function togglePasswordVisible\(index: number\)/);
  assert.match(uiSource, /const canTogglePasswordVisible = !user\.passwordHash;/);
  assert.match(uiSource, /const passwordVisible = canTogglePasswordVisible && passwordVisibleByIndex\[String\(index\)\];/);
  assert.match(uiSource, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(uiSource, /aria-label=\{canTogglePasswordVisible \? \(passwordVisible \? `Hide password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}` : `Show password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\) : `Saved password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\} is hidden`\}/);
  assert.match(uiSource, /title=\{canTogglePasswordVisible \? \(passwordVisible \? "Hide password" : "Show password"\) : "Saved password is hidden"\}/);
  assert.match(uiSource, /disabled=\{settingsInputDisabled \|\| !canTogglePasswordVisible\}/);
  assert.match(uiSource, /onClick=\{canTogglePasswordVisible \? \(\) => onTogglePasswordVisible\(index\) : undefined\}/);
  assert.match(uiSource, /passwordVisible \? <EyeIcon className="h-\[13px\] w-\[13px\]" \/> : <EyeOffIcon className="h-\[13px\] w-\[13px\]" \/>/);
  assert.doesNotMatch(app, /const \[passwordVisible, setPasswordVisible\]/);
  assert.doesNotMatch(app, /Show passwords/);
  assert.doesNotMatch(app, /Hide passwords/);
  assert.doesNotMatch(app, /const \[userPasswords, setUserPasswords\]/);
  assert.doesNotMatch(app, /value=\{userPasswords/);
  assert.match(uiSource, /<button className=\{`ml-auto inline-flex h-8 items-center rounded-full px-4 text-\[12px\] font-semibold \$\{primaryButtonClassName\}`\} type="submit" disabled=\{settingsInputDisabled\}>/);
  assert.match(uiSource, />\s*Save settings\s*<\/button>/);
  assert.match(app, /saveSettings\(\{ forceSave: true, successMessage: "Saved" \}\)/);
  assert.doesNotMatch(uiSource, /onBlur=\{[^}]*saveSettings/);
  assert.doesNotMatch(app, /saveSettings\(\{ forceSave: true, patch: \{ port:/);
  // A row keeps its own help while the server runs; the lock is explained once, by the server status panel.
  assert.match(uiSource, /<SettingRow label="Port" help=\{`The port the server listens on\. Default: \$\{DEFAULT_PORT\}\.`\}>/);
  assert.doesNotMatch(uiSource, /Stop the server before changing/);
  assert.match(uiSource, /value=\{settings\.port \?\? DEFAULT_PORT\}/);
  assert.match(uiSource, /disabled=\{settingsInputDisabled\}/);
  assert.match(uiSource, /flex min-h-9 items-center justify-between gap-3 border-t border-\[#efeff1\] pt-3/);
  assert.match(uiSource, /<p className=\{`min-w-0 flex-1 truncate px-0\.5 text-\[10px\] \$\{messageIsError \? "text-\[#d92d20\]" : "text-\[#178c35\]"\}`\} aria-live="polite" hidden=\{!message\}>/);
  assert.match(uiSource, /messageIsError \? "text-\[#d92d20\]" : "text-\[#178c35\]"/);
  assert.doesNotMatch(app, /onBlur=\{\(\) => saveSettings\(\)\}\s*\/>\s*<button className=\{`grid h-7 w-7 place-items-center rounded-md \$\{authActionButtonClassName\}`\}/);
  assert.doesNotMatch(app, /passwordDrafts: nextUserPasswords/);
  assert.match(app, /const effectiveAuthUsers = Array\.isArray\(patch\.authUsers\)/);
  assert.doesNotMatch(app, /userPasswordsRef\.current\[String\(user\.username/);
  assert.doesNotMatch(app, /key=\{`\$\{user\.username\}-\$\{index\}`\}/);
  assert.doesNotMatch(app, /basicAuthUser: settings\.basicAuthUser/);
  assert.doesNotMatch(app, /selectedLanAddress/);
  assert.doesNotMatch(app, /preferredLanAddress/);
  assert.doesNotMatch(app, /lanAddresses/);
  assert.doesNotMatch(app, /interface LanAddress/);
});

test("plugin app keeps Eagle Node API compatibility with a classic script", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readPluginAppSource();

  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
  assert.match(app, /typeof window\.require !== "function"/);
  assert.match(app, /window\.require\(runtimePath\)/);
  assert.doesNotMatch(app, /window\.require\(qrcodePath\)/);
  assert.match(app, /import qrcodeFactory from "qrcode-generator"/);
});

test("settings can collapse and endpoint opens externally", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readPluginAppSource();
  const uiSource = await readPluginUiSource();

  assert.match(uiSource, /<form/);
  assert.match(app, /const \[settingsExpanded, setSettingsExpanded\] = useState\(true\);/);
  assert.match(uiSource, /id="settingsToggleButton"/);
  assert.match(uiSource, /aria-label=\{settingsExpanded \? "Hide settings" : "Show settings"\}/);
  assert.match(uiSource, /className=\{`\$\{settingsExpanded \? "mb-1" : ""\} flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left`\}/);
  assert.match(uiSource, /aria-controls="settingsPanel"/);
  assert.match(uiSource, /aria-expanded=\{settingsExpanded\}/);
  assert.match(uiSource, /hidden=\{!settingsExpanded\}/);
  assert.match(uiSource, /onSettingsExpandedChange\(\(current\) => !current\)/);
  assert.match(uiSource, /<ChevronIcon className=\{`h-\[14px\] w-\[14px\] text-\[#555c66\] transition-transform \$\{settingsExpanded \? "rotate-180" : ""\}`\} \/>/);
  assert.doesNotMatch(uiSource, /<span>\{settingsExpanded \? "Hide" : "Show"\}<\/span>/);
  assert.match(uiSource, /function ChevronIcon/);
  assert.match(app, /openEndpointUrl/);
  assert.match(app, /eagle\?\.shell\?\.openExternal/);
  assert.doesNotMatch(app, /setMessage\("Updated"\)/);
});

test("plugin password drafts do not blank the management UI", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const saveCalls: Record<string, unknown>[] = [];
  const status = {
    settings: {
      authEnabled: false,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "" }],
      autoStart: false,
      host: "127.0.0.1",
      port: 41532,
    },
    state: "stopped",
    url: "http://127.0.0.1:41532",
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            saveCalls.push(payload);
            return status;
          },
          async start() {
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const toggle = dom.window.document.querySelector("#settingsToggleButton");
    const passwordInput = dom.window.document.querySelector("input[autocomplete=\"new-password\"]");
    return toggle instanceof dom.window.HTMLButtonElement
      && !dom.window.document.querySelector("#settingsPanel")?.hasAttribute("hidden")
      && passwordInput instanceof dom.window.HTMLInputElement
      && !passwordInput.disabled;
  });

  const passwordInput = dom.window.document.querySelector("input[autocomplete=\"new-password\"]");
  assert.ok(passwordInput instanceof dom.window.HTMLInputElement);
  assert.equal(passwordInput.disabled, false);
  const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(passwordInput, "secret123");
  passwordInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

  assert.match(dom.window.document.body.textContent || "", /Media Preview Server/);
  assert.equal(dom.window.document.querySelector("#settingsPanel")?.hasAttribute("hidden"), false);

  const form = dom.window.document.querySelector("form");
  assert.ok(form instanceof dom.window.HTMLFormElement);
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => saveCalls.length > 0);
  await waitFor(() => /Saved/.test(dom.window.document.body.textContent || ""));

  assert.match(dom.window.document.body.textContent || "", /Media Preview Server/);
  assert.match(dom.window.document.body.textContent || "", /Saved/);
  assert.deepEqual(JSON.parse(JSON.stringify(saveCalls[0].userPasswords)), { eagle: "secret123" });
});

test("plugin port input persists after explicit settings save", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const saveCalls: Record<string, unknown>[] = [];
  let status = {
    settings: {
      authEnabled: false,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "hash" }],
      autoStart: false,
      host: "127.0.0.1",
      port: 41532,
    },
    state: "stopped",
    url: "http://127.0.0.1:41532",
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            saveCalls.push(payload);
            status = {
              ...status,
              settings: {
                ...status.settings,
                ...payload,
              },
            };
            return status;
          },
          async start() {
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const toggle = dom.window.document.querySelector("#settingsToggleButton");
    const portInput = dom.window.document.querySelector("input[type=\"number\"]");
    return toggle instanceof dom.window.HTMLButtonElement
      && !dom.window.document.querySelector("#settingsPanel")?.hasAttribute("hidden")
      && portInput instanceof dom.window.HTMLInputElement
      && !portInput.disabled;
  });

  const portInput = dom.window.document.querySelector("input[type=\"number\"]");
  assert.ok(portInput instanceof dom.window.HTMLInputElement);
  const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(portInput, "6123");
  portInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  portInput.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  assert.equal(saveCalls.length, 0);

  const form = dom.window.document.querySelector("form");
  assert.ok(form instanceof dom.window.HTMLFormElement);
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => saveCalls.length > 0);

  assert.equal(saveCalls[0].port, "6123");
  assert.match(dom.window.document.body.textContent || "", /Saved/);
});

test("plugin saves the experimental sort setting from Settings → Libraries → Advanced Sort, off by default", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const saveCalls: Record<string, unknown>[] = [];
  let status = {
    settings: {
      authEnabled: false,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "hash" }],
      autoStart: false,
      host: "127.0.0.1",
      port: 41532,
    },
    state: "stopped",
    url: "http://127.0.0.1:41532",
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            saveCalls.push(payload);
            status = {
              ...status,
              settings: {
                ...status.settings,
                ...payload,
              },
            };
            return status;
          },
          async start() {
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const toggle = dom.window.document.querySelector("#settingsToggleButton");
    const portInput = dom.window.document.querySelector("input[type=\"number\"]");
    return toggle instanceof dom.window.HTMLButtonElement
      && !dom.window.document.querySelector("#settingsPanel")?.hasAttribute("hidden")
      && portInput instanceof dom.window.HTMLInputElement
      && !portInput.disabled;
  });

  const checkbox = dom.window.document.querySelector("input[type=\"checkbox\"][aria-label=\"Advanced Sort: full scan (experimental)\"]");
  assert.ok(checkbox instanceof dom.window.HTMLInputElement);
  assert.equal(checkbox.checked, false);
  assert.equal(checkbox.disabled, false);
  assert.match(dom.window.document.body.textContent || "", /Experimental/);
  checkbox.click();
  assert.equal(saveCalls.length, 0);

  const form = dom.window.document.querySelector("form");
  assert.ok(form instanceof dom.window.HTMLFormElement);
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => saveCalls.length > 0);

  assert.equal(saveCalls[0].experimentalSort, true);
  await waitFor(() => (dom.window.document.querySelector("input[aria-label=\"Advanced Sort: full scan (experimental)\"]") as HTMLInputElement | null)?.checked === true);
});

test("plugin saves a custom domain and uses the resulting URL for display, QR, copy, and open", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife", platform: "browser", write: false,
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    runScripts: "outside-only", url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1]);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
    eagle: unknown;
  };
  const saves: Record<string, unknown>[] = [];
  const copied: string[] = [];
  const opened: string[] = [];
  const dialogs: Array<{ properties?: string[]; title?: string }> = [];
  let status = {
    settings: { customDomain: "", host: "127.0.0.1", port: 41532 },
    state: "stopped", url: "http://localhost:41532",
  };
  pluginWindow.eagle = {
    clipboard: { async writeText(url: string) { copied.push(url); } },
    shell: { async openExternal(url: string) { opened.push(url); } },
    dialog: {
      async showOpenDialog(options: { properties?: string[]; title?: string }) {
        dialogs.push(options);
        return { canceled: false, filePaths: [options.title?.includes("key") ? "/certs/key.pem" : "/certs/cert.pem"] };
      },
    },
  };
  pluginWindow.require = (id: string) => id === "path" ? path : {
    createServerManager: () => ({
      async init() { return status; },
      async saveSettings(payload: Record<string, unknown>) {
        saves.push(payload);
        status = {
          ...status,
          settings: { ...status.settings, ...payload },
          url: `http://${payload.customDomain || "localhost"}:41532`,
        };
        return status;
      },
      async start() { status = { ...status, state: "running" }; return status; },
      async stop() { status = { ...status, state: "stopped" }; return status; },
    }),
  };
  try {
    pluginWindow.eval(bundle.outputFiles[0].text);
    const doc = dom.window.document;
    await waitFor(() => doc.querySelector<HTMLInputElement>('[aria-label="Hostname"]')?.disabled === false);
    const domainInput = doc.querySelector('[aria-label="Hostname"]');
    assert.ok(domainInput instanceof dom.window.HTMLInputElement);
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(domainInput, "dummy.local");
    domainInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await waitFor(() => domainInput.getAttribute("value") === "dummy.local");
    assert.equal(saves.length, 0);
    doc.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => saves.length === 1 && doc.querySelector<HTMLInputElement>("#accessUrl")?.value === "http://dummy.local:41532");
    assert.equal(saves[0].customDomain, "dummy.local");

    const powerSwitch = doc.querySelector('label[aria-label="Start or stop server"] input');
    assert.ok(powerSwitch instanceof dom.window.HTMLInputElement);
    powerSwitch.click();
    await waitFor(() => Boolean(doc.querySelector('[aria-label="QR code"] img')));
    assert.equal(domainInput.disabled, true);
    const qr = doc.querySelector('[aria-label="QR code"] img');
    assert.ok(qr instanceof dom.window.HTMLImageElement);
    const svg = decodeURIComponent(qr.src.split(",")[1]);
    assert.match(svg, /http:\/\/dummy\.local:41532/);
    const copyButton = doc.querySelector('[aria-label="Copy endpoint URL"]');
    assert.ok(copyButton instanceof dom.window.HTMLButtonElement);
    copyButton.click();
    const endpoint = doc.querySelector("#accessUrl");
    assert.ok(endpoint instanceof dom.window.HTMLInputElement);
    endpoint.click();
    await waitFor(() => copied.length === 1 && opened.length === 1);
    assert.deepEqual(copied, ["http://dummy.local:41532"]);
    assert.deepEqual(opened, ["http://dummy.local:41532"]);

    powerSwitch.click();
    await waitFor(() => !domainInput.disabled);
    valueSetter?.call(domainInput, "");
    domainInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await waitFor(() => domainInput.getAttribute("value") === "");
    doc.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => endpoint.value === "http://localhost:41532");
    assert.equal(saves.at(-1)?.customDomain, "");

    doc.querySelector<HTMLButtonElement>('[aria-label="Choose certificate file"]')?.click();
    doc.querySelector<HTMLButtonElement>('[aria-label="Choose private key file"]')?.click();
    await waitFor(() =>
      doc.querySelector<HTMLInputElement>('[aria-label="TLS certificate path"]')?.value === "/certs/cert.pem"
      && doc.querySelector<HTMLInputElement>('[aria-label="TLS key path"]')?.value === "/certs/key.pem");
    assert.equal(dialogs.length, 2);
    assert.ok(dialogs.every((options) => options.properties?.includes("openFile")));
  } finally {
    dom.window.close();
  }
});

test("plugin asks before starting public network without password protection", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const confirmMessages: string[] = [];
  const saveCalls: Record<string, unknown>[] = [];
  let startCalls = 0;
  let confirmResult = false;
  let status = {
    settings: {
      authEnabled: false,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "hash" }],
      autoStart: false,
      host: "0.0.0.0",
      port: 41532,
    },
    state: "stopped",
    url: "http://192.168.1.20:41532",
  };
  pluginWindow.confirm = (message?: string) => {
    confirmMessages.push(String(message || ""));
    return confirmResult;
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            saveCalls.push(payload);
            return status;
          },
          async start() {
            startCalls += 1;
            status = { ...status, state: "running" };
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            status = { ...status, state: "stopped" };
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const powerSwitch = dom.window.document.querySelector("label[aria-label=\"Start or stop server\"] input[type=\"checkbox\"]");
    return powerSwitch instanceof dom.window.HTMLInputElement && !powerSwitch.disabled;
  });

  const powerSwitch = dom.window.document.querySelector("label[aria-label=\"Start or stop server\"] input[type=\"checkbox\"]");
  assert.ok(powerSwitch instanceof dom.window.HTMLInputElement);
  powerSwitch.click();
  await waitFor(() => confirmMessages.length === 1);

  assert.match(confirmMessages[0], /Public Network is enabled/);
  assert.equal(saveCalls.length, 0);
  assert.equal(startCalls, 0);

  confirmResult = true;
  powerSwitch.click();
  await waitFor(() => startCalls === 1);

  assert.equal(confirmMessages.length, 2);
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].host, "0.0.0.0");
});

test("plugin asks before starting public network with HTTP password protection", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const confirmMessages: string[] = [];
  let startCalls = 0;
  let confirmResult = false;
  let status = {
    settings: {
      authEnabled: true,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "hash" }],
      autoStart: false,
      host: "0.0.0.0",
      httpsEnabled: false,
      port: 41532,
    },
    state: "stopped",
    url: "http://192.168.1.20:41532",
  };
  pluginWindow.confirm = (message?: string) => {
    confirmMessages.push(String(message || ""));
    return confirmResult;
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            status = {
              ...status,
              settings: {
                ...status.settings,
                ...payload,
              },
            };
            return status;
          },
          async start() {
            startCalls += 1;
            status = { ...status, state: "running" };
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            status = { ...status, state: "stopped" };
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const powerSwitch = dom.window.document.querySelector("label[aria-label=\"Start or stop server\"] input[type=\"checkbox\"]");
    return powerSwitch instanceof dom.window.HTMLInputElement && !powerSwitch.disabled;
  });

  const powerSwitch = dom.window.document.querySelector("label[aria-label=\"Start or stop server\"] input[type=\"checkbox\"]");
  assert.ok(powerSwitch instanceof dom.window.HTMLInputElement);
  powerSwitch.click();
  await waitFor(() => confirmMessages.length === 1);

  assert.match(confirmMessages[0], /HTTPS is disabled/);
  assert.equal(startCalls, 0);

  confirmResult = true;
  powerSwitch.click();
  await waitFor(() => startCalls === 1);

  assert.equal(confirmMessages.length, 2);
});

test("plugin saves public network without asking while stopped", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const confirmMessages: string[] = [];
  const saveCalls: Record<string, unknown>[] = [];
  let status = {
    settings: {
      authEnabled: false,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "hash" }],
      autoStart: false,
      host: "127.0.0.1",
      port: 41532,
    },
    state: "stopped",
    url: "http://localhost:41532",
  };
  pluginWindow.confirm = (message?: string) => {
    confirmMessages.push(String(message || ""));
    return false;
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            saveCalls.push(payload);
            status = {
              ...status,
              settings: {
                ...status.settings,
                ...payload,
              },
            };
            return status;
          },
          async start() {
            status = { ...status, state: "running" };
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            status = { ...status, state: "stopped" };
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const publicNetwork = dom.window.document.querySelector("input[aria-label=\"Public Network\"]");
    return publicNetwork instanceof dom.window.HTMLInputElement && !publicNetwork.disabled;
  });

  const publicNetwork = dom.window.document.querySelector("input[aria-label=\"Public Network\"]");
  assert.ok(publicNetwork instanceof dom.window.HTMLInputElement);
  publicNetwork.click();
  await waitFor(() => saveCalls.length === 1);

  assert.equal(confirmMessages.length, 0);
  assert.equal(saveCalls[0].host, "0.0.0.0");
  assert.equal(publicNetwork.checked, true);
});

test("plugin saves public network with HTTP password protection without asking while stopped", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const confirmMessages: string[] = [];
  const saveCalls: Record<string, unknown>[] = [];
  let status = {
    settings: {
      authEnabled: true,
      authUsers: [{ username: "eagle", role: "viewer", passwordHash: "hash" }],
      autoStart: false,
      host: "127.0.0.1",
      httpsEnabled: false,
      port: 41532,
    },
    state: "stopped",
    url: "http://localhost:41532",
  };
  pluginWindow.confirm = (message?: string) => {
    confirmMessages.push(String(message || ""));
    return false;
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings(payload: Record<string, unknown>) {
            saveCalls.push(payload);
            status = {
              ...status,
              settings: {
                ...status.settings,
                ...payload,
              },
            };
            return status;
          },
          async start() {
            status = { ...status, state: "running" };
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            status = { ...status, state: "stopped" };
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const publicNetwork = dom.window.document.querySelector("input[aria-label=\"Public Network\"]");
    return publicNetwork instanceof dom.window.HTMLInputElement && !publicNetwork.disabled;
  });

  const publicNetwork = dom.window.document.querySelector("input[aria-label=\"Public Network\"]");
  assert.ok(publicNetwork instanceof dom.window.HTMLInputElement);
  publicNetwork.click();
  await waitFor(() => saveCalls.length === 1);

  assert.equal(confirmMessages.length, 0);
  assert.equal(saveCalls[0].host, "0.0.0.0");
  assert.equal(publicNetwork.checked, true);
});

test("plugin confirms with an Eagle message box before removing a user", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    eagle: unknown;
    require: (id: string) => unknown;
  };
  const messageBoxes: Array<{ buttons?: string[]; message: string; type?: string }> = [];
  const responses = [0, 1];
  pluginWindow.eagle = {
    dialog: {
      async showMessageBox(options: { buttons?: string[]; message: string; type?: string }) {
        messageBoxes.push(options);
        return { response: responses.shift() ?? 0 };
      },
    },
  };
  const status = {
    settings: {
      authEnabled: false,
      authUsers: [
        { username: "eagle", role: "viewer", passwordHash: "hash" },
        { username: "admin", role: "admin", passwordHash: "hash" },
      ],
      host: "127.0.0.1",
      port: 41532,
    },
    state: "stopped",
    url: "",
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async status() {
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(bundle.outputFiles[0].text);
  const doc = dom.window.document;
  const usernames = () => Array.from(doc.querySelectorAll<HTMLInputElement>('[aria-label="Users"] input[autocomplete="username"]')).map((input) => input.value);
  const removeEagle = () => doc.querySelector<HTMLButtonElement>('button[aria-label="Remove eagle"]');
  // Wait for init: the default settings render enabled for a moment before the loaded users arrive.
  await waitFor(() => usernames().join(",") === "eagle,admin" && removeEagle()?.disabled === false, { timeoutMs: 5000 });

  // StrictMode runs init twice, so a click can land on a briefly disabled button; click until the dialog opens.
  const openRemoveDialog = (count: number) => waitFor(() => {
    if (messageBoxes.length >= count) return true;
    removeEagle()?.click();
    return false;
  }, { timeoutMs: 5000 });

  // Every row exposes the same five columns, so each control is announced with its column header.
  const rows = Array.from(doc.querySelectorAll('[aria-label="Users"] > [role="row"]'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => Array.from(row.children).map((child) => child.getAttribute("role")).join(",")), [
    "columnheader,columnheader,columnheader,columnheader,columnheader",
    "cell,cell,cell,cell,cell",
    "cell,cell,cell,cell,cell",
  ]);

  await openRemoveDialog(1);
  assert.equal(messageBoxes[0].message, "Remove eagle?");
  assert.equal(messageBoxes[0].type, "warning");
  assert.equal(JSON.stringify(messageBoxes[0].buttons), JSON.stringify(["Cancel", "Remove"]));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(usernames(), ["eagle", "admin"], "Cancel keeps the user");

  await openRemoveDialog(2);
  await waitFor(() => usernames().join(",") === "admin");
  assert.equal(doc.querySelector<HTMLButtonElement>('button[aria-label="Remove admin"]')?.disabled, true, "the last user cannot be removed");
});

test("the Role menu offers Editor + Upload, and choosing another role clears the upload permission", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    eagle: unknown;
    require: (id: string) => unknown;
  };
  pluginWindow.eagle = {};
  const status = {
    settings: {
      authEnabled: true,
      authUsers: [
        { username: "ed", role: "editor", passwordHash: "hash" },
        { username: "uploader", role: "editor", passwordHash: "hash", canUpload: true },
        { username: "boss", role: "admin", passwordHash: "hash" },
        { username: "reader", role: "viewer", passwordHash: "hash" },
      ],
      host: "127.0.0.1",
      port: 41532,
    },
    state: "stopped",
    url: "",
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async status() {
            return status;
          },
        };
      },
    };
  };

  pluginWindow.eval(bundle.outputFiles[0].text);
  const doc = dom.window.document;
  const role = (username: string) => doc.querySelector<HTMLSelectElement>(`select[aria-label="Role for ${username}"]`);
  const changeRole = (value: string) => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(role("ed"), value);
    role("ed")!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  };
  await waitFor(() => role("ed") !== null, { timeoutMs: 5000 });

  assert.deepEqual(Array.from(role("ed")!.options).map((option) => option.text), ["Viewer", "Editor", "Editor + Upload", "Admin"]);
  assert.equal(role("ed")?.value, "editor");
  assert.equal(role("uploader")?.value, "editor-upload");
  assert.equal(role("boss")?.value, "admin");
  assert.equal(role("reader")?.value, "viewer");

  changeRole("editor-upload");
  await waitFor(() => role("ed")?.value === "editor-upload");
  changeRole("viewer");
  await waitFor(() => role("ed")?.value === "viewer");
  changeRole("editor");
  await waitFor(() => role("ed")?.value === "editor");
});

test("plugin settings inputs are disabled while the server is running", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify("test"),
    },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const appScript = bundle.outputFiles[0].text;
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  const status = {
    settings: {
      authEnabled: false,
      authUsers: [
        { username: "eagle", role: "viewer", passwordHash: "" },
        { username: "admin", role: "admin", passwordHash: "hash" },
      ],
      autoStart: false,
      host: "127.0.0.1",
      httpsCertPath: "/tmp/cert.pem",
      httpsEnabled: false,
      httpsKeyPath: "/tmp/key.pem",
      port: 41532,
    },
    state: "running",
    url: "http://127.0.0.1:41532",
  };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() {
            return status;
          },
          async saveSettings() {
            return status;
          },
          async start() {
            return status;
          },
          async status() {
            return status;
          },
          async stop() {
            return { ...status, state: "stopped" };
          },
        };
      },
    };
  };

  pluginWindow.eval(appScript);
  await waitFor(() => {
    const toggle = dom.window.document.querySelector("#settingsToggleButton");
    const powerSwitch = dom.window.document.querySelector("label[aria-label=\"Start or stop server\"] input[type=\"checkbox\"]");
    return toggle instanceof dom.window.HTMLButtonElement
      && !dom.window.document.querySelector("#settingsPanel")?.hasAttribute("hidden")
      && powerSwitch instanceof dom.window.HTMLInputElement
      && !powerSwitch.disabled;
  });

  const portInput = dom.window.document.querySelector("input[type=\"number\"]");
  assert.ok(portInput instanceof dom.window.HTMLInputElement);
  assert.equal(portInput.disabled, true);
  const usernameInput = dom.window.document.querySelector("input[autocomplete=\"username\"]");
  assert.ok(usernameInput instanceof dom.window.HTMLInputElement);
  assert.equal(usernameInput.disabled, true);
  const roleSelect = dom.window.document.querySelector("select");
  assert.ok(roleSelect instanceof dom.window.HTMLSelectElement);
  assert.equal(roleSelect.disabled, true);
  const passwordInput = dom.window.document.querySelector("input[autocomplete=\"new-password\"]");
  assert.ok(passwordInput instanceof dom.window.HTMLInputElement);
  assert.equal(passwordInput.disabled, true);
  const tlsCertInput = dom.window.document.querySelector("input[placeholder=\"/path/to/cert.pem\"]");
  assert.ok(tlsCertInput instanceof dom.window.HTMLInputElement);
  assert.equal(tlsCertInput.disabled, true);
  const tlsKeyInput = dom.window.document.querySelector("input[placeholder=\"/path/to/key.pem\"]");
  assert.ok(tlsKeyInput instanceof dom.window.HTMLInputElement);
  assert.equal(tlsKeyInput.disabled, true);
  const addUserButton = Array.from(dom.window.document.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "Add user");
  assert.ok(addUserButton instanceof dom.window.HTMLButtonElement);
  assert.equal(addUserButton.disabled, true);
  const saveButton = Array.from(dom.window.document.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Save settings");
  assert.ok(saveButton instanceof dom.window.HTMLButtonElement);
  assert.equal(saveButton.disabled, true);
  const removeButton = dom.window.document.querySelector("button[title=\"Remove user\"]");
  assert.ok(removeButton instanceof dom.window.HTMLButtonElement);
  assert.equal(removeButton.disabled, true);
  const powerSwitch = dom.window.document.querySelector("label[aria-label=\"Start or stop server\"] input[type=\"checkbox\"]");
  assert.ok(powerSwitch instanceof dom.window.HTMLInputElement);
  assert.equal(powerSwitch.disabled, false);
  for (const label of ["Auto start", "Password protection", "Public Network", "HTTPS"]) {
    const checkbox = dom.window.document.querySelector(`input[type="checkbox"][aria-label="${label}"]`);
    assert.ok(checkbox instanceof dom.window.HTMLInputElement);
    assert.equal(checkbox.disabled, false);
  }
  const sortCheckbox = dom.window.document.querySelector("input[type=\"checkbox\"][aria-label=\"Advanced Sort: full scan (experimental)\"]");
  assert.ok(sortCheckbox instanceof dom.window.HTMLInputElement);
  assert.equal(sortCheckbox.disabled, true);
  // Each row keeps its own help; the lock is explained once, above the settings.
  assert.match(dom.window.document.body.textContent || "", /Settings are locked while the server is running\. Stop the server to edit them\./);
  assert.match(dom.window.document.body.textContent || "", /The port the server listens on\./);
  assert.match(dom.window.document.body.textContent || "", /Adds a Sort menu to the viewer\./);
  assert.doesNotMatch(dom.window.document.body.textContent || "", /Stop the server before changing/);
});

test("plugin copy URL uses Eagle clipboard API directly", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /async function copyAccessUrl\(\)/);
  assert.match(app, /eagle\?\.clipboard\?\.writeText/);
  assert.match(app, /if \(!globalThis\.eagle\?\.clipboard\?\.writeText\)/);
  assert.match(app, /await globalThis\.eagle\.clipboard\.writeText\(status\.url\);/);
  assert.match(app, /Clipboard API is unavailable in this Eagle window/);
  assert.doesNotMatch(app, /eagle\.clipboard\.readText/);
  assert.doesNotMatch(app, /navigator\.clipboard\?\.writeText/);
  assert.doesNotMatch(app, /document\.execCommand\("copy"\)/);
  assert.doesNotMatch(app, /function copyTextFallback\(value\)/);
});

test("plugin window does not expose an unused shared URL expiration setting", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readPluginAppSource();
  const runtime = await readFile(new URL("runtime.cjs", generatedServiceUrl), "utf8");
  const runtimeSource = await readFile(new URL("./service/runtime.cts", import.meta.url), "utf8");

  assert.doesNotMatch(html, /共有URL/);
  assert.doesNotMatch(html, /有効期限/);
  assert.doesNotMatch(html, /expire|expires|expiry|expiration|ttl/i);
  assert.doesNotMatch(app, /expire|expires|expiry|expiration|ttl/i);
  assert.doesNotMatch(runtime, /shared.*url|url.*ttl|share.*expiration/i);
  assert.doesNotMatch(runtimeSource, /shared.*url|url.*ttl|share.*expiration/i);
});

test("plugin window no longer renders diagnostics UI", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readPluginAppSource();

  assert.doesNotMatch(html, /diagnostics-panel/);
  assert.doesNotMatch(html, /id="diagnosticsLog"/);
  assert.doesNotMatch(app, /appendDiagnostic/);
});

test("plugin CommonJS runtime avoids node protocol requires for older Eagle runtimes", async () => {
  const files = [
    "auth.cjs",
    "runtime.cjs",
    "viewerServer.cjs",
    "eagleClient.cjs",
    "connection.cjs",
    "media.cjs",
    "static.cjs",
    "customDomain.cjs",
    "libraryAccess.cjs",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, generatedServiceUrl), "utf8");
    assert.doesNotMatch(source, /require\("node:/, file);
  }
});

test("plugin settings runtime no longer accepts the removed single-password save input", async () => {
  const runtimeSource = await readFile(new URL("./service/runtime.cts", import.meta.url), "utf8");

  assert.doesNotMatch(runtimeSource, /confirmPassword/);
  assert.doesNotMatch(runtimeSource, /input\.password\b/);
  assert.doesNotMatch(runtimeSource, /function upsertAuthUser/);
  assert.match(runtimeSource, /function authUsersCanEditMetadata\(users: AuthUser\[\]\)/);
  assert.match(runtimeSource, /function authUsersMissingPassword\(users: AuthUser\[\]\)/);
  assert.match(runtimeSource, /if \(next\.authEnabled && authUsersMissingPassword\(next\.authUsers\)\)/);
  assert.match(runtimeSource, /next\.allowMetadataEditing = next\.authEnabled && authUsersCanEditMetadata\(next\.authUsers\);/);
  assert.doesNotMatch(runtimeSource, /next\.authUsers\.some\(\(user\) => !user\.passwordHash\)/);
  assert.doesNotMatch(runtimeSource, /next\.authUsers\.some\(\(user\) => canRoleEditMetadata\(user\.role\)\)/);
  assert.doesNotMatch(runtimeSource, /next\.authEnabled && !next\.authUsers\.length && next\.passwordHash/);
  assert.doesNotMatch(runtimeSource, /prev\.allowMetadataEditing !== next\.allowMetadataEditing/);
  assert.doesNotMatch(runtimeSource, /prev\.basicAuthUser !== next\.basicAuthUser/);
  assert.doesNotMatch(runtimeSource, /prev\.passwordHash !== next\.passwordHash/);
  assert.doesNotMatch(runtimeSource, /basicAuthUsername: settings\.basicAuthUser/);
  assert.doesNotMatch(runtimeSource, /allowMetadataEditing: settings\.allowMetadataEditing/);
  assert.doesNotMatch(runtimeSource, /passwordHash: settings\.authEnabled \? settings\.passwordHash : ""/);
  assert.match(runtimeSource, /authUsers: settings\.authEnabled \? settings\.authUsers : \[\]/);
});

test("plugin server caches authenticated users per request", async () => {
  const authSource = await readFile(new URL("auth.cjs", generatedServiceUrl), "utf8");
  const serverSource = await readFile(new URL("viewerServer.cjs", generatedServiceUrl), "utf8");

  assert.match(serverSource, /require\("\.\/auth\.cjs"\)/);
  assert.match(authSource, /AUTH_USER_CACHE = Symbol\("authUser"\)/);
  assert.match(authSource, /hasOwnProperty\.call\(req, AUTH_USER_CACHE\)/);
  assert.match(authSource, /req\[AUTH_USER_CACHE\] = user/);
  assert.match(authSource, /function resolveAuthenticatedUser\(req, auth\)/);
  assert.match(authSource, /function rolePermissions\(role\)/);
  assert.match(authSource, /return !auth\.readOnly && rolePermissions\(user\?\.role\)\.writeMetadata;/);
  assert.match(authSource, /return !auth\.readOnly && rolePermissions\(user\?\.role\)\.writeRating;/);
  assert.match(authSource, /return !auth\.readOnly && rolePermissions\(user\?\.role\)\.manageLibrary;/);
  assert.match(authSource, /const roleAccess = rolePermissions\(user\?\.role\);/);
  assert.doesNotMatch(authSource, /\^Basic\\s\+\/i/);
  assert.doesNotMatch(serverSource, /WWW-Authenticate/);
  assert.match(authSource, /function authSessionCookie\(token, maxAge = AUTH_SESSION_MAX_AGE_SECONDS, secure = false\)/);
  assert.match(authSource, /function loginAuthSessionCookies\(token, secure = false, maxAge = AUTH_SESSION_MAX_AGE_SECONDS\)/);
  assert.match(serverSource, /"Set-Cookie": loginAuthSessionCookies\(token, auth\.secureCookies, auth\.sessionMaxAgeSeconds\)/);
  assert.match(serverSource, /"Set-Cookie": expiredAuthSessionCookies\(auth\.secureCookies\)/);
  assert.match(authSource, /function authSessionCookieName\(secure = false\)/);
  assert.match(authSource, /secure \? "viewer_session" : "viewer_session_http"/);
  assert.match(authSource, /secure \? "; Secure" : ""/);
  assert.match(authSource, /createHmac/);
  assert.match(authSource, /function signedAuthSessionToken\(session/);
  assert.match(authSource, /function verifyAuthSessionToken\(token/);
  assert.match(authSource, /function authSessionSignature\(payload/);
  assert.match(authSource, /function userAuthVersion\(user/);
  assert.match(authSource, /canonicalAuthUser\(user\)/);
  assert.doesNotMatch(authSource, /canonicalAuthUsers/);
  assert.doesNotMatch(authSource, /randomUUID/);
  assert.match(authSource, /function authStatusResponse\(auth, user, \{ authenticated = Boolean\(user\) \} = \{\}\)/);
  assert.match(authSource, /required: authRequired\(auth\)/);
  assert.match(authSource, /sessionMaxAgeSeconds: auth\.sessionMaxAgeSeconds/);
  assert.match(authSource, /user: user \? \{ role: user\.role, username: user\.username \} : null/);
  assert.match(authSource, /permissions: permissionsForUser\(user, \{ authenticated, readOnly: auth\.readOnly \}\)/);
  assert.match(serverSource, /authStatusResponse\(auth, null, \{ authenticated: true \}\)/);
  assert.match(serverSource, /authStatusResponse\(auth, user, \{ authenticated: true \}\)/);
  assert.match(serverSource, /authStatusResponse\(auth, null, \{ authenticated: !authRequired\(auth\) \}\)/);
  assert.match(serverSource, /const INVALID_LOGIN_MESSAGE = "Invalid username or password";/);
  assert.match(serverSource, /const LOGIN_RATE_LIMIT_MESSAGE = "Too many failed login attempts\. Try again later\.";/);
  assert.match(serverSource, /const LOGIN_FAILURE_MAX_ENTRIES = 500;/);
  assert.match(serverSource, /const RATING_WRITE_FORBIDDEN_MESSAGE = "Rating editing is not allowed for this viewer";/);
  assert.match(serverSource, /const METADATA_WRITE_FORBIDDEN_MESSAGE = "Metadata editing is not allowed for this viewer";/);
  assert.match(serverSource, /\{ error: INVALID_LOGIN_MESSAGE \}/);
  assert.match(serverSource, /sendLoginRateLimited\(res, activeLockSeconds\)/);
  assert.match(serverSource, /sendLoginRateLimited\(res, retryAfterSeconds\)/);
  assert.match(serverSource, /function pruneLoginFailures\(loginFailures, now = Date\.now\(\)\)/);
  assert.match(serverSource, /"Retry-After": String\(Math\.max\(1, retryAfterSeconds\)\)/);
  assert.match(serverSource, /\{ error: RATING_WRITE_FORBIDDEN_MESSAGE \}/);
  assert.match(serverSource, /\{ error: METADATA_WRITE_FORBIDDEN_MESSAGE \}/);
  assert.doesNotMatch(serverSource, /Invalid password/);
  assert.match(serverSource, /const auth = \{ authSessions, clientAddress: requestAddress, loginFailures, recordAuth, revokedAuthSessions, secureCookies: httpsEnabled, sessionMaxAgeSeconds, sessionSecret: resolvedSessionSecret, users: resolvedAuthUsers, readOnly: !currentSession\.write \};/);
  assert.match(serverSource, /const loginFailures = new Map\(\);/);
  assert.match(serverSource, /revokedAuthSessions\.add\(token\)/);
  assert.match(authSource, /auth\.revokedAuthSessions\.has\(token\)/);
  assert.match(authSource, /function authRequired\(\{ users = \[\] \}/);
  assert.doesNotMatch(authSource, /username === auth\.basicAuthUsername/);
  assert.doesNotMatch(authSource, /if \(!passwordHash\) return safeEqual/);
  assert.match(authSource, /function safeDecodeCookieValue\(value\)/);
  assert.match(authSource, /return decodeURIComponent\(value\);/);
  assert.match(serverSource, /if \(req\.method !== "GET"\) \{/);
  assert.match(serverSource, /function sendMethodNotAllowed\(res, methods\)/);
  assert.match(serverSource, /"Allow": methods\.join\(", "\)/);
  assert.match(serverSource, /sendMethodNotAllowed\(res, \["GET"\]\)/);
  assert.match(serverSource, /if \(url\.pathname === "\/api\/items"\) \{\s*if \(req\.method !== "GET"\)/);
  assert.match(serverSource, /if \(url\.pathname === "\/api\/tags"\) \{\s*if \(req\.method !== "GET"\)/);
  assert.match(serverSource, /const metadataPatch = normalizeMetadataPatch\(body\);/);
  assert.match(serverSource, /normalizeStringArray\(body\.tags, "tags"\)/);
  assert.doesNotMatch(authSource, /function normalizeMetadataValues/);
  assert.doesNotMatch(authSource, /function canRoleEditMetadata/);
  assert.doesNotMatch(authSource, /const writeMetadata = Boolean\(user && canRoleEditMetadata\(user\.role\)\)/);
  assert.doesNotMatch(authSource, /writeRating: roleAccess\.writeMetadata/);
  assert.doesNotMatch(authSource, /const manageLibrary = user\?\.role === "admin"/);
});

test("plugin server serves text and markdown media as inline raw text", async () => {
  const mediaSource = await readFile(new URL("media.cjs", generatedServiceUrl), "utf8");
  const staticSource = await readFile(new URL("static.cjs", generatedServiceUrl), "utf8");

  assert.match(staticSource, /"\.txt": "text\/plain; charset=utf-8"/);
  assert.match(staticSource, /"\.md": "text\/plain; charset=utf-8"/);
  assert.match(staticSource, /"\.webmanifest": "application\/manifest\+json; charset=utf-8"/);
  assert.match(staticSource, /"frame-ancestors 'self'"/);
  assert.doesNotMatch(staticSource, /"frame-ancestors 'none'"/);
  assert.match(staticSource, /"X-Frame-Options": "SAMEORIGIN"/);
  assert.match(mediaSource, /\.\.\.mediaSecurityHeaders\(detectedContentType\)/);
  assert.match(mediaSource, /"Content-Security-Policy": "sandbox"/);
  assert.match(mediaSource, /"Content-Disposition": contentDisposition\(contentType, itemData, filePath\)/);
  assert.match(mediaSource, /if \(contentType !== "application\/pdf"\)\s*return "inline";/);
});

test("plugin server handles media read stream errors", async () => {
  const mediaSource = await readFile(new URL("media.cjs", generatedServiceUrl), "utf8");

  assert.match(mediaSource, /function pipeMediaStream\(/);
  assert.match(mediaSource, /stream\.once\("open"/);
  assert.match(mediaSource, /stream\.once\("error"/);
  assert.match(mediaSource, /sendJson\(res, 500, \{ error: "Unable to read media file" \}\)/);
  assert.match(mediaSource, /res\.destroy\(error\)/);
});

test("plugin app resolves CommonJS runtime from the plugin file location", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /document\.currentScript\?\.getAttribute\("src"\)/);
  assert.match(app, /pluginRequirePath\("service\/runtime\.cjs"\)/);
  assert.doesNotMatch(app, /pluginRequirePath\("vendor\/qrcode-generator\.cjs"\)/);
});

test("plugin app labels the status badge with the in-flight server action", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /const busyActionLabels = Object\.freeze\(\{ restarting: "Restarting", starting: "Starting", stopping: "Stopping" \}\);/);
  assert.match(app, /busy && busyAction \? busyActionLabels\[busyAction\]/);
  assert.match(app, /managerRef\.current\?\.start\(\), \{ action: "starting" \}/);
  assert.match(app, /managerRef\.current\?\.stop\(\), \{ action: "stopping" \}/);
  assert.match(app, /action: restarting \? "restarting" : null/);
  assert.doesNotMatch(app, /busyStoppedFrames/);
});

test("plugin app restores status when a restart settings save fails", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /const previousStatus = status;/);
  assert.match(app, /if \(!saved\) setStatus\(previousStatus\);/);
});

test("plugin app resolves Windows drive paths without a leading slash", async () => {
  const pluginRequirePath = createPluginRequirePath("/E:/github.com/xxx/eagle-media-preview-server/plugin/index.html");

  assert.equal(
    pluginRequirePath("service/runtime.cjs"),
    "E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\service\\runtime.cjs",
  );
});

test("plugin app resolves Windows drive paths when Eagle exposes backslashes", async () => {
  const pluginRequirePath = createPluginRequirePath("\\E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\index.html");

  assert.equal(
    pluginRequirePath("service/runtime.cjs"),
    "E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\service\\runtime.cjs",
  );
});

test("plugin app resolves Windows drive paths with repeated leading separators", async () => {
  for (const pathname of [
    "//E:/github.com/xxx/eagle-media-preview-server/plugin/index.html",
    "\\\\E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\index.html",
  ]) {
    const pluginRequirePath = createPluginRequirePath(pathname);

    assert.equal(
      pluginRequirePath("service/runtime.cjs"),
      "E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\service\\runtime.cjs",
    );
  }
});

test("manifest uses a frameless window for custom chrome", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.main.frame, false);
});

test("plugin QR rendering uses the bundled QR library instead of custom matrix code", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /qrcode-generator/);
  assert.match(app, /createQrDataUrl/);
  assert.doesNotMatch(app, /function createQrMatrix/);
  assert.doesNotMatch(app, /function reedSolomon/);
});

test("plugin component styles are embedded as Tailwind classes", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  const uiSource = await readPluginUiSource();

  assert.doesNotMatch(css, /\.titlebar\s*\{/);
  assert.doesNotMatch(css, /\.brand-icon\s*\{/);
  assert.doesNotMatch(css, /\.power-switch\s*\{/);
  assert.match(uiSource, /h-\[46px\]/);
  assert.match(uiSource, /h-6 w-6 rounded-md object-cover/);
  assert.match(uiSource, /cursor-pointer/);
  assert.match(uiSource, /grid h-\[124px\] w-\[124px\]/);
  assert.match(css, /button:disabled,\s*input:disabled,\s*select:disabled\s*\{[^}]*cursor: not-allowed;/s);
});

test("plugin panel keeps absolutely positioned content inside its scroller", async () => {
  // Without `relative`, sr-only text escapes <main> and makes the page itself scrollable, which slides
  // the whole panel out of the window. Layout can't be measured here, so this guards the class.
  const app = await readPluginAppSource();
  assert.match(app, /<main className="relative [^"]*overflow-auto/);
});

test("plugin app no longer wires the UI with id-based DOM queries", async () => {
  const app = await readPluginAppSource();

  assert.doesNotMatch(app, /document\.querySelector\("#statusBadge"\)/);
  assert.doesNotMatch(app, /addEventListener\("change"/);
  assert.doesNotMatch(app, /replaceChildren\(/);
  assert.doesNotMatch(app, /classList\./);
  assert.doesNotMatch(app, /\.innerHTML/);
  assert.doesNotMatch(app, /\.textContent/);
});

function createPluginRequirePath(pathname: string): PluginRequirePath {
  return (relativePath: string) => {
    let pluginDir = decodeURIComponent(pathname);
    if (!/[\\/]$/.test(pluginDir)) pluginDir = path.win32.dirname(pluginDir);
    pluginDir = pluginDir.replace(/^[\\/]+([A-Za-z]:[\\/])/, "$1");
    return path.win32.join(pluginDir, relativePath);
  };
}

test("library user count stays short at nine users or more", async () => {
  const { libraryUserCountLabel } = await import("./components/SettingsForm");
  assert.deepEqual([0, 1, 8, 9, 10, 120].map(libraryUserCountLabel), ["0", "1", "8", "9+", "9+", "9+"]);
});

test("plugin limits a shared library to selected users and follows user renames", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife", platform: "browser", write: false,
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    runScripts: "outside-only", url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1]);
  const pluginWindow = dom.window as unknown as Window & { eval: (source: string) => unknown; require: (id: string) => unknown; eagle: unknown };
  const saves: Record<string, unknown>[] = [];
  let status: { settings: Record<string, unknown>; state: string; url: string } = {
    settings: {
      host: "127.0.0.1", port: 41532, authEnabled: true, libraryProtectionEnabled: true,
      authUsers: [
        { username: "alice", role: "viewer", passwordHash: "x" },
        { username: "bob", role: "viewer", passwordHash: "x" },
        { username: "owner", role: "admin", passwordHash: "x" },
      ],
      sharedLibraries: [{ name: "Work", path: "/Users/me/Work.library" }],
    },
    state: "stopped", url: "http://localhost:41532",
  };
  pluginWindow.eagle = { library: { name: "Work", path: "/Users/me/Work.library" } };
  pluginWindow.require = (id: string) => id === "path" ? path : {
    createServerManager: () => ({
      async init() { return status; },
      async status() { return status; },
      async saveSettings(payload: Record<string, unknown>) {
        saves.push(payload);
        status = { ...status, settings: { ...status.settings, ...payload } };
        return status;
      },
      async start() { return status; },
      async stop() { return status; },
      async libraries() {
        return { current: { name: "Work", path: "/Users/me/Work.library" }, items: [{ name: "Work", path: "/Users/me/Work.library", current: true, shared: true }] };
      },
    }),
  };
  try {
    pluginWindow.eval(bundle.outputFiles[0].text);
    const doc = dom.window.document;
    const input = (label: string) => doc.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
    // The row shows a compact button; the choices open in a popover.
    const trigger = () => doc.querySelector<HTMLButtonElement>('button[aria-label^="Who can open Work:"]');
    await waitFor(() => trigger()?.getAttribute("aria-label") === "Who can open Work: all users");
    assert.equal(trigger()?.textContent, "All");
    assert.equal(input("Only selected users can open Work"), null);
    trigger()?.click();
    await waitFor(() => input("Only selected users can open Work")?.disabled === false);
    input("Only selected users can open Work")?.click();
    await waitFor(() => Boolean(input("Let alice open Work")));
    // Admins are always allowed and cannot be unticked.
    assert.equal(input("Let owner open Work")?.checked, true);
    assert.equal(input("Let owner open Work")?.disabled, true);
    assert.match(doc.body.textContent || "", /Only admins can open this library/);
    // The number counts everyone who can open it, so the admin counts from the start.
    await waitFor(() => trigger()?.getAttribute("aria-label") === "Who can open Work: admins only");
    assert.equal(trigger()?.textContent, "1");
    input("Let alice open Work")?.click();
    await waitFor(() => input("Let alice open Work")?.checked === true);
    await waitFor(() => trigger()?.getAttribute("aria-label") === "Who can open Work: 2 users");
    assert.equal(trigger()?.textContent, "2");

    // Unsharing and resharing before saving keeps the limit instead of opening the library to everyone.
    input("Share Work")?.click();
    await waitFor(() => trigger() === null);
    input("Share Work")?.click();
    await waitFor(() => trigger()?.getAttribute("aria-label") === "Who can open Work: 2 users");
    trigger()?.click();
    await waitFor(() => input("Let alice open Work")?.checked === true);

    // Renaming alice in the Access tab carries over to the library.
    const username = input("Username for user 1");
    assert.ok(username);
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(username, "alicia");
    username.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await waitFor(() => input("Let alicia open Work")?.checked === true);

    doc.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => saves.length === 1);
    assert.deepEqual(JSON.parse(JSON.stringify(saves[0].sharedLibraries)), [{ name: "Work", path: "/Users/me/Work.library", access: "selected", users: ["alicia"] }]);
    // Row keys are for the panel only and never reach the saved settings.
    assert.equal(JSON.stringify(saves[0].authUsers).includes("rowKey"), false);

    // With no admin left, the count no longer includes one, and an empty selection means nobody.
    const role = doc.querySelector<HTMLSelectElement>('[aria-label="Role for owner"]');
    assert.ok(role);
    await waitFor(() => !role.disabled);
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")?.set?.call(role, "viewer");
    role.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await waitFor(() => trigger()?.getAttribute("aria-label") === "Who can open Work: 1 user");
    input("Let alicia open Work")?.click();
    await waitFor(() => trigger()?.getAttribute("aria-label") === "Who can open Work: nobody");
    assert.equal(trigger()?.textContent, "0");
    assert.match(doc.body.textContent || "", /Nobody can open this library/);
  } finally {
    dom.window.close();
  }
});

test("plugin keeps library access with the account while another account's name is edited", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife", platform: "browser", write: false,
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    runScripts: "outside-only", url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1]);
  const pluginWindow = dom.window as unknown as Window & { eval: (source: string) => unknown; require: (id: string) => unknown; eagle: unknown };
  const saves: Record<string, unknown>[] = [];
  const status: { settings: Record<string, unknown>; state: string; url: string } = {
    settings: {
      host: "127.0.0.1", port: 41532, authEnabled: true, libraryProtectionEnabled: true,
      authUsers: [
        { username: "alice", role: "viewer", passwordHash: "x" },
        { username: "bob", role: "viewer", passwordHash: "x" },
      ],
      sharedLibraries: [
        { name: "Bob", path: "/Users/me/Bob.library", access: "selected", users: ["bob"] },
        { name: "Alice", path: "/Users/me/Alice.library", access: "selected", users: ["alice"] },
      ],
    },
    state: "stopped", url: "http://localhost:41532",
  };
  pluginWindow.eagle = { library: { name: "Bob", path: "/Users/me/Bob.library" } };
  pluginWindow.require = (id: string) => id === "path" ? path : {
    createServerManager: () => ({
      async init() { return status; },
      async status() { return status; },
      async saveSettings(payload: Record<string, unknown>) {
        saves.push(payload);
        return status;
      },
      async start() { return status; },
      async stop() { return status; },
      async libraries() { return { current: null, items: [] }; },
    }),
  };
  try {
    pluginWindow.eval(bundle.outputFiles[0].text);
    const doc = dom.window.document;
    const username = () => doc.querySelector<HTMLInputElement>('[aria-label="Username for user 1"]');
    await waitFor(() => username()?.disabled === false);
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
    // The first row passes through the second account's name on its way to a new one.
    for (const name of ["bob", "carol"]) {
      const input = username();
      assert.ok(input);
      valueSetter?.call(input, name);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      await waitFor(() => username()?.getAttribute("value") === name);
    }
    doc.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => saves.length === 1);
    const saved = JSON.parse(JSON.stringify(saves[0].sharedLibraries)) as Array<{ name: string; users: string[] }>;
    assert.deepEqual(saved.map((library) => [library.name, library.users]), [["Bob", ["bob"]], ["Alice", ["carol"]]]);
  } finally {
    dom.window.close();
  }
});

test("activity search asks the log once typing pauses and ignores an older answer", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife", platform: "browser", write: false,
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    runScripts: "outside-only", url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1]);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
    eagle: unknown;
  };
  const status = { settings: { host: "127.0.0.1", port: 41532 }, state: "stopped", url: "http://localhost:41532" };
  const searches: string[] = [];
  const addressFilters: Array<Array<{ field: string; value: string }>> = [];
  const searchKeys: Array<{ events: string[] }> = [];
  const held = new Map<string, () => void>();
  const summaryFor = (search: string) => ({
    activeClients: 0, buckets: [], clientCount: 1,
    clients: ["192.168.1.7", "192.168.1.77"].map((ip, index) => ({ active: false, authFailures: 0, edits: 0, ip, lastSeen: Date.now(), user: index ? "carol" : "", views: 0 })),
    range: "24h",
    recent: search === "none" ? [] : [{ at: Date.now(), event: "login_failure", ip: search ? `address-${search}` : "address-all", type: "auth", user: "bob" }],
    totals: { auth: 0, authFailures: 0, browse: 0, edit: 0, view: 0 },
  });
  pluginWindow.eagle = {};
  pluginWindow.require = (id: string) => id === "path" ? path : {
    createServerManager: () => ({
      async init() { return status; },
      async status() { return status; },
      async accessLogSummary({ filters = [], search = "", searchKeys: keys }: { filters?: Array<{ field: string; value: string }>; search?: string; searchKeys?: { events: string[] } }) {
        searches.push(search);
        addressFilters.push(filters);
        if (keys) searchKeys.push(keys);
        if (search === "slow") await new Promise<void>((resolve) => held.set(search, resolve));
        return summaryFor(search);
      },
    }),
  };
  try {
    pluginWindow.eval(bundle.outputFiles[0].text);
    const doc = dom.window.document;
    await waitFor(() => Boolean(doc.querySelector('[aria-label="Show activity"]')));
    doc.querySelector<HTMLButtonElement>('[aria-label="Show activity"]')?.click();
    await waitFor(() => /address-all/.test(doc.body.textContent || ""));
    const input = doc.querySelector<HTMLInputElement>('input[aria-label="Search recent events"]');
    assert.ok(input);
    const type = (value: string) => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    };

    // Keys in quick succession ask once, for the final text.
    const before = searches.length;
    type("s");
    type("sl");
    type("slow");
    await waitFor(() => searches.includes("slow"));
    assert.deepEqual(searches.slice(before), ["slow"]);
    // Matches turn blue only once the events for that search are listed.
    const marks = () => Array.from(doc.querySelectorAll('[aria-label="Recent events"] mark')).map((mark) => mark.textContent).join(",");
    assert.equal(marks(), "");

    // A newer search wins even though the older answer arrives last.
    type("fast");
    await waitFor(() => /address-fast/.test(doc.body.textContent || ""));
    held.get("slow")?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.doesNotMatch(doc.body.textContent || "", /address-slow/);
    assert.match(doc.body.textContent || "", /address-fast/);
    assert.equal(marks(), "fast");

    type("none");
    await waitFor(() => /No matching events\./.test(doc.body.textContent || ""));

    type("");
    await waitFor(() => searches.at(-1) === "");
    assert.equal(doc.querySelector('button[aria-label="Clear search"]'), null);
    const button = (label: string) => doc.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const lastFilter = () => (addressFilters.at(-1) || []).map((filter) => `${filter.field}:${filter.value}`).join(",");

    // Clicking devices adds exact-address chips; the search text stays as typed.
    button("Filter events by 192.168.1.7")?.click();
    await waitFor(() => lastFilter() === "address:192.168.1.7");
    button("Filter events by 192.168.1.77")?.click();
    await waitFor(() => lastFilter() === "address:192.168.1.7,address:192.168.1.77");
    assert.equal(input.value, "");
    assert.equal(button("Stop filtering events by 192.168.1.7")?.getAttribute("aria-pressed"), "true");

    // A chip's x removes that address, and so does clicking the device again.
    button("Remove 192.168.1.7 from the filter")?.click();
    await waitFor(() => lastFilter() === "address:192.168.1.77");
    assert.equal(button("Remove 192.168.1.7 from the filter"), null);
    button("Stop filtering events by 192.168.1.77")?.click();
    await waitFor(() => lastFilter() === "");

    // Recent events' address, user, and event add chips too, named so each reads on its own.
    button("Filter events by address-all")?.click();
    await waitFor(() => lastFilter() === "address:address-all");
    button("Filter events by User: bob")?.click();
    await waitFor(() => lastFilter() === "address:address-all,user:bob");
    button("Filter events by Event: Sign-in failed")?.click();
    await waitFor(() => lastFilter() === "address:address-all,user:bob,event:login_failure");
    assert.ok(button("Remove User: bob from the filter"));
    assert.ok(button("Remove Event: Sign-in failed from the filter"));

    // A device's user does the same; a device nobody signed in on has nothing to click.
    button("Filter events by User: carol")?.click();
    await waitFor(() => lastFilter() === "address:address-all,user:bob,event:login_failure,user:carol");
    assert.equal(doc.querySelectorAll('[aria-label="Devices"] button[aria-label*="User:"]').length, 1);

    // The panel's wording reaches the log as keys.
    type("sign-in failed");
    await waitFor(() => searches.at(-1) === "sign-in failed");
    assert.equal(JSON.stringify(searchKeys.at(-1)?.events), '["login_failure"]');

    // The box's x clears the chips and the text together.
    type("bob");
    await waitFor(() => searches.at(-1) === "bob");
    button("Clear search")?.click();
    await waitFor(() => input.value === "" && lastFilter() === "" && searches.at(-1) === "");
  } finally {
    dom.window.close();
  }
});

test("plugin saves shared libraries with the settings and reacts to Eagle library switches", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife", platform: "browser", write: false,
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    runScripts: "outside-only", url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1]);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
    eagle: unknown;
  };
  const saves: Record<string, unknown>[] = [];
  let libraryChangedCalls = 0;
  const libraryChangedPaths: string[] = [];
  let libraryListCalls = 0;
  const libraryListInputs: unknown[] = [];
  let onLibraryChanged: ((libraryPath: string) => void) | null = null;
  let status: { settings: Record<string, unknown>; state: string; url: string } = {
    settings: { host: "127.0.0.1", port: 41532, libraryProtectionEnabled: false, sharedLibraries: [] },
    state: "stopped", url: "http://localhost:41532",
  };
  const eagleLibrary = { name: "Work", path: "/Users/me/Work.library" };
  const switchedPaths: string[] = [];
  let switchDialogResponse = 0;
  let switchError = "";
  const switchDialogs: Array<{ detail?: string; message: string }> = [];
  pluginWindow.eagle = {
    app: { async getPath(name: string) { return name === "userData" ? "/Users/me/Library/Application Support/Eagle" : ""; } },
    dialog: {
      async showMessageBox(options: { detail?: string; message: string }) {
        switchDialogs.push(options);
        return { response: switchDialogResponse };
      },
    },
    library: eagleLibrary,
    onLibraryChanged(callback: (libraryPath: string) => void) {
      onLibraryChanged = callback;
    },
  };
  pluginWindow.require = (id: string) => id === "path" ? path : {
    createServerManager: () => ({
      async init() { return status; },
      async status() { return status; },
      async saveSettings(payload: Record<string, unknown>) {
        saves.push(payload);
        status = { ...status, settings: { ...status.settings, ...payload } };
        return status;
      },
      async start() { status = { ...status, state: "running" }; return status; },
      async stop() { status = { ...status, state: "stopped" }; return status; },
      libraryChanged(libraryPath: string) { libraryChangedCalls += 1; libraryChangedPaths.push(libraryPath); },
      async switchLibrary(libraryPath: string) {
        if (switchError) throw new Error(switchError);
        switchedPaths.push(libraryPath);
      },
      async libraries(input: { current: { path: string } | null }) {
        libraryListCalls += 1;
        libraryListInputs.push(JSON.parse(JSON.stringify(input)));
        const openPath = input.current?.path || "";
        return {
          current: { path: openPath, name: openPath.includes("Work") ? "Work" : "Private" },
          items: ["/Users/me/Work.library", "/Users/me/Private.library"].map((libraryPath) => ({
            path: libraryPath,
            name: libraryPath.includes("Work") ? "Work" : "Private",
            current: libraryPath === openPath,
            shared: Boolean(status.settings.libraryProtectionEnabled)
              && ((status.settings.sharedLibraries as Array<{ path: string }> | undefined) || []).some((library) => library.path === libraryPath),
          })),
        };
      },
    }),
  };
  try {
    pluginWindow.eval(bundle.outputFiles[0].text);
    const doc = dom.window.document;
    await waitFor(() => Boolean(doc.querySelector('[aria-label="Share Work"]')) && doc.querySelector<HTMLInputElement>('[aria-label="Share only selected libraries"]')?.disabled === false);
    doc.querySelector<HTMLButtonElement>("#librariesSettingsTab")?.click();
    assert.equal(doc.body.textContent?.includes("Add library"), false);
    assert.equal(doc.body.textContent?.includes("Eagle API is unavailable"), false);
    assert.deepEqual(libraryListInputs[0], {
      current: { name: "Work", path: "/Users/me/Work.library" },
      userDataPath: "/Users/me/Library/Application Support/Eagle",
    });

    // Every row has the folder icon: a mark on the library open in Eagle, a switch button on the others.
    assert.deepEqual([...doc.querySelectorAll('ul[aria-label="Libraries"] [role="img"]')].map((icon) => icon.getAttribute("aria-label")), ["Open in Eagle"]);
    assert.equal(doc.querySelector('button[aria-label="Switch Eagle to Work"]'), null);
    const switchButton = () => doc.querySelector<HTMLButtonElement>('button[aria-label="Switch Eagle to Private"]');
    assert.ok(switchButton());

    // Nothing is asked of Eagle until the dialog is confirmed.
    switchButton()?.click();
    await waitFor(() => switchDialogs.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(switchedPaths, []);
    assert.equal(switchDialogs[0].message, "Switch Eagle to Private?");
    assert.doesNotMatch(switchDialogs[0].detail || "", /viewers/);
    switchDialogResponse = 1;
    switchButton()?.click();
    await waitFor(() => switchedPaths.length === 1);
    assert.deepEqual(switchedPaths, ["/Users/me/Private.library"]);
    // Eagle reports the switch by event; until then the row still shows what is open.
    assert.ok(switchButton());
    switchError = "Eagle refused the switch";
    switchButton()?.click();
    await waitFor(() => /Eagle refused the switch/.test(doc.body.textContent || ""));
    switchError = "";

    const protection = doc.querySelector<HTMLInputElement>('[aria-label="Share only selected libraries"]');
    assert.ok(protection);
    protection.click();
    await waitFor(() => doc.querySelector<HTMLInputElement>('[aria-label="Share Work"]')?.disabled === false);
    assert.match(doc.body.textContent || "", /The library open in Eagle is not shared/);
    // Only the checkbox toggles sharing: no label wraps it, so a click on the row's text does nothing.
    assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="Share Work"]')?.closest("label"), null);
    doc.querySelector<HTMLInputElement>('[aria-label="Share Work"]')?.click();
    await waitFor(() => doc.querySelector<HTMLInputElement>('[aria-label="Share Work"]')?.checked === true);
    assert.doesNotMatch(doc.body.textContent || "", /The library open in Eagle is not shared/);
    assert.equal(saves.length, 0, "library changes are drafts until settings are saved");
    assert.doesNotMatch(doc.body.textContent || "", /Online|Offline/, "the status badge waits for the saved settings");

    doc.querySelector("form")?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => saves.length === 1 && /Saved/.test(doc.querySelector("[aria-live]")?.textContent || "") && doc.querySelector<HTMLInputElement>('label[aria-label="Start or stop server"] input')?.disabled === false);
    assert.equal(saves[0].libraryProtectionEnabled, true);
    assert.equal(JSON.stringify(saves[0].sharedLibraries), JSON.stringify([{ name: "Work", path: "/Users/me/Work.library" }]));
    // Saved and open in Eagle, but viewers can't reach it until the server runs.
    await waitFor(() => /Offline/.test(doc.body.textContent || ""));
    assert.doesNotMatch(doc.body.textContent || "", /Online/);

    doc.querySelector<HTMLInputElement>('label[aria-label="Start or stop server"] input')?.click();
    await waitFor(() => /Settings are locked while the server is running/.test(doc.body.textContent || ""));
    await waitFor(() => /Online/.test(doc.body.textContent || ""));
    assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="Share only selected libraries"]')?.disabled, true);
    assert.equal(doc.querySelector<HTMLInputElement>('[aria-label="Share Work"]')?.disabled, true);

    // Switching isn't a setting: it stays available while the server runs, and warns about viewers.
    assert.equal(switchButton()?.disabled, false);
    switchDialogResponse = 0;
    switchButton()?.click();
    await waitFor(() => switchDialogs.length === 4);
    assert.match(switchDialogs[3].detail || "", /Connected viewers return to the connect screen/);

    const listCallsBeforeReload = libraryListCalls;
    const reload = doc.querySelector<HTMLButtonElement>('button[aria-label="Reload libraries"]');
    assert.ok(reload);
    // It sits in the list's header row, which must stay exposed for the button to be reachable.
    assert.equal(reload.closest('[aria-hidden="true"]'), null);
    assert.equal(reload.closest(".rounded-xl")?.querySelector("ul[aria-label='Libraries']") != null, true);
    reload.click();
    await waitFor(() => libraryListCalls === listCallsBeforeReload + 1);

    Object.assign(eagleLibrary, { name: "Private", path: "/Users/me/Private.library" });
    assert.ok(onLibraryChanged);
    (onLibraryChanged as (libraryPath: string) => void)(eagleLibrary.path);
    await waitFor(() => /The library open in Eagle is not shared/.test(doc.body.textContent || ""));
    assert.equal(libraryChangedCalls, 1);
    assert.deepEqual(libraryChangedPaths, ["/Users/me/Private.library"]);
    // The shared library is no longer the open one, so it goes offline.
    await waitFor(() => /Offline/.test(doc.body.textContent || "") && !/Online/.test(doc.body.textContent || ""));
  } finally {
    dom.window.close();
  }
});

test("the Advanced Sort progress follows the new library's scan after Eagle switches libraries", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eagle: unknown;
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  let sortIndex: { loaded: number; status: string; total: number } | null = { status: "ready", loaded: 3, total: 3 };
  const status = () => ({
    settings: { authEnabled: false, authUsers: [], autoStart: false, experimentalSort: true, host: "127.0.0.1", port: 41532 },
    sortIndex,
    state: "running",
    url: "http://127.0.0.1:41532",
  });
  const eagleEvents: { libraryChanged?: (libraryPath: string) => void } = {};
  pluginWindow.eagle = { onLibraryChanged(callback: (libraryPath: string) => void) { eagleEvents.libraryChanged = callback; } };
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() { return status(); },
          async libraryChanged() {
            // The server drops the previous index and starts scanning the new library.
            sortIndex = { status: "building", loaded: 10, total: 100 };
          },
          async saveSettings() { return status(); },
          async start() { return status(); },
          async status() { return status(); },
          async stop() { return status(); },
        };
      },
    };
  };

  pluginWindow.eval(bundle.outputFiles[0].text);
  const progressText = () => dom.window.document.querySelector("[role=progressbar]")?.getAttribute("aria-valuetext") || "";
  await waitFor(() => progressText() === "Ready · 3 items");
  assert.ok(eagleEvents.libraryChanged);
  eagleEvents.libraryChanged("/Users/xxx/Other.library");
  await waitFor(() => progressText() === "Scanning library… 10 / 100 (10%)");
  // Following continues until the new scan is done.
  sortIndex = { status: "ready", loaded: 100, total: 100 };
  // The panel asks once a second while a scan runs.
  await waitFor(() => progressText() === "Ready · 100 items", { timeoutMs: 3000 });
});

test("the Advanced Sort progress keeps being asked for until the scan has started and finished", async () => {
  const bundle = await esbuild({
    bundle: true,
    define: { "process.env.NODE_ENV": JSON.stringify("test") },
    entryPoints: [new URL("./app.tsx", import.meta.url).pathname],
    format: "iife",
    platform: "browser",
    write: false,
  });
  const domOptions = {
    runScripts: "outside-only",
    url: "file:///tmp/eagle-plugin/plugin/index.html",
  } as unknown as ConstructorParameters<typeof JSDOM>[1];
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", domOptions);
  const pluginWindow = dom.window as unknown as Window & {
    eval: (source: string) => unknown;
    require: (id: string) => unknown;
  };
  // Eagle is slow to name the library, so the first answers have no index yet; one check fails.
  const answers: Array<{ loaded: number; status: string; total: number } | null | Error> = [
    null,
    null,
    new Error("busy"),
    { status: "building", loaded: 5, total: 10 },
    { status: "ready", loaded: 10, total: 10 },
  ];
  let calls = 0;
  const status = (sortIndex: { loaded: number; status: string; total: number } | null) => ({
    settings: { authEnabled: false, authUsers: [], autoStart: false, experimentalSort: true, host: "127.0.0.1", port: 41532 },
    sortIndex,
    state: "running",
    url: "http://127.0.0.1:41532",
  });
  pluginWindow.require = (id: string) => {
    if (id === "path") return path;
    return {
      createServerManager() {
        return {
          async init() { return status(null); },
          async saveSettings() { return status(null); },
          async start() { return status(null); },
          async status() {
            const answer = answers[Math.min(calls, answers.length - 1)];
            calls += 1;
            if (answer instanceof Error) throw answer;
            return status(answer);
          },
          async stop() { return status(null); },
        };
      },
    };
  };

  pluginWindow.eval(bundle.outputFiles[0].text);
  const progressText = () => dom.window.document.querySelector("[role=progressbar]")?.getAttribute("aria-valuetext") || "";
  await waitFor(() => progressText() === "Scanning library…");
  await waitFor(() => progressText() === "Ready · 10 items", { timeoutMs: 8000 });
  // Once ready, it stops asking.
  const settled = calls;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(calls, settled);
}, 15_000);

test("the plugin package leaves out the standalone server's own modules, and nothing it ships needs them", async () => {
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  const pattern = viteConfig.match(/const STANDALONE_ONLY_MODULE = (\/.+\/);/)?.[1];
  assert.ok(pattern, "vite.config.ts filters the standalone modules");
  const standaloneOnly = ["fsBackend", "standalone", "standaloneConfig", "standaloneLog"];
  const shipped = ["accessLog", "addressBlockList", "auth", "connection", "customDomain", "eagleClient", "libraryAccess", "libraryBackend", "libraryIndex", "media", "runtime", "static", "upload", "viewerServer"];
  for (const name of shipped) {
    const source = await readFile(new URL(`${name}.cjs`, generatedServiceUrl), "utf8");
    for (const excluded of standaloneOnly) assert.doesNotMatch(source, new RegExp(`require\\("\\./${excluded}\\.cjs"\\)`), `${name}.cjs requires ${excluded}.cjs`);
  }
  for (const excluded of standaloneOnly) assert.match(viteConfig, new RegExp(`\\b${excluded}\\b`));
});
