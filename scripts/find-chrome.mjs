import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export function findChrome() {
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
