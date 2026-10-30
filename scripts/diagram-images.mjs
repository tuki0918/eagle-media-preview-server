// Captures the colored `npm run diagram` output as dark-mode PNGs for docs/ using headless Chrome.
// Set CHROME_PATH when Chrome or Chromium is not installed in a standard location.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const IMAGES = [
  ["overview", "docs/architecture_overview.png"],
  ["architecture", "docs/architecture.png"],
];

// Cell metrics for 14px Menlo; the page is sized from them so the screenshot fits the diagram exactly.
const CHAR_WIDTH = 8.43;
const LINE_HEIGHT = 17;
const PAD_X = 28;
const PAD_Y = 24;
const BACKGROUND = "#0d1117";

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [name]).toString().trim();
    } catch {
      // Try the next name.
    }
  }
  throw new Error("Chrome or Chromium was not found. Set CHROME_PATH to its executable.");
}

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Menlo lacks these glyphs; pinning them to one cell keeps the fallback font from shifting the columns.
const cells = (text) => [...text].map((ch) => (/[✓✕▣]/.test(ch) ? `<span class="cell">${ch}</span>` : escapeHtml(ch))).join("");

function toHtml(ansi) {
  const lines = ansi.replace(/^\n+|\n+$/g, "").split("\n");
  const body = lines.map((line) => {
    const pattern = /\x1b\[(1;)?38;2;(\d+);(\d+);(\d+)m(.*?)\x1b\[0m/g;
    let html = "";
    let last = 0;
    for (const match of line.matchAll(pattern)) {
      const [, bold, r, g, b, text] = match;
      html += cells(line.slice(last, match.index));
      html += `<span style="color:rgb(${r},${g},${b})${bold ? ";font-weight:700" : ""}">${cells(text)}</span>`;
      last = match.index + match[0].length;
    }
    return html + cells(line.slice(last));
  }).join("\n");
  const columns = Math.max(...lines.map((line) => [...line.replace(/\x1b\[[0-9;]*m/g, "")].length));
  return {
    width: Math.ceil(columns * CHAR_WIDTH + PAD_X * 2),
    height: Math.ceil(lines.length * LINE_HEIGHT + PAD_Y * 2),
    html: `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; background: ${BACKGROUND}; }
pre { margin: 0; padding: ${PAD_Y}px ${PAD_X}px; font: 14px/${LINE_HEIGHT}px Menlo, monospace; color: #e6e9f0; }
.cell { display: inline-block; width: 1ch; text-align: center; }
</style><pre>${body}</pre>`,
  };
}

const chrome = findChrome();
const { NO_COLOR, ...inheritedEnv } = process.env;
const colorEnv = { ...inheritedEnv, FORCE_COLOR: "1" };
const workDir = mkdtempSync(join(tmpdir(), "diagram-images-"));
try {
  for (const [view, output] of IMAGES) {
    const ansi = execFileSync(process.execPath, [join(root, "scripts/diagram.mjs"), view], { env: colorEnv }).toString();
    const { width, height, html } = toHtml(ansi);
    const page = join(workDir, `${view}.html`);
    writeFileSync(page, html);
    execFileSync(chrome, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${width},${height}`,
      `--screenshot=${join(root, output)}`,
      `file://${page}`,
    ], { stdio: "ignore" });
    console.log(`${output}  ${width * 2}x${height * 2}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
