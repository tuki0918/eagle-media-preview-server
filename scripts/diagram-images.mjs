// Renders the documentation diagrams as dark-mode PNGs in docs/ using headless Chrome.
// Usage: node scripts/diagram-images.mjs [overview|architecture|standalone|personal|family|business|upload ...]
// With no arguments, render every diagram.
// Set CHROME_PATH when Chrome or Chromium is not installed in a standard location.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { toSvg } from "tui-mermaid-diagram";
import { renderDiagram, root, selectDiagrams } from "./diagrams.mjs";
import { findChrome } from "./find-chrome.mjs";

const BACKGROUND = "#0d1117";
const diagrams = selectDiagrams(process.argv.slice(2));
const chrome = findChrome();
const workDir = mkdtempSync(join(tmpdir(), "diagram-images-"));
try {
  for (const [name, output, source] of diagrams) {
    const { width, height, svg } = toSvg([renderDiagram(source)]);
    const page = join(workDir, `${name}.html`);
    const screenshot = join(workDir, `${name}.png`);
    writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; background: ${BACKGROUND}; }
svg { display: block; }
</style>${svg}`);
    execFileSync(chrome, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${join(workDir, "chrome-profile")}`,
      "--force-device-scale-factor=2",
      `--window-size=${width},${height}`,
      `--screenshot=${screenshot}`,
      pathToFileURL(page).href,
    ], { timeout: 45_000, stdio: "pipe" });
    copyFileSync(screenshot, join(root, output));
    console.log(`${output}  ${width * 2}x${height * 2}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
