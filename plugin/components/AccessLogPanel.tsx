import { Fragment, useState, type ReactNode } from "react";
import { HighlightedText } from "../../src/viewer/components/HighlightedText";
import { formatBytes } from "../../src/viewer/format";
import type { AccessLogBucket, AccessLogClient, AccessLogEntry, AccessLogEventFilter, AccessLogFilter, AccessLogRange, AccessLogSearchKeys, AccessLogSummary, BlockedAddress } from "../types";
import { ActivityIcon, BanIcon, ChevronIcon, CloseIcon, DownloadIcon, FolderOpenIcon, SelectItemIcon, RefreshIcon, TrashIcon } from "./Icons";

interface AccessLogPanelProps {
  /** Live count, refreshed every few seconds even while the details are not reloaded. */
  activeClients: number;
  autoRefresh: boolean;
  blockedAddresses: BlockedAddress[];
  eventFilter: AccessLogEventFilter;
  /** Chips in the search box: Recent events shows only entries with these exact values. */
  filters: AccessLogFilter[];
  expanded: boolean;
  loading?: boolean;
  /** Result of the last Activity action (export, block, select); errors stay until the next one. */
  notice?: { isError: boolean; text: string } | null;
  range: AccessLogRange;
  /** Text in the Recent events search box. */
  search: string;
  /** The search the listed events were loaded for, so the marks never run ahead of the results. */
  searchedText?: string;
  summary: AccessLogSummary | null;
  onFiltersChange: (filters: AccessLogFilter[]) => void;
  onAutoRefreshChange: (checked: boolean) => void;
  /** Resolves true once the address is blocked (the admin may cancel the confirmation). */
  onBlock: (address: string) => Promise<boolean>;
  onClear: () => void;
  onEventFilterChange: (filter: AccessLogEventFilter) => void;
  onExport: () => void;
  onExpandedChange: (updater: (current: boolean) => boolean) => void;
  onRangeChange: (range: AccessLogRange) => void;
  onRefresh: () => void;
  onSearchChange: (search: string) => void;
  /** Reveals the log file in Finder/Explorer; omitted when Eagle has no shell API for it. */
  onRevealFile?: () => void;
  /** Selects the item in Eagle's main window; omitted when Eagle has no item selection API. */
  onSelectItem?: (itemId: string) => void;
  onUnblock: (address: string) => void;
}

// Categorical slots 1–4 of the reference palette, in fixed order (validated as adjacent stack
// pairs): views, edits, sign-ins, failed requests. Server and settings events aren't device traffic,
// so they are left out of the chart.
const SERIES = [
  { key: "view", label: "Views", color: "#2a78d6" },
  { key: "edit", label: "Edits", color: "#eb6834" },
  { key: "auth", label: "Sign-ins", color: "#1baf7a" },
  { key: "failed", label: "Failed", color: "#eda100" },
] as const;

const RANGE_OPTIONS: Array<{ label: string; value: AccessLogRange }> = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
];

const EVENT_FILTERS: Array<{ label: string; value: AccessLogEventFilter }> = [
  { label: "All", value: "" },
  { label: "Views", value: "view" },
  { label: "Sign-ins", value: "auth" },
  { label: "Edits", value: "edit" },
  { label: "Server", value: "system" },
];

const EVENT_LABELS: Record<string, string> = {
  address_blocked: "Blocked address",
  address_unblocked: "Unblocked address",
  blocked: "Blocked",
  connect: "Connect failed",
  library_denied: "Library access denied",
  login_failure: "Sign-in failed",
  login_locked: "Sign-in locked",
  login_success: "Signed in",
  library_changed: "Switched library",
  library_open: "Library open",
  log_cleared: "Cleared log",
  logout: "Signed out",
  metadata: "Edited metadata",
  restore: "Restored from trash",
  server_start: "Server started",
  server_start_failed: "Server failed to start",
  server_stop: "Server stopped",
  settings_changed: "Changed settings",
  star: "Changed rating",
  trash: "Moved to trash",
  url_preview: "Opened URL",
  view: "Viewed",
  view_failed: "View failed",
};

