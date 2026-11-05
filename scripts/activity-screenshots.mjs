// Captures the Activity tabs for the README. `npm run screenshot:activity` builds first, so the CSS matches the panel.
import { capturePanel } from "./capture-panel.mjs";

await capturePanel("scripts/activity-screenshots.entry.tsx", [
  ["overview", "docs/server_panel_activity.png"],
  ["blocked", "docs/server_panel_activity_blocked.png"],
]);
