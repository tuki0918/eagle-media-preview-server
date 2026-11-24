#!/usr/bin/env node
// Serves an Eagle library to the viewer without Eagle. Build first: npm run build
const { spawn } = require("node:child_process");
const { join } = require("path");

let runStandalone;
try {
  ({ runStandalone } = require(join(__dirname, "..", "dist", ".generated", "plugin-service", "standalone.cjs")));
} catch {
  console.error("The server isn't built yet. Run `npm run build` first.");
  process.exit(1);
}

runStandalone(process.argv.slice(2)).then((running) => {
  if (!running) return;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    running.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  if (running.panelUrl) {
    const opener = { darwin: "open", linux: "xdg-open", win32: "explorer.exe" }[process.platform];
    if (opener) {
      const child = spawn(opener, [running.panelUrl], { stdio: "ignore", windowsHide: true });
      child.on("error", () => {});
      child.unref();
    }
  }
}, (error) => {
  console.error(`eagle-media-server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
