// Prints the documentation diagrams in the terminal, drawn from their Mermaid sources with tui-mermaid-diagram.
// Usage: node scripts/diagram.mjs [overview|architecture|standalone|personal|family|business|upload ...]   (no argument prints all)
// Output is colored on a TTY or with FORCE_COLOR, and plain text with NO_COLOR=1 or when piped.
import { toAnsi } from "tui-mermaid-diagram";
import { renderDiagram, selectDiagrams } from "./diagrams.mjs";

const color = process.env.NO_COLOR === undefined && Boolean(process.stdout.isTTY || process.env.FORCE_COLOR);
const output = selectDiagrams(process.argv.slice(2)).map(([, , source]) => toAnsi(renderDiagram(source), color));
console.log(`\n${output.join("\n\n\n")}\n`);