const FAILED_EVENTS = new Set(["blocked", "library_denied", "login_failure", "login_locked", "server_start_failed"]);

// Saved setting names as the panel calls them; other logged fields (tags, folders, rating) read as they are.
const FIELD_LABELS: Record<string, string> = {
  authEnabled: "password protection",
  authUsers: "users",
  autoStart: "auto start",
  customDomain: "hostname",
  host: "public network",
  httpsCertPath: "TLS cert",
  httpsEnabled: "HTTPS",
  httpsKeyPath: "TLS key",
  libraryProtectionEnabled: "library protection",
  sessionDurationDays: "session duration",
  sharedLibraries: "shared libraries",
  trustForwardedFor: "X-Forwarded-For",
};
// The log holds keys like login_failure, but people search for what the panel shows.
export function accessLogSearchKeys(search: string): AccessLogSearchKeys {
  const term = search.trim().toLowerCase();
  const matching = (labels: Record<string, string>) => term ? Object.keys(labels).filter((key) => labels[key].toLowerCase().includes(term)) : [];
  return { events: matching(EVENT_LABELS), fields: matching(FIELD_LABELS) };
}

function filterLabel({ field, value }: AccessLogFilter) {
  if (field === "user") return `User: ${value}`;
  return field === "event" ? `Event: ${EVENT_LABELS[value] || value}` : value;
}

// How many recent events the panel lists; the app asks the manager for exactly this many.
export const RECENT_EVENT_LIMIT = 100;

