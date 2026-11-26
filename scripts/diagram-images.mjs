// Renders architecture and Mermaid diagrams as dark-mode PNGs for docs/ using headless Chrome.
// Usage: node scripts/diagram-images.mjs [overview|architecture|standalone|personal|family|business|upload ...]
// With no arguments, render every diagram.
// Set CHROME_PATH when Chrome or Chromium is not installed in a standard location.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChrome } from "./find-chrome.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const IMAGES = [
  ["overview", "docs/architecture_overview.png"],
  ["architecture", "docs/architecture.png"],
  ["standalone", "docs/architecture_standalone.png"],
  ["personal", "docs/use_case_personal.png", "docs/use-cases/personal.mmd"],
  ["family", "docs/use_case_family.png", "docs/use-cases/family.mmd"],
  ["business", "docs/use_case_business.png", "docs/use-cases/business.mmd"],
  ["upload", "docs/use_case_upload.png", "docs/use-cases/upload.mmd"],
];
const requested = process.argv.slice(2);
const unknown = requested.filter((view) => !IMAGES.some(([name]) => name === view));
if (unknown.length) throw new Error(`Unknown diagram: ${unknown.join(", ")}`);

// Cell metrics for 14px Menlo; the page is sized from them so the screenshot fits the diagram exactly.
const CHAR_WIDTH = 8.43;
const LINE_HEIGHT = 17;
const PAD_X = 28;
const PAD_Y = 24;
const BACKGROUND = "#0d1117";

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

// A box title written as "YOU (Admin) ── PC" puts "PC" on the right end of the box's top border.
const RIGHT_LABEL = /\s*──\s*/;

async function renderMermaidImage(source) {
  const { drawScene, layoutBlocks, layoutGraph, parseMermaid } = await import("tui-mermaid-diagram");
  const graph = parseMermaid(source);
  if (graph.warnings.length) throw new Error(graph.warnings.join("\n"));
  const rightLabels = new Map();
  for (const node of graph.nodes.values()) {
    // The layout makes the first of several label lines the box title.
    if (!(node.lines?.length > 1)) continue;
    const [left, right] = node.lines[0].split(RIGHT_LABEL);
    if (!right) continue;
    rightLabels.set(node, { left, right });
    // Reserve room for both labels and the border between them.
    node.lines[0] = `${left}${" ".repeat(4)}${right}`;
  }
  const scene = graph.type === "block" ? layoutBlocks(graph) : layoutGraph(graph);
  const canvas = drawScene(scene, { title: graph.title, footer: graph.footer });
  for (const { node, x, y, w } of scene.boxes) {
    const labels = rightLabels.get(node);
    if (!labels) continue;
    const [corner, line] = [canvas.cells[y][x], canvas.cells[y][x + 1]];
    canvas.put(x + 1, y, line.ch.repeat(w - 2), corner.color);
    canvas.put(x + 2, y, ` ${labels.left} `, corner.color, true);
    canvas.put(x + w - labels.right.length - 4, y, ` ${labels.right} `, corner.color, true);
  }
  return canvas;
}

async function renderImage(view, source, env) {
  if (source) {
    const { toSvg } = await import("tui-mermaid-diagram");
    let canvas;
    try {
      canvas = await renderMermaidImage(readFileSync(join(root, source), "utf8"));
    } catch (error) {
      throw new Error(`${source}: ${error.message}`);
    }
    const { width, height, svg } = toSvg([canvas]);
    const html = `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; background: ${BACKGROUND}; }
svg { display: block; }
</style>${svg}`;
    return { width, height, html };
  }
  const ansi = execFileSync(process.execPath, [join(root, "scripts/diagram.mjs"), view], { env }).toString();
  return toHtml(ansi);
}

const chrome = findChrome();
const { NO_COLOR, ...inheritedEnv } = process.env;
const colorEnv = { ...inheritedEnv, FORCE_COLOR: "1" };
const workDir = mkdtempSync(join(tmpdir(), "diagram-images-"));
try {
  for (const [view, output, source] of IMAGES.filter(([name]) => !requested.length || requested.includes(name))) {
    const { width, height, html } = await renderImage(view, source, colorEnv);
    const page = join(workDir, `${view}.html`);
    const screenshot = join(workDir, `${view}.png`);
    writeFileSync(page, html);
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
