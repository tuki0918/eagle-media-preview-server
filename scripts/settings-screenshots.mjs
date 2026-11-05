// Captures the Settings tabs for the README from the real form and the built CSS, using headless Chrome.
// `npm run screenshot:settings` builds first, so the CSS matches the form.
// Set CHROME_PATH when Chrome or Chromium is not installed in a standard location.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { findChrome } from "./find-chrome.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const IMAGES = [
  ["general", "docs/server_panel_general.png"],
  ["access", "docs/server_panel_access.png"],
  ["libraries", "docs/server_panel_libraries.png"],
  ["security", "docs/server_panel_security.png"],
];
// README images show at their natural size, so these stay at 1x to keep the page width.
const WIDTH = 592;
// Room around the form for its rounded corners and shadow; the rest of the image is transparent.
const MARGIN = 8;

const stylesheet = join(root, "dist/plugin/styles.css");
if (!existsSync(stylesheet)) throw new Error("dist/plugin/styles.css is missing. Run npm run build first.");

const chrome = findChrome();
const workDir = mkdtempSync(join(tmpdir(), "settings-screenshots-"));
try {
  await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"' },
    entryPoints: [join(root, "scripts/settings-screenshots.entry.tsx")],
    jsx: "automatic",
    logLevel: "warning",
    outfile: join(workDir, "app.js"),
  });
  const page = join(workDir, "index.html");
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(stylesheet)}">
<style>html, body { background: transparent; margin: 0; } #root { width: ${WIDTH - MARGIN * 2}px; margin: ${MARGIN}px; }</style>
<div id="root"></div><script src="app.js"></script>`);

  const chromeArgs = ["--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"];
  for (const [tab, output] of IMAGES) {
    const url = `${pathToFileURL(page)}?tab=${tab}`;
    // The form's height differs per tab, so read it from a first load and capture on a second.
    const dom = execFileSync(chrome, [...chromeArgs, `--window-size=${WIDTH},800`, "--virtual-time-budget=5000", "--dump-dom", url], { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const formHeight = Number(dom.match(/data-capture-height="(\d+)"/)?.[1]);
    if (!formHeight) throw new Error(`The ${tab} tab did not render.`);
    const height = formHeight + MARGIN * 2;
    execFileSync(chrome, [
      ...chromeArgs,
      "--default-background-color=00000000",
      `--window-size=${WIDTH},${height}`,
      "--virtual-time-budget=5000",
      `--screenshot=${join(root, output)}`,
      url,
    ], { stdio: "ignore" });
    console.log(`${output}  ${WIDTH}x${height}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
