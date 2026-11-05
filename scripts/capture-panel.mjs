// Shared by the panel screenshot scripts: bundles a page that renders real panel components with
// sample data, then captures it with headless Chrome using the built CSS.
// Set CHROME_PATH when Chrome or Chromium is not installed in a standard location.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { findChrome } from "./find-chrome.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// README images show at their natural size, so these stay at 1x to keep the page width.
const WIDTH = 592;
// Room around the panel for its rounded corners and shadow; the rest of the image is transparent.
const MARGIN = 8;

/** Each image is [the page's ?tab= value, the output path relative to the repository]. */
export async function capturePanel(entry, images) {
  const stylesheet = join(root, "dist/plugin/styles.css");
  if (!existsSync(stylesheet)) throw new Error("dist/plugin/styles.css is missing. Run npm run build first.");

  const chrome = findChrome();
  const workDir = mkdtempSync(join(tmpdir(), "panel-screenshots-"));
  try {
    await build({
      bundle: true,
      define: { "process.env.NODE_ENV": '"production"' },
      entryPoints: [join(root, entry)],
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
    for (const [tab, output] of images) {
      const url = `${pathToFileURL(page)}?tab=${tab}`;
      // The panel's height differs per tab, so read it from a first load and capture on a second.
      const dom = execFileSync(chrome, [...chromeArgs, `--window-size=${WIDTH},800`, "--virtual-time-budget=5000", "--dump-dom", url], { stdio: ["ignore", "pipe", "ignore"] }).toString();
      const panelHeight = Number(dom.match(/data-capture-height="(\d+)"/)?.[1]);
      if (!panelHeight) throw new Error(`The ${tab} tab did not render.`);
      const height = panelHeight + MARGIN * 2;
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
}
