// The page scripts/activity-screenshots.mjs captures: the real Activity panel with sample data.
// Only for those screenshots; it never ships with the plugin.
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { AccessLogPanel } from "../plugin/components/AccessLogPanel";
import type { AccessLogBucket, AccessLogEntry, AccessLogSummary, BlockedAddress } from "../plugin/types";

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const currentHour = Math.floor(now / HOUR) * HOUR;

// Quiet overnight hours and a busy evening, the same picture on every run.
const VIEWS_BY_HOUR = [2, 0, 0, 0, 0, 0, 1, 3, 6, 9, 7, 5, 8, 11, 9, 6, 4, 8, 14, 22, 28, 24, 16, 6];
const buckets: AccessLogBucket[] = VIEWS_BY_HOUR.map((view, index) => {
  const start = currentHour - (VIEWS_BY_HOUR.length - 1 - index) * HOUR;
  return {
    // Sign-ins include the failed ones, as in the real log.
    auth: index === 17 ? 2 : index % 7 === 2 ? 1 : 0,
    authFailures: index === 17 ? 2 : 0,
    browse: 0,
    edit: index % 5 === 3 ? 2 : 0,
    end: start + HOUR,
    start,
    view,
    viewFailures: index === 20 ? 3 : 0,
  };
});
const sum = (key: "auth" | "authFailures" | "edit" | "view") => buckets.reduce((total, bucket) => total + bucket[key], 0);

const recent: AccessLogEntry[] = [
  { at: now - 8 * 1000, event: "view", ext: "mp4", ip: "192.168.1.24", itemId: "M8K2Q9ZP4A1BC", size: 48234567, status: 200, type: "view", user: "alice" },
  { at: now - 3 * 60 * 1000, event: "star", fields: ["rating"], ip: "192.168.1.31", itemId: "M8K2Q9ZP7D3EF", status: 200, type: "edit", user: "bob" },
  { at: now - 14 * 60 * 1000, event: "login_success", ip: "192.168.1.31", status: 200, type: "auth", user: "bob" },
  { at: now - 40 * 60 * 1000, event: "login_failure", ip: "192.168.1.77", status: 401, type: "auth", user: "admin" },
  { at: now - 42 * 60 * 1000, event: "library_open", ip: "this computer", type: "system" },
  { at: now - 42 * 60 * 1000 - 1000, event: "server_start", ip: "this computer", type: "system" },
];

const summary: AccessLogSummary = {
  activeClients: 2,
  buckets,
  clientCount: 3,
  clients: [
    { active: true, authFailures: 0, edits: 0, ip: "192.168.1.24", lastSeen: now - 8 * 1000, user: "alice", views: sum("view") - 41 },
    { active: true, authFailures: 0, edits: sum("edit"), ip: "192.168.1.31", lastSeen: now - 3 * 60 * 1000, user: "bob", views: 41 },
    { active: false, authFailures: sum("authFailures"), edits: 0, ip: "192.168.1.77", lastSeen: now - 40 * 60 * 1000, user: "", views: 0 },
  ],
  range: "24h",
  recent,
  totals: { auth: sum("auth"), authFailures: sum("authFailures"), browse: 0, edit: sum("edit"), view: sum("view") },
};
const blockedAddresses: BlockedAddress[] = [{ addedAt: now - 30 * 60 * 1000, address: "192.168.1.77" }];

const noop = () => {};
const rootElement = document.getElementById("root")!;

// flushSync so the tab button below exists as soon as this returns.
flushSync(() => {
  createRoot(rootElement).render(
    <AccessLogPanel
      activeClients={summary.activeClients}
      autoRefresh={false}
      blockedAddresses={blockedAddresses}
      eventFilter=""
      expanded
      range="24h"
      summary={summary}
      onAutoRefreshChange={noop}
      onBlock={async () => false}
      onClear={noop}
      onEventFilterChange={noop}
      onExport={noop}
      onExpandedChange={noop}
      onRangeChange={noop}
      onRefresh={noop}
      onRevealFile={noop}
      onSelectItem={noop}
      onUnblock={noop}
    />,
  );
});
// The panel keeps its tab in its own state, so the page picks it the way a person would.
if (new URLSearchParams(location.search).get("tab") === "blocked") {
  document.getElementById("activityBlockedTab")?.click();
}

// The capture script reads this to size the window to the panel.
void document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    document.documentElement.dataset.captureHeight = String(Math.ceil(rootElement.getBoundingClientRect().height));
  });
});
