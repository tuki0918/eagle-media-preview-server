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
  assert.match(app, /Active editors/);
  assert.match(app, /Active viewers/);
  assert.match(app, /Saved users apply when BasicAuth protection is enabled\./);
  assert.doesNotMatch(app, /title="Editor roles"/);
  assert.doesNotMatch(app, /function EditIcon\(/);
  assert.doesNotMatch(app, /const \[password, setPassword\]/);
  assert.match(app, /if \(saved && hasUserPasswords\) setUserPasswords\(\{\}\);/);
  assert.match(app, /if \(saved\) setMessage\(""\);/);
  assert.match(app, /if \(hasUserPasswords\) setUserPasswords\(\{\}\);/);
  assert.match(app, /if \(!hasUserPasswords && !settingsPayloadChanged\(settings, payload\)\)/);
  assert.match(app, /function settingsPayloadChanged\(current: PluginSettings \| undefined, nextSettings: Record<string, unknown>\)/);
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