export function AccessLogPanel({
  activeClients,
  autoRefresh,
  blockedAddresses,
  eventFilter,
  filters,
  expanded,
  loading = false,
  notice = null,
  range,
  search,
  searchedText = "",
  summary,
  onFiltersChange,
  onAutoRefreshChange,
  onBlock,
  onClear,
  onEventFilterChange,
  onExport,
  onExpandedChange,
  onRangeChange,
  onRefresh,
  onSearchChange,
  onRevealFile,
  onSelectItem,
  onUnblock,
}: AccessLogPanelProps) {
  const recent = summary?.recent || [];
  const totals = summary?.totals;
  const [tab, setTab] = useState<"blocked" | "overview">("overview");
  const blocked = new Set(blockedAddresses.map((entry) => entry.address));
  const connectedLabel = `${activeClients.toLocaleString()} ${activeClients === 1 ? "device" : "devices"} connected`;
  return (
    <section className="rounded-2xl border border-[#e6e6e9] bg-white px-4 pb-3.5 pt-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <button
        className={`${expanded ? "mb-1" : ""} flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left`}
        type="button"
        aria-controls="activityPanel"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide activity" : "Show activity"}
        onClick={() => onExpandedChange((current) => !current)}
      >
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center text-[#5f6670] [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true"><ActivityIcon /></span>
          <span className="m-0 text-[15px] font-semibold leading-none text-[#171717]">Activity</span>
          <span
            className="shrink-0 rounded-full bg-[#f1f1f3] px-2 py-[3px] text-[11px] font-semibold leading-none text-[#737373] [font-variant-numeric:tabular-nums]"
            aria-label={connectedLabel}
            title={connectedLabel}
          >
            {activeClients.toLocaleString()}
          </span>
        </span>
        <ChevronIcon className={`h-[14px] w-[14px] text-[#555c66] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div id="activityPanel" className="mt-4 grid gap-3" hidden={!expanded}>
        <div className="grid grid-cols-2 rounded-full bg-[#f1f1f3] p-1" role="tablist" aria-label="Activity sections">
          <TabButton active={tab === "overview"} controls="activityOverviewPanel" id="activityOverviewTab" onClick={() => setTab("overview")}>Overview</TabButton>
          <TabButton active={tab === "blocked"} controls="activityBlockedPanel" id="activityBlockedTab" onClick={() => setTab("blocked")}>
            Blocked addresses
            {blockedAddresses.length ? <span className="ml-1.5 rounded-full bg-[#e6e6e9] px-1.5 py-px text-[10px] font-semibold tabular-nums text-[#737373]">{blockedAddresses.length}</span> : null}
          </TabButton>
        </div>

        {notice ? (
          <p className={`m-0 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${notice.isError ? "bg-[#fef2f2] text-[#b42318]" : "bg-[#ecfdf3] text-[#178c35]"}`} role={notice.isError ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}

        <div id="activityOverviewPanel" className="grid gap-3" role="tabpanel" aria-labelledby="activityOverviewTab" hidden={tab !== "overview"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-3 rounded-full bg-[#f1f1f3] p-1" role="group" aria-label="Time range">
              {RANGE_OPTIONS.map((option) => (
                <PillButton key={option.value} active={range === option.value} onClick={() => onRangeChange(option.value)}>{option.label}</PillButton>
              ))}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <label className="mr-1 inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] font-medium text-[#3a3f47]" title="Reload the details every 10 seconds">
                <SmallSwitch checked={autoRefresh} label="Auto refresh" onChange={onAutoRefreshChange} />
                Auto
              </label>
              <IconButton disabled={loading} label="Refresh" onClick={onRefresh}><RefreshIcon className={`h-[15px] w-[15px] ${loading ? "animate-spin" : ""}`} /></IconButton>
              <span className="mx-0.5 h-5 w-px bg-[#e6e6e9]" aria-hidden="true" />
              <IconButton label="Export log as CSV" onClick={onExport}><DownloadIcon className="h-[15px] w-[15px]" /></IconButton>
              {onRevealFile ? <IconButton label="Show log file" onClick={onRevealFile}><FolderOpenIcon className="h-[15px] w-[15px]" /></IconButton> : null}
              <IconButton label="Clear log" onClick={onClear}><TrashIcon className="h-[15px] w-[15px]" /></IconButton>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 max-[520px]:grid-cols-2">
            <StatTile label="Connected" value={activeClients} help="Devices seen in the last 2 minutes" />
            <StatTile label="Views" value={totals?.view ?? 0} />
            <StatTile label="Edits" value={totals?.edit ?? 0} />
            <StatTile label="Failed sign-ins" value={totals?.authFailures ?? 0} />
          </div>

          <ActivityChart buckets={summary?.buckets || []} range={range} />

          <div className="grid gap-1.5">
            <span className={fieldLabelClassName}>Devices</span>
            <ClientTable blocked={blocked} filters={filters} summary={summary} onBlock={onBlock} onFiltersChange={onFiltersChange} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={fieldLabelClassName}>Recent events</span>
              <div className="inline-flex rounded-full bg-[#f1f1f3] p-0.5" role="group" aria-label="Event type">
                {EVENT_FILTERS.map((option) => (
                  <PillButton key={option.value || "all"} small active={eventFilter === option.value} onClick={() => onEventFilterChange(option.value)}>{option.label}</PillButton>
                ))}
              </div>
            </div>
            <div className="relative flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-[#e6e6e9] bg-white py-[3px] pl-1 pr-8 focus-within:border-[#9aa2ae]">
              {filters.map((filter) => (
                <span key={`${filter.field}\u0000${filter.value}`} className="inline-flex h-6 min-w-0 max-w-full items-center gap-0.5 rounded-md bg-[#f1f1f3] pl-1.5 pr-0.5 text-[11.5px] font-medium tabular-nums text-[#171717]">
                  <span className="truncate">{filterLabel(filter)}</span>
                  <button
                    className="grid h-5 w-5 shrink-0 place-items-center rounded border-0 bg-transparent p-0 text-[#8a8f99] transition-colors hover:bg-[#e6e6e9] hover:text-[#171717]"
                    type="button"
                    aria-label={`Remove ${filterLabel(filter)} from the filter`}
                    title={`Remove ${filterLabel(filter)} from the filter`}
                    onClick={() => onFiltersChange(toggleFilter(filters, filter))}
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                className="h-6 min-w-[120px] flex-1 border-0 bg-transparent px-1.5 text-[12px] text-[#171717] outline-0 placeholder:text-[#9a9ea6]"
                type="text"
                aria-label="Search recent events"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                placeholder={filters.length ? "" : "Search events"}
                value={search}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
              />
              {search || filters.length ? (
                <button
                  className="absolute right-1 top-[3px] grid h-6 w-6 place-items-center rounded-md border-0 bg-transparent p-0 text-[#8a8f99] transition-colors hover:bg-[#f4f4f6] hover:text-[#171717]"
                  type="button"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => {
                    onSearchChange("");
                    onFiltersChange([]);
                  }}
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <EventTable emptyText={search.trim() || filters.length || eventFilter ? "No matching events." : "No events in the log."} entries={recent} filters={filters} searchedText={searchedText} onFiltersChange={onFiltersChange} onSelectItem={onSelectItem} />
          </div>

          <p className="m-0 text-[10.5px] leading-snug text-[#9a9ea6]">
            Kept in your computer's temporary folder for up to 7 days. Still available after the server stops, but may be cleared sooner.
          </p>
        </div>

        <div id="activityBlockedPanel" role="tabpanel" aria-labelledby="activityBlockedTab" hidden={tab !== "blocked"}>
          <BlockedAddressList blockedAddresses={blockedAddresses} onBlock={onBlock} onUnblock={onUnblock} />
        </div>
      </div>
    </section>
  );
}

function BlockedAddressList({ blockedAddresses, onBlock, onUnblock }: { blockedAddresses: BlockedAddress[]; onBlock: (address: string) => Promise<boolean>; onUnblock: (address: string) => void }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (!draft.trim()) return;
    void onBlock(draft).then((added) => {
      if (added) setDraft("");
    });
  };
  return (
    <div className="grid gap-2">
      <p className="m-0 text-[11px] leading-snug text-[#7a7f88]">Blocked addresses cannot open the viewer or sign in. Changes apply right away, also while the server is running. Accepts an address or a CIDR range.</p>
      {/* Not a <form>: the Settings card below owns the window's only form. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          className="h-8 min-w-0 rounded-lg border border-[#e6e6e9] bg-white px-2.5 text-[12px] text-[#171717] outline-0 placeholder:text-[#9a9ea6] focus:border-[#9aa2ae]"
          type="text"
          aria-label="Address to block"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder="192.168.1.50 or 192.168.1.0/24"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          }}
        />
        <button className="h-8 rounded-lg border border-[#e6e6e9] bg-white px-3 text-[11.5px] font-medium text-[#3a3f47] transition-colors hover:bg-[#f4f4f6] disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!draft.trim()} onClick={submit}>
          Block
        </button>
      </div>
      {blockedAddresses.length ? (
        <ul className="m-0 grid list-none overflow-hidden rounded-xl border border-[#e6e6e9] p-0" aria-label="Blocked addresses">
          {blockedAddresses.map((entry) => (
            <li key={entry.address} className="flex items-center justify-between gap-2 border-b border-[#f3f3f5] px-2.5 py-1.5 text-[11.5px] text-[#3a3f47] last:border-b-0">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <BanIcon className="h-3.5 w-3.5 shrink-0 text-[#b42318]" />
                <span className="truncate font-medium text-[#171717]">{entry.address}</span>
                {entry.addedAt ? <span className="text-[10.5px] text-[#9a9ea6]">since {formatDateTime(entry.addedAt)}</span> : null}
              </span>
              <button className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-[#8a8f99] transition-colors hover:bg-[#f1f1f3] hover:text-[#171717]" type="button" aria-label={`Unblock ${entry.address}`} title="Unblock" onClick={() => onUnblock(entry.address)}>
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>No addresses are blocked.</EmptyRow>
      )}
    </div>
  );
}

function ActivityChart({ buckets, range }: { buckets: AccessLogBucket[]; range: AccessLogRange }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const stacks = buckets.map((bucket) => ({ view: bucket.view, edit: bucket.edit, auth: bucket.auth, failed: (bucket.viewFailures ?? 0) + (bucket.editFailures ?? 0) + bucket.browse }));
  const max = niceMax(Math.max(0, ...stacks.map((stack) => stack.view + stack.edit + stack.auth + stack.failed)));
  const labelEvery = range === "24h" ? 6 : range === "1h" ? 3 : 1;
  const hoveredBucket = hovered === null ? null : buckets[hovered];
  return (
    <figure className="m-0 grid gap-2" aria-label="Activity over time">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-hidden="true">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5 text-[11px] text-[#52514e]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      <div className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-1.5">
        <div className="relative h-[120px] text-right text-[10px] tabular-nums text-[#8a8f99]">
          <span className="absolute right-0 top-0 -translate-y-1/2">{max}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{max / 2}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div className="relative h-[120px]" onMouseLeave={() => setHovered(null)}>
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-[#efeff1]" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-[#efeff1]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-[#d9dadd]" />
          <div className="absolute inset-0 flex items-stretch">
            {stacks.map((stack, index) => (
              <div
                key={buckets[index].start}
                className={`flex flex-1 flex-col-reverse items-center px-[1px] ${hovered === index ? "bg-[#f4f4f6]" : ""}`}
                onMouseEnter={() => setHovered(index)}
              >
                {SERIES.map((series, seriesIndex) => {
                  const value = stack[series.key];
                  if (!value) return null;
                  const topMost = SERIES.slice(seriesIndex + 1).every((next) => !stack[next.key]);
                  return (
                    <span
                      key={series.key}
                      className={`block w-full max-w-[18px] ${seriesIndex ? "mb-[2px]" : ""} ${topMost ? "rounded-t-[4px]" : ""}`}
                      style={{ background: series.color, height: `calc(${(value / max) * 100}% - ${seriesIndex ? 2 : 0}px)`, minHeight: 2 }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {hoveredBucket ? (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-[132px] rounded-lg border border-[#e6e6e9] bg-white px-2.5 py-2 text-[11px] shadow-[0_4px_16px_rgba(16,24,40,0.12)]"
              style={(hovered ?? 0) < buckets.length / 2
                ? { left: `${(((hovered ?? 0) + 1) / buckets.length) * 100}%`, marginLeft: 6 }
                : { right: `${((buckets.length - (hovered ?? 0)) / buckets.length) * 100}%`, marginRight: 6 }}
              role="tooltip"
            >
              <strong className="mb-1 block font-semibold text-[#171717]">{formatBucketRange(hoveredBucket, range)}</strong>
              {SERIES.map((series) => (
                <span key={series.key} className="flex items-center justify-between gap-3 text-[#52514e]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: series.color }} />
                    {series.label}
                  </span>
                  <span className="tabular-nums text-[#171717]">{stacks[hovered ?? 0][series.key]}</span>
                </span>
              ))}
              {hoveredBucket.authFailures ? <span className="mt-1 block text-[#b42318]">{hoveredBucket.authFailures} failed sign-in{hoveredBucket.authFailures === 1 ? "" : "s"}</span> : null}
            </div>
          ) : null}
        </div>
        <div />
        <div className="flex text-[10px] tabular-nums text-[#8a8f99]">
          {buckets.map((bucket, index) => (
            <span key={bucket.start} className="flex-1 overflow-visible whitespace-nowrap text-left">
              {index % labelEvery === 0 ? formatBucketLabel(bucket.start, range) : ""}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

function clientFailures(client: AccessLogClient) {
  return client.authFailures + (client.editFailures ?? 0);
}

function ClientTable({ blocked, filters, summary, onBlock, onFiltersChange }: { blocked: Set<string>; filters: AccessLogFilter[]; summary: AccessLogSummary | null; onBlock: (address: string) => Promise<boolean>; onFiltersChange: (filters: AccessLogFilter[]) => void }) {
  const clients = summary?.clients || [];
  const hidden = Math.max(0, (summary?.clientCount ?? clients.length) - clients.length);
  if (!clients.length) return <EmptyRow>No devices have connected yet.</EmptyRow>;
  return (
    <div className="max-h-[180px] overflow-auto rounded-xl border border-[#e6e6e9]" role="table" aria-label="Devices">
      <div className={`${clientGridClassName} sticky top-0 border-b border-[#efeff1] bg-[#f7f7f8] ${tableHeaderClassName}`} role="row">
        <span role="columnheader">Address</span>
        <span role="columnheader">User</span>
        <span role="columnheader">Last seen</span>
        <span className="text-right" role="columnheader">Views</span>
        <span className="text-right" role="columnheader">Edits</span>
        <span className="text-right" role="columnheader">Failed</span>
        <span role="columnheader"><span className="sr-only">Actions</span></span>
      </div>
      {clients.map((client, index) => {
        // Rows of one address are adjacent; repeat rows dim the address so each user reads as a sub-row.
        const sameAddress = index > 0 && clients[index - 1].ip === client.ip;
        return (
        <div key={`${client.ip}\u0000${client.user}`} className={`${clientGridClassName} border-b border-[#f3f3f5] text-[11.5px] text-[#3a3f47] last:border-b-0`} role="row">
          <span className={`inline-flex min-w-0 items-center gap-1.5 font-medium ${sameAddress ? "text-[#a3a7ae]" : "text-[#171717]"}`} role="cell">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${client.active ? "bg-[#34c759]" : "bg-[#c8ccd4]"}`} title={client.active ? "Connected" : "Not connected"} />
            <FilterButton className="font-medium" filter={{ field: "address", value: client.ip }} filters={filters} onFiltersChange={onFiltersChange}>{client.ip}</FilterButton>
            <span className="sr-only">{client.active ? "(connected)" : ""}</span>
          </span>
          {client.user ? (
            <span className="flex min-w-0" role="cell">
              <FilterButton filter={{ field: "user", value: client.user }} filters={filters} onFiltersChange={onFiltersChange}>{client.user}</FilterButton>
            </span>
          ) : <span role="cell" title="Not signed in">—</span>}
          <span className="tabular-nums" role="cell">{formatRelative(client.lastSeen)}</span>
          <span className="text-right tabular-nums" role="cell">{client.views}</span>
          <span className="text-right tabular-nums" role="cell">{client.edits}</span>
          <span className={`text-right tabular-nums ${clientFailures(client) ? "font-semibold text-[#b42318]" : ""}`} role="cell">{clientFailures(client)}</span>
          <span className="grid place-items-center" role="cell">
            {blocked.has(client.ip) ? (
              <span title="Blocked"><BanIcon className="h-3.5 w-3.5 text-[#b42318]" /><span className="sr-only">Blocked</span></span>
            ) : isLoopback(client.ip) ? null : (
              <button className="grid h-6 w-6 place-items-center rounded-md border-0 bg-transparent p-0 text-[#8a8f99] transition-colors hover:bg-[#fef2f2] hover:text-[#b42318]" type="button" aria-label={`Block ${client.ip}`} title={`Block ${client.ip}`} onClick={() => void onBlock(client.ip)}>
                <BanIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
        );
      })}
      {hidden ? <p className="m-0 px-2.5 py-1.5 text-[10.5px] text-[#9a9ea6]">{hidden.toLocaleString()} more row{hidden === 1 ? "" : "s"} in the log. Export it to see all.</p> : null}
    </div>
  );
}

function toggleFilter(filters: AccessLogFilter[], filter: AccessLogFilter) {
  const others = filters.filter((other) => other.field !== filter.field || other.value !== filter.value);
  return others.length === filters.length ? [...filters, filter] : others;
}

function FilterButton({ children, className = "", filter, filters, onFiltersChange }: { children: ReactNode; className?: string; filter: AccessLogFilter; filters: AccessLogFilter[]; onFiltersChange: (filters: AccessLogFilter[]) => void }) {
  const picked = filters.some((other) => other.field === filter.field && other.value === filter.value);
  const label = `${picked ? "Stop filtering" : "Filter"} events by ${filterLabel(filter)}`;
  return (
    <button
      className={`-mx-1 min-w-0 truncate rounded border-0 bg-transparent px-1 text-left transition-colors hover:bg-[#ececef] active:bg-[#e2e2e6] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.18)] ${picked ? "text-[#1d4ed8]" : ""} ${className}`}
      type="button"
      aria-label={label}
      aria-pressed={picked}
      title={label}
      onClick={() => onFiltersChange(toggleFilter(filters, filter))}
    >
      {children}
    </button>
  );
}

// The panel stays light in a dark OS, so it can't use the viewer's dark mode blue.
function Match({ query, text }: { query: string; text: string }) {
  return <HighlightedText className="text-[#1d4ed8]" query={query} text={text} />;
}

function EventTable({ emptyText, entries, filters, searchedText, onFiltersChange, onSelectItem }: { emptyText: string; entries: AccessLogEntry[]; filters: AccessLogFilter[]; searchedText: string; onFiltersChange: (filters: AccessLogFilter[]) => void; onSelectItem?: (itemId: string) => void }) {
  if (!entries.length) return <EmptyRow>{emptyText}</EmptyRow>;
  return (
    <div className="max-h-[240px] overflow-auto rounded-xl border border-[#e6e6e9]" role="table" aria-label="Recent events">
      <div className={`${eventGridClassName} sticky top-0 border-b border-[#efeff1] bg-[#f7f7f8] ${tableHeaderClassName}`} role="row">
        <span role="columnheader">Time</span>
        <span role="columnheader">Address</span>
        <span role="columnheader">User</span>
        <span role="columnheader">Event</span>
        <span role="columnheader">Detail</span>
        <span role="columnheader"><span className="sr-only">Actions</span></span>
      </div>
      {entries.map((entry, index) => {
        const failed = FAILED_EVENTS.has(entry.event) || (entry.status ?? 0) >= 400;
        const fields = entry.fields?.map((field) => FIELD_LABELS[field] || field).join(", ");
        // The size isn't searched, so it never gets a mark.
        const details = [
          entry.ext ? <Match query={searchedText} text={entry.ext.toUpperCase()} /> : null,
          formatBytes(entry.size) || null,
          fields ? <Match query={searchedText} text={fields} /> : null,
        ].filter(Boolean);
        return (
          <div key={`${entry.at}-${index}`} className={`${eventGridClassName} border-b border-[#f3f3f5] text-[11.5px] text-[#3a3f47] last:border-b-0`} role="row">
            <span className="whitespace-nowrap tabular-nums" role="cell" title={new Date(entry.at).toLocaleString()}>{formatTime(entry.at)}</span>
            <span className="flex min-w-0" role="cell">
              <FilterButton filter={{ field: "address", value: entry.ip }} filters={filters} onFiltersChange={onFiltersChange}><Match query={searchedText} text={entry.ip} /></FilterButton>
            </span>
            <span className="flex min-w-0" role="cell">
              {entry.user ? <FilterButton filter={{ field: "user", value: entry.user }} filters={filters} onFiltersChange={onFiltersChange}><Match query={searchedText} text={entry.user} /></FilterButton> : "—"}
            </span>
            <span className={`flex min-w-0 ${failed ? "font-semibold text-[#b42318]" : "text-[#171717]"}`} role="cell">
              <FilterButton filter={{ field: "event", value: entry.event }} filters={filters} onFiltersChange={onFiltersChange}>
                <Match query={searchedText} text={`${EVENT_LABELS[entry.event] || entry.event}${failed && entry.type !== "auth" && entry.type !== "system" && entry.status ? ` (${entry.status})` : ""}`} />
              </FilterButton>
            </span>
            <span className="grid min-w-0" role="cell" title={entry.path}>
              <span className="truncate font-mono text-[10.5px] text-[#6b7079]"><Match query={searchedText} text={entry.itemId || entry.path || ""} /></span>
              {details.length ? <span className="truncate text-[10px] leading-tight text-[#9a9ea6]">{details.map((detail, detailIndex) => <Fragment key={detailIndex}>{detailIndex ? " · " : ""}{detail}</Fragment>)}</span> : null}
            </span>
            <span className="grid place-items-center" role="cell">
              {entry.itemId && onSelectItem ? (
                <button className="grid h-6 w-6 place-items-center rounded-md border-0 bg-transparent p-0 text-[#8a8f99] transition-colors hover:bg-[#f1f1f3] hover:text-[#171717]" type="button" aria-label={`Select ${entry.itemId} in Eagle`} title="Select in Eagle" onClick={() => onSelectItem(entry.itemId as string)}>
                  <SelectItemIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SmallSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <span className="relative inline-flex h-[18px] w-[30px] shrink-0">
      <input className="peer absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0" type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className={`pointer-events-none absolute inset-0 rounded-full transition-colors peer-focus-visible:shadow-[0_0_0_3px_rgba(23,23,23,0.18)] after:absolute after:left-[2px] after:top-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,0.25)] after:transition-transform ${checked ? "bg-[#2563eb] after:translate-x-3" : "bg-[#d9dadd]"}`} aria-hidden="true" />
    </span>
  );
}

function StatTile({ help, label, value }: { help?: string; label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-xl border border-[#e6e6e9] px-3 py-2.5" title={help}>
      <span className={fieldLabelClassName}>{label}</span>
      <strong className="text-right text-[20px] font-semibold leading-none tabular-nums text-[#171717]">{value.toLocaleString()}</strong>
    </div>
  );
}

function PillButton({ active, children, onClick, small = false }: { active: boolean; children: ReactNode; onClick: () => void; small?: boolean }) {
  return (
    <button
      className={`${small ? "h-6 px-2 text-[11px]" : "h-7 px-3 text-[12px]"} rounded-full border-0 font-medium transition-colors ${active ? "bg-white text-[#171717] shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "bg-transparent text-[#6b7079] hover:text-[#171717]"}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TabButton({ active, children, controls, id, onClick }: { active: boolean; children: ReactNode; controls: string; id: string; onClick: () => void }) {
  return (
    <button
      className={`inline-flex h-7 items-center justify-center rounded-full border-0 px-2 text-[12px] font-medium transition-colors ${active ? "bg-white text-[#171717] shadow-[0_1px_3px_rgba(16,24,40,0.12)]" : "bg-transparent text-[#6b7079] hover:text-[#171717]"}`}
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconButton({ children, disabled = false, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#e6e6e9] bg-white p-0 text-[#3a3f47] transition-colors hover:bg-[#f4f4f6] disabled:cursor-wait disabled:opacity-60" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-xl border border-dashed border-[#e6e6e9] px-3 py-3 text-center text-[11.5px] text-[#8a8f99]">{children}</p>;
}

const fieldLabelClassName = "text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-[#7a7f88]";
const tableHeaderClassName = "text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-[#8a8f99]";
const clientGridClassName = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_72px_44px_60px_48px_24px] items-center gap-2 px-2.5 py-1.5";
const eventGridClassName = "grid grid-cols-[76px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)_24px] items-center gap-2 px-2.5 py-1.5";

function isLoopback(address: string) {
  return address === "::1" || address.startsWith("127.");
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    // Ticks sit at 0, half and max, so the max must split evenly.
    if (candidate >= value && Number.isInteger(candidate / 2)) return candidate;
  }
  return 10 * magnitude;
}

function formatBucketLabel(start: number, range: AccessLogRange) {
  const date = new Date(start);
  if (range === "7d") return `${date.getMonth() + 1}/${date.getDate()}`;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatBucketRange(bucket: AccessLogBucket, range: AccessLogRange) {
  if (range === "7d") return new Date(bucket.start).toLocaleDateString();
  return `${formatBucketLabel(bucket.start, range)} – ${formatBucketLabel(bucket.end, range)}`;
}

function formatTime(at: number) {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return date.toDateString() === new Date().toDateString() ? time : `${date.getMonth() + 1}/${date.getDate()} ${time.slice(0, 5)}`;
}

function formatDateTime(at: number) {
  return new Date(at).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatRelative(at: number) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return formatDateTime(at);
}
