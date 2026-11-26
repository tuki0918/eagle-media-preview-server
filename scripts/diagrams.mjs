// Shared by diagram.mjs (terminal) and diagram-images.mjs (PNG): the documentation diagrams and how to render them.
// Sources are Mermaid block-beta files drawn with tui-mermaid-diagram.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drawScene, layoutBlocks, layoutGraph, parseMermaid } from "tui-mermaid-diagram";

export const root = fileURLToPath(new URL("..", import.meta.url));

// [name, PNG path, Mermaid source]
export const DIAGRAMS = [
  ["overview", "docs/architecture_overview.png", "docs/diagrams/overview.mmd"],
  ["architecture", "docs/architecture.png", "docs/diagrams/architecture.mmd"],
  ["standalone", "docs/architecture_standalone.png", "docs/diagrams/standalone.mmd"],
  ["personal", "docs/use_case_personal.png", "docs/use-cases/personal.mmd"],
  ["family", "docs/use_case_family.png", "docs/use-cases/family.mmd"],
  ["business", "docs/use_case_business.png", "docs/use-cases/business.mmd"],
  ["upload", "docs/use_case_upload.png", "docs/use-cases/upload.mmd"],
];

// Picks the diagrams named on the command line, or all of them.
export function selectDiagrams(names) {
  const unknown = names.filter((name) => !DIAGRAMS.some(([known]) => known === name));
  if (unknown.length) throw new Error(`Unknown diagram: ${unknown.join(", ")}. Choose from: ${DIAGRAMS.map(([name]) => name).join(", ")}`);
  return DIAGRAMS.filter(([name]) => !names.length || names.includes(name));
}

// A box title written as "YOU (Admin) ── PC" puts "PC" on the right end of the box's top border.
const RIGHT_LABEL = /\s*──\s*/;

// Mermaid source file → tui-mermaid-diagram canvas (pass it to toAnsi or toSvg).
export function renderDiagram(sourcePath) {
  const graph = parseMermaid(readFileSync(join(root, sourcePath), "utf8"));
  if (graph.warnings.length) throw new Error(`${sourcePath}: ${graph.warnings.join("\n")}`);
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
  // `**text**` in accDescr is drawn in white among the gray description lines.
  const emphasis = graph.footer.map((line) => {
    const spans = [];
    const plain = line.replace(/\*\*(.+?)\*\*/g, (_, text, offset) => {
      const before = line.slice(0, offset).replace(/\*\*/g, "");
      spans.push({ x: [...before].length, text });
      return text;
    });
    return { plain, spans };
  });
  const footer = emphasis.map(({ plain }) => plain);
  const scene = graph.type === "block" ? layoutBlocks(graph) : layoutGraph(graph);
  const canvas = drawScene(scene, { title: graph.title, footer });
  const footerTop = canvas.cells.length - footer.length;
  emphasis.forEach(({ spans }, i) => spans.forEach(({ x, text }) => canvas.put(x, footerTop + i, text, "white")));
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
