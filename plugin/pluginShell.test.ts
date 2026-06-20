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

  assert.match(html, /id="root"/);
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.match(app, /function App\(\)/);
  assert.match(app, /createRoot\(root\)\.render/);
  assert.match(app, /Media Preview Server/);
  assert.match(app, /Start or stop server/);
  assert.match(app, /Endpoint URL/);
  assert.match(app, /Quick Access \(QR\)/);
  assert.match(app, /<span className="m-0 text-base font-\[420\] leading-none text-\[#111\]">Settings<\/span>/);
  assert.match(app, /src=\{serverState === "running" \? "\.\/assets\/icon_on\.svg" : "\.\/assets\/icon_off\.svg"\}/);
  assert.doesNotMatch(app, /<select\s+hidden/);
  assert.doesNotMatch(app, /<button type="submit" hidden/);
  assert.doesNotMatch(html, /id="requestLogBody"/);
  assert.doesNotMatch(html, /id="requestLogEnabledInput"/);
  assert.doesNotMatch(html, /id="grid"/);
});

test("plugin window uses per-user roles for metadata permissions", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /<option value="viewer">Viewer<\/option>/);
  assert.match(app, /<option value="editor">Editor<\/option>/);
  assert.match(app, /<option value="admin">Admin<\/option>/);
  assert.match(app, /type SettingsTab = "access" \| "general" \| "security";/);
  assert.match(app, /const \[settingsTab, setSettingsTab\] = useState<SettingsTab>\("general"\);/);
  assert.match(app, /role="tablist" aria-label="Settings sections"/);
  assert.match(app, /<SettingsTabButton active=\{settingsTab === "general"\} controls="generalSettingsPanel" id="generalSettingsTab" onClick=\{\(\) => setSettingsTab\("general"\)\}>General<\/SettingsTabButton>/);
  assert.match(app, /<SettingsTabButton active=\{settingsTab === "access"\} controls="accessSettingsPanel" id="accessSettingsTab" onClick=\{\(\) => setSettingsTab\("access"\)\}>Access<\/SettingsTabButton>/);
  assert.match(app, /<SettingsTabButton active=\{settingsTab === "security"\} controls="securitySettingsPanel" id="securitySettingsTab" onClick=\{\(\) => setSettingsTab\("security"\)\}>Security<\/SettingsTabButton>/);
  assert.match(app, /id="generalSettingsPanel" role="tabpanel" aria-labelledby="generalSettingsTab" hidden=\{settingsTab !== "general"\}/);
  assert.match(app, /id="accessSettingsPanel" role="tabpanel" aria-labelledby="accessSettingsTab" hidden=\{settingsTab !== "access"\}/);
  assert.match(app, /id="securitySettingsPanel" role="tabpanel" aria-labelledby="securitySettingsTab" hidden=\{settingsTab !== "security"\}/);
  assert.doesNotMatch(app, /id="authUsersStatus"/);
  assert.doesNotMatch(app, /const metadataEditingEnabled/);
  assert.doesNotMatch(app, /const authUsersStatusLabel/);
  assert.doesNotMatch(app, /Active editors/);
  assert.doesNotMatch(app, /Active viewers/);
  assert.doesNotMatch(app, /Active/);
  assert.doesNotMatch(app, /Inactive/);
  assert.doesNotMatch(app, /metadataEditingEnabled\s*\?/);
  assert.doesNotMatch(app, /id="authUsersStatus"[^>]+role="status"/);
  assert.match(app, /Saved users apply when password protection is enabled\./);
  assert.match(app, /Admin has all permissions\./);
  assert.match(app, /<span>Username<\/span>/);
  assert.match(app, /<span>Role<\/span>/);
  assert.match(app, /<span>Password<\/span>/);
  assert.match(app, /aria-label=\{`Username for user \$\{index \+ 1\}`\}/);
  assert.match(app, /aria-label=\{`Role for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\}/);
  assert.match(app, /aria-label=\{`Password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\}/);
  assert.match(app, /<PlusIcon className="h-\[12px\] w-\[12px\]" \/>/);
  assert.match(app, /<span>Add user<\/span>/);
  assert.match(app, /const settingInputClassName = /);
  assert.match(app, /className=\{settingInputClassName\}/);
  assert.match(app, /className=\{`\$\{settingInputClassName\} px-1\.5`\}/);
  assert.match(app, /const authActionButtonClassName = /);
  assert.match(app, /\$\{authActionButtonClassName\}/);
  assert.match(app, /disabled:cursor-not-allowed disabled:opacity-45/);
  assert.match(app, /disabled:cursor-not-allowed disabled:bg-\[#f4f5f7\] disabled:text-\[#8a8f99\]/);
  assert.match(app, /has-\[:disabled\]:cursor-not-allowed has-\[:disabled\]:opacity-60/);
  assert.match(app, /disabled:cursor-not-allowed" type="checkbox"/);
  assert.match(app, /function SettingRow\(\{ children, help, label \}/);
  assert.doesNotMatch(app, /<label className="grid grid-cols-\[72px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(app, /Admin is reserved for full management permissions/);
  assert.doesNotMatch(app, /title="Editor roles"/);
  assert.doesNotMatch(app, /function EditIcon\(/);
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
  assert.match(app, /onChange=\{\(event\) => updateAuthUser\(index, \{ role: event\.currentTarget\.value as UserRole \}\)\}/);
  assert.doesNotMatch(app, /saveSettings\(\{ patch: \{ authUsers: authUsers\.map/);
  assert.match(app, /const cleanUserPasswords = collectUserPasswords\(effectiveAuthUsers, passwordDrafts\);/);
  assert.match(app, /function collectUserPasswords\(users: AuthUser\[\], values: Record<string, string>\)/);
  assert.match(app, /function authUsersMissingPassword\(users: AuthUser\[\], values: Record<string, string>\)/);
  assert.doesNotMatch(app, /Object\.fromEntries\(effectiveAuthUsers\s*\n\s*\.map/);
  assert.doesNotMatch(app, /authUsers\.some\(\(user, index\) => !user\.passwordHash && !userPasswords/);
  assert.match(app, /function settingsPayloadChanged\(current: PluginSettings \| undefined, nextSettings: Record<string, unknown>\)/);
  assert.match(app, /function serverSettingsChanged\(current: PluginSettings, nextSettings: Record<string, unknown>\)/);
  assert.match(app, /function serverRestartSettingsChanged\(current: PluginSettings, nextSettings: Record<string, unknown>\)/);
  assert.match(app, /return serverRestartSettingsChanged\(current, nextSettings\);/);
  assert.match(app, /return serverSettingsChanged\(current, nextSettings\);/);
  assert.match(app, /if \(hasPasswordUpdates\(nextSettings\.userPasswords\)\) return true;/);
  assert.match(app, /function hasPasswordUpdates\(value: unknown\)/);
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
  assert.match(app, /userPasswordsRef\.current\[String\(index\)\]/);
  assert.match(app, /removeIndexedValue\(userPasswordsRef\.current, index\)/);
  assert.match(app, /setPasswordVisibleByIndex\(\(current\) => removeIndexedValue\(current, index\)\);/);
  assert.match(app, /passwordDrafts = userPasswordsRef\.current/);
  assert.match(app, /defaultValue=\{userPasswordsRef\.current\[String\(index\)\] \|\| ""\}/);
  assert.match(app, /onChange=\{\(event\) => setUserPasswordDraft\(index, event\.currentTarget\.value\)\}/);
  assert.match(app, /key=\{`\$\{passwordDraftRevision\}-\$\{index\}`\}/);
  assert.match(app, /function togglePasswordVisible\(index: number\)/);
  assert.match(app, /const canTogglePasswordVisible = !user\.passwordHash;/);
  assert.match(app, /const passwordVisible = canTogglePasswordVisible && passwordVisibleByIndex\[String\(index\)\];/);
  assert.match(app, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(app, /aria-label=\{canTogglePasswordVisible \? \(passwordVisible \? `Hide password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}` : `Show password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\) : `Saved password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\} is hidden`\}/);
  assert.match(app, /title=\{canTogglePasswordVisible \? \(passwordVisible \? "Hide password" : "Show password"\) : "Saved password is hidden"\}/);
  assert.match(app, /disabled=\{settingsInputDisabled \|\| !canTogglePasswordVisible\}/);
  assert.match(app, /onClick=\{canTogglePasswordVisible \? \(\) => togglePasswordVisible\(index\) : undefined\}/);
  assert.match(app, /passwordVisible \? <EyeIcon className="h-\[13px\] w-\[13px\]" \/> : <EyeOffIcon className="h-\[13px\] w-\[13px\]" \/>/);
  assert.doesNotMatch(app, /const \[passwordVisible, setPasswordVisible\]/);
  assert.doesNotMatch(app, /Show passwords/);
  assert.doesNotMatch(app, /Hide passwords/);
  assert.doesNotMatch(app, /const \[userPasswords, setUserPasswords\]/);
  assert.doesNotMatch(app, /value=\{userPasswords/);
  assert.match(app, /<button className=\{`ml-auto inline-flex h-7 items-center rounded-md px-2 text-\[11px\] font-medium text-\[#111\] \$\{authActionButtonClassName\}`\} type="submit" disabled=\{settingsInputDisabled\}>/);
  assert.match(app, />\s*Save settings\s*<\/button>/);
  assert.match(app, /saveSettings\(\{ forceSave: true, successMessage: "Saved" \}\)/);
  assert.doesNotMatch(app, /onBlur=\{[^}]*saveSettings/);
  assert.doesNotMatch(app, /saveSettings\(\{ forceSave: true, patch: \{ port:/);
  assert.match(app, /<SettingRow label="Port" help=\{serverState === "running" \? "Stop the server before changing the port\." : "The port the server listens on\."\}>/);
  assert.match(app, /disabled=\{settingsInputDisabled\}/);
  assert.match(app, /flex min-h-8 items-center justify-between gap-3 border-t border-\[#e1e3e7\] pt-2/);
  assert.match(app, /<p className=\{`min-w-0 flex-1 truncate px-0\.5 text-\[10px\] \$\{messageIsError \? "text-\[#d92d20\]" : "text-\[#178c35\]"\}`\} aria-live="polite" hidden=\{!message\}>/);
  assert.match(app, /messageIsError \? "text-\[#d92d20\]" : "text-\[#178c35\]"/);
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

  assert.match(app, /<form/);
  assert.match(app, /const \[settingsExpanded, setSettingsExpanded\] = useState\(true\);/);
  assert.match(app, /id="settingsToggleButton"/);
  assert.match(app, /aria-label=\{settingsExpanded \? "Hide settings" : "Show settings"\}/);
  assert.match(app, /className=\{`\$\{settingsExpanded \? "mb-2\.5 border-b border-\[#e1e3e7\] pb-2\.5" : ""\} flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left`\}/);
  assert.match(app, /aria-controls="settingsPanel"/);
  assert.match(app, /aria-expanded=\{settingsExpanded\}/);
  assert.match(app, /hidden=\{!settingsExpanded\}/);
  assert.match(app, /setSettingsExpanded\(\(current\) => !current\)/);
  assert.match(app, /<ChevronIcon className=\{`h-\[12px\] w-\[12px\] text-\[#555c66\] transition-transform \$\{settingsExpanded \? "rotate-180" : ""\}`\} \/>/);
  assert.doesNotMatch(app, /<span>\{settingsExpanded \? "Hide" : "Show"\}<\/span>/);
  assert.match(app, /function ChevronIcon/);
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
  const addUserButton = Array.from(dom.window.document.querySelectorAll("button")).find((button) => button.textContent?.includes("Add user"));
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
  assert.match(dom.window.document.body.textContent || "", /Stop the server before changing the port\./);
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
  assert.match(authSource, /return rolePermissions\(user\?\.role\)\.writeMetadata;/);
  assert.match(authSource, /return rolePermissions\(user\?\.role\)\.writeRating;/);
  assert.match(authSource, /return rolePermissions\(user\?\.role\)\.manageLibrary;/);
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
  assert.match(authSource, /user: user \? \{ role: user\.role, username: user\.username \} : null/);
  assert.match(authSource, /permissions: permissionsForUser\(user, \{ authenticated \}\)/);
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
  assert.match(serverSource, /const auth = \{ authSessions, loginFailures, revokedAuthSessions, secureCookies: httpsEnabled, sessionMaxAgeSeconds, sessionSecret: resolvedSessionSecret, users: resolvedAuthUsers \};/);
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
  assert.match(staticSource, /"frame-ancestors 'self'"/);
  assert.doesNotMatch(staticSource, /"frame-ancestors 'none'"/);
  assert.match(staticSource, /"X-Frame-Options": "SAMEORIGIN"/);
  assert.doesNotMatch(mediaSource, /mediaSecurityHeaders/);
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

test("plugin app animates the stopped status text while a restart is busy", async () => {
  const app = await readPluginAppSource();

  assert.match(app, /const busyStoppedFrames = Object\.freeze\(\["\.", "\.\.", "\.\.\.", "\.\.\.\.", "\.\.\.\.\."\]\);/);
  assert.match(app, /const \[busyFrame, setBusyFrame\] = useState\(0\);/);
  assert.match(app, /window\.setInterval\(\(\) => \{/);
  assert.match(app, /busyStoppedFrames\[busyFrame\]/);
  assert.doesNotMatch(app, /Stopped\.\.\./);
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
  const app = await readPluginAppSource();

  assert.doesNotMatch(css, /\.titlebar\s*\{/);
  assert.doesNotMatch(css, /\.brand-icon\s*\{/);
  assert.doesNotMatch(css, /\.power-switch\s*\{/);
  assert.match(app, /h-\[46px\]/);
  assert.match(app, /h-6 w-6 rounded-md object-cover/);
  assert.match(app, /cursor-pointer/);
  assert.match(app, /grid h-\[124px\] w-\[124px\]/);
  assert.match(css, /button:disabled,\s*input:disabled,\s*select:disabled\s*\{[^}]*cursor: not-allowed;/s);
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
