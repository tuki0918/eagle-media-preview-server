import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

type PluginRequirePath = (relativePath: string) => string;
const generatedServiceUrl = new URL("../dist/.generated/plugin-service/", import.meta.url);

async function readPluginAppSource() {
  return readFile(new URL("./app.tsx", import.meta.url), "utf8");
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
  assert.equal(manifest.main.resizable, false);
  assert.equal(manifest.main.maximizable, false);
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
  assert.match(app, /<SectionHeading icon=\{<SettingsIcon \/>\}>Settings<\/SectionHeading>/);
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
  assert.match(app, /id="authUsersStatus"/);
  assert.match(app, /const metadataEditingEnabled = authEnabled && authUsersCanEditMetadata\(authUsers\);/);
  assert.match(app, /Active editors/);
  assert.match(app, /Active viewers/);
  assert.match(app, /metadataEditingEnabled\s*\?\s*"border-\[#b5ebc1\] bg-\[#e7f8eb\] text-\[#178c35\]"/);
  assert.match(app, /"border-\[#c5d4f3\] bg-\[#edf3ff\] text-\[#2f5fbd\]"/);
  assert.match(app, /id="authUsersStatus"[^>]+role="status"/);
  assert.match(app, /Saved users apply when BasicAuth protection is enabled\./);
  assert.match(app, /Admin can also switch libraries\./);
  assert.match(app, /<span>Username<\/span>/);
  assert.match(app, /<span>Role<\/span>/);
  assert.match(app, /<span>Password<\/span>/);
  assert.match(app, /aria-label=\{`Username for user \$\{index \+ 1\}`\}/);
  assert.match(app, /aria-label=\{`Role for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\}/);
  assert.match(app, /aria-label=\{`Password for \$\{user\.username \|\| `user \$\{index \+ 1\}`\}`\}/);
  assert.match(app, /<PlusIcon className="h-\[12px\] w-\[12px\]" \/>/);
  assert.match(app, /<span>Add user<\/span>/);
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
  assert.match(app, /if \(saved && hasUserPasswords\) setUserPasswords\(\{\}\);/);
  assert.match(app, /if \(saved\) setMessage\(""\);/);
  assert.match(app, /if \(hasUserPasswords\) setUserPasswords\(\{\}\);/);
  assert.match(app, /if \(!hasUserPasswords && !settingsPayloadChanged\(settings, payload\)\)/);
  assert.match(app, /const AUTH_PASSWORD_REQUIRED_MESSAGE = "Enter a password for every user to enable BasicAuth protection\.";/);
  assert.match(app, /const nextAuthEnabled = Boolean\(patch\.authEnabled \?\? authEnabled\);/);
  assert.match(app, /if \(nextAuthEnabled && authUsersMissingPassword\(effectiveAuthUsers, passwordDrafts\)\)/);
  assert.match(app, /setMessage\(AUTH_PASSWORD_REQUIRED_MESSAGE, true\);/);
  assert.doesNotMatch(app, /const nextAllowMetadataEditing = nextAuthEnabled && authUsersCanEditMetadata\(effectiveAuthUsers\);/);
  assert.match(app, /function errorMessage\(error: unknown\)/);
  assert.match(app, /setMessage\(errorMessage\(error\), true\);/);
  assert.doesNotMatch(app, /setMessage\(error instanceof Error \? error\.message : String\(error\), true\);/);
  assert.match(app, /function updateAuthUsers\(nextUsers: AuthUser\[\]\)/);
  assert.doesNotMatch(app, /allowMetadataEditing: authEnabled && authUsersCanEditMetadata\(nextUsers\)/);
  assert.match(app, /function saveAuthUser\(index: number, patch: AuthUser\)/);
  assert.match(app, /saveAuthUser\(index, \{ role: event\.currentTarget\.value as UserRole \}\);/);
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
  assert.match(app, /userPasswords\[String\(index\)\]/);
  assert.match(app, /removeIndexedValue\(userPasswords, index\)/);
  assert.match(app, /passwordDrafts = userPasswords/);
  assert.match(app, /const effectiveAuthUsers = Array\.isArray\(patch\.authUsers\)/);
  assert.match(app, /passwordDrafts: nextUserPasswords/);
  assert.doesNotMatch(app, /userPasswords\[String\(user\.username/);
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

test("settings stay expanded and endpoint opens externally", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readPluginAppSource();

  assert.match(app, /<form/);
  assert.match(app, /openEndpointUrl/);
  assert.match(app, /eagle\?\.shell\?\.openExternal/);
  assert.doesNotMatch(html, /settingsToggleButton/);
  assert.doesNotMatch(app, /toggleSettings/);
  assert.doesNotMatch(app, /setMessage\("Updated"\)/);
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
  assert.doesNotMatch(runtime, /expire|expires|expiry|expiration|ttl/i);
  assert.doesNotMatch(runtimeSource, /expire|expires|expiry|expiration|ttl/i);
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
    "runtime.cjs",
    "viewerServer.cjs",
    "eagleClient.cjs",
    "connection.cjs",
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
  const source = await readFile(new URL("viewerServer.cjs", generatedServiceUrl), "utf8");

  assert.match(source, /AUTH_USER_CACHE = Symbol\("authUser"\)/);
  assert.match(source, /hasOwnProperty\.call\(req, AUTH_USER_CACHE\)/);
  assert.match(source, /req\[AUTH_USER_CACHE\] = user/);
  assert.match(source, /function resolveAuthenticatedUser\(req, auth\)/);
  assert.match(source, /function rolePermissions\(role\)/);
  assert.match(source, /return rolePermissions\(user\?\.role\)\.writeMetadata;/);
  assert.match(source, /return rolePermissions\(user\?\.role\)\.manageLibrary;/);
  assert.match(source, /const roleAccess = rolePermissions\(user\?\.role\);/);
  assert.match(source, /\^Basic\\s\+\/i/);
  assert.match(source, /function authSessionCookie\(token, maxAge = AUTH_SESSION_MAX_AGE_SECONDS\)/);
  assert.match(source, /"Set-Cookie": authSessionCookie\(token\)/);
  assert.match(source, /"Set-Cookie": authSessionCookie\("", 0\)/);
  assert.match(source, /const auth = \{ authSessions, users: resolvedAuthUsers \};/);
  assert.match(source, /function authRequired\(\{ users = \[\] \}/);
  assert.doesNotMatch(source, /username === auth\.basicAuthUsername/);
  assert.doesNotMatch(source, /if \(!passwordHash\) return safeEqual/);
  assert.match(source, /function safeDecodeCookieValue\(value\)/);
  assert.match(source, /return decodeURIComponent\(value\);/);
  assert.match(source, /if \(req\.method !== "GET"\) \{/);
  assert.match(source, /function sendMethodNotAllowed\(res, methods\)/);
  assert.match(source, /"Allow": methods\.join\(", "\)/);
  assert.match(source, /sendMethodNotAllowed\(res, \["GET"\]\)/);
  assert.match(source, /if \(url\.pathname === "\/api\/items"\) \{\s*if \(req\.method !== "GET"\)/);
  assert.match(source, /if \(url\.pathname === "\/api\/tags"\) \{\s*if \(req\.method !== "GET"\)/);
  assert.match(source, /const metadataPatch = normalizeMetadataPatch\(body\);/);
  assert.match(source, /normalizeStringArray\(body\.tags, "tags"\)/);
  assert.doesNotMatch(source, /function normalizeMetadataValues/);
  assert.match(source, /permissions: permissionsForUser\(null, \{ authenticated: true \}\)/);
  assert.doesNotMatch(source, /const writeMetadata = Boolean\(user && canRoleEditMetadata\(user\.role\)\)/);
  assert.doesNotMatch(source, /const manageLibrary = user\?\.role === "admin"/);
});

test("plugin server serves text and markdown media as inline raw text", async () => {
  const source = await readFile(new URL("viewerServer.cjs", generatedServiceUrl), "utf8");

  assert.match(source, /"\.txt": "text\/plain; charset=utf-8"/);
  assert.match(source, /"\.md": "text\/plain; charset=utf-8"/);
  assert.match(source, /"Content-Disposition": contentDisposition\(contentType, itemData, filePath\)/);
  assert.match(source, /if \(contentType !== "application\/pdf"\)\s*return "inline";/);
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
