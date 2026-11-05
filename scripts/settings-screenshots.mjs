// Captures the Settings tabs for the README. `npm run screenshot:settings` builds first, so the CSS matches the form.
import { capturePanel } from "./capture-panel.mjs";

await capturePanel("scripts/settings-screenshots.entry.tsx", [
  ["general", "docs/server_panel_general.png"],
  ["access", "docs/server_panel_access.png"],
  ["libraries", "docs/server_panel_libraries.png"],
  ["security", "docs/server_panel_security.png"],
]);
