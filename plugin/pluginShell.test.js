import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

test("plugin window includes management controls instead of the external viewer", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  for (const id of [
    "serverPowerInput",
    "closeWindowButton",
    "copyUrlButton",
    "qrCode",
    "settingsForm",
    "windowIcon",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="windowIcon" class="brand-icon" src="\.\/assets\/icon_off\.svg"/);
  assert.doesNotMatch(html, /id="statusIcon"/);
  assert.match(app, /icon_on\.svg/);
  assert.match(app, /icon_off\.svg/);
  assert.doesNotMatch(html, /id="requestLogBody"/);
  assert.doesNotMatch(html, /id="requestLogEnabledInput"/);
  assert.doesNotMatch(html, /id="grid"/);
});

test("settings stay expanded and endpoint opens externally", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(html, /id="settingsForm" class="settings-panel"/);
  assert.doesNotMatch(html, /settingsToggleButton/);
  assert.doesNotMatch(html, /settings-icon/);
  assert.match(app, /eagle\.shell\.openExternal/);
  assert.doesNotMatch(app, /toggleSettings/);
  assert.doesNotMatch(app, /setMessage\("Updated"\)/);
});

test("plugin copy URL uses Eagle clipboard API directly", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /async function copyAccessUrl\(\)/);
  assert.match(app, /eagle\.clipboard\.writeText/);
  assert.match(app, /if \(!globalThis\.eagle\?\.clipboard\?\.writeText\)/);
  assert.match(app, /await eagle\.clipboard\.writeText\(value\);/);
  assert.match(app, /Clipboard API is unavailable in this Eagle window/);
  assert.doesNotMatch(app, /eagle\.clipboard\.readText/);
  assert.doesNotMatch(app, /navigator\.clipboard\?\.writeText/);
  assert.doesNotMatch(app, /document\.execCommand\("copy"\)/);
  assert.doesNotMatch(app, /function copyTextFallback\(value\)/);
});

test("plugin window does not expose an unused shared URL expiration setting", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("./service/runtime.cjs", import.meta.url), "utf8");
  const settingsStore = await readFile(new URL("./service/settingsStore.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /共有URL/);
  assert.doesNotMatch(html, /有効期限/);
  assert.doesNotMatch(html, /expire|expires|expiry|expiration|ttl/i);
  assert.doesNotMatch(app, /expire|expires|expiry|expiration|ttl/i);
  assert.doesNotMatch(runtime, /expire|expires|expiry|expiration|ttl/i);
  assert.doesNotMatch(settingsStore, /expire|expires|expiry|expiration|ttl/i);
});

test("plugin window loads a classic script for Eagle Node API compatibility", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");

  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
});

test("plugin window no longer renders diagnostics UI", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

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
    const source = await readFile(new URL(`./service/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /require\("node:/, file);
  }
});

test("plugin server serves text and markdown media as inline raw text", async () => {
  const source = await readFile(new URL("./service/viewerServer.cjs", import.meta.url), "utf8");

  assert.match(source, /"\.txt": "text\/plain; charset=utf-8"/);
  assert.match(source, /"\.md": "text\/plain; charset=utf-8"/);
  assert.match(source, /"Content-Disposition": contentDisposition\(contentType, itemData, filePath\)/);
  assert.match(source, /if \(contentType !== "application\/pdf"\) return "inline";/);
});

test("plugin app resolves CommonJS runtime from the plugin file location", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /document\.currentScript\?\.src/);
  assert.match(app, /require\(runtimePath\)/);
});

test("plugin app animates the stopped status text while a restart is busy", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /const busyStoppedFrames = Object\.freeze\(\["\.", "\.\.", "\.\.\.", "\.\.\.\.", "\.\.\.\.\."\]\);/);
  assert.match(app, /function startBusyStoppedAnimation\(\)/);
  assert.match(app, /function stopBusyStoppedAnimation\(\)/);
  assert.match(app, /setInterval\(/);
  assert.match(app, /busyStoppedFrames\[busyStoppedFrameIndex\]/);
  assert.doesNotMatch(app, /Stopped\.\.\./);
});

test("plugin app resolves Windows drive paths without a leading slash", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const functionSource = app.match(/function pluginRequirePath\(relativePath\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);

  const pluginRequirePath = Function("require", "document", "location", `${functionSource}; return pluginRequirePath;`)(
    (name) => {
      if (name === "path") return path.win32;
      throw new Error(`Unexpected require: ${name}`);
    },
    { currentScript: null },
    { href: "eagle://plugin/index.html", pathname: "/E:/github.com/xxx/eagle-media-preview-server/plugin/index.html" },
  );

  assert.equal(
    pluginRequirePath("service/runtime.cjs"),
    "E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\service\\runtime.cjs",
  );
});

test("plugin app resolves Windows drive paths when Eagle exposes backslashes", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const functionSource = app.match(/function pluginRequirePath\(relativePath\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);

  const pluginRequirePath = Function("require", "document", "location", `${functionSource}; return pluginRequirePath;`)(
    (name) => {
      if (name === "path") return path.win32;
      throw new Error(`Unexpected require: ${name}`);
    },
    { currentScript: null },
    { href: "eagle://plugin/index.html", pathname: "\\E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\index.html" },
  );

  assert.equal(
    pluginRequirePath("service/runtime.cjs"),
    "E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\service\\runtime.cjs",
  );
});

test("plugin app resolves Windows drive paths with repeated leading separators", async () => {
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const functionSource = app.match(/function pluginRequirePath\(relativePath\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionSource);

  for (const pathname of [
    "//E:/github.com/xxx/eagle-media-preview-server/plugin/index.html",
    "\\\\E:\\github.com\\xxx\\eagle-media-preview-server\\plugin\\index.html",
  ]) {
    const pluginRequirePath = Function("require", "document", "location", `${functionSource}; return pluginRequirePath;`)(
      (name) => {
        if (name === "path") return path.win32;
        throw new Error(`Unexpected require: ${name}`);
      },
      { currentScript: null },
      { href: "eagle://plugin/index.html", pathname },
    );

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
  const app = await readFile(new URL("./app.js", import.meta.url), "utf8");

  assert.match(app, /qrcode-generator\.cjs/);
  assert.doesNotMatch(app, /function createQrMatrix/);
  assert.doesNotMatch(app, /function reedSolomon/);
});

test("interactive controls declare appropriate cursor styles", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  assert.match(css, /\.titlebar\s*\{[^}]*height:\s*46px;/s);
  assert.match(css, /\.brand-icon\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  assert.match(css, /button,\s*\.power-switch,\s*\.option-row\s*\{[^}]*cursor: pointer;/s);
  assert.match(css, /\.endpoint-input\s*\{[^}]*cursor: pointer;/s);
  assert.match(css, /input:not\(\[readonly\]\),\s*textarea\s*\{[^}]*cursor: text;/s);
  assert.match(css, /button:disabled,\s*input:disabled,\s*select:disabled\s*\{[^}]*cursor: not-allowed;/s);
});
