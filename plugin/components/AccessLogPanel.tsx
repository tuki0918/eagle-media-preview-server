import { useState, type ReactNode } from "react";
import type { AccessLogBucket, AccessLogEntry, AccessLogRange, AccessLogSummary, AccessLogType } from "../types";
import { ActivityIcon, ChevronIcon, DownloadIcon, FolderOpenIcon, TrashIcon } from "./Icons";

interface AccessLogPanelProps {
  expanded: boolean;
  range: AccessLogRange;
  summary: AccessLogSummary | null;
  onClear: () => void;
  onExport: () => void;
  onExpandedChange: (updater: (current: boolean) => boolean) => void;
  onRangeChange: (range: AccessLogRange) => void;
  /** Reveals the log file in Finder/Explorer; omitted when Eagle has no shell API for it. */
  onRevealFile?: () => void;
}

type EventFilter = "" | AccessLogType;

// Categorical slots 1–3 of the reference palette, in fixed order: views, browsing, sign-ins.
const SERIES = [
  { key: "view", label: "Views", color: "#2a78d6" },
  { key: "browse", label: "Browsing", color: "#eb6834" },
  { key: "auth", label: "Sign-ins", color: "#1baf7a" },
] as const;

const RANGE_OPTIONS: Array<{ label: string; value: AccessLogRange }> = [
  { label: "1 hour", value: "1h" },
  { label: "24 hours", value: "24h" },
  { label: "7 days", value: "7d" },
];

const EVENT_FILTERS: Array<{ label: string; value: EventFilter }> = [
  { label: "All", value: "" },
  { label: "Views", value: "view" },
  { label: "Sign-ins", value: "auth" },
  { label: "Edits", value: "edit" },
  { label: "Browsing", value: "browse" },
];

const EVENT_LABELS: Record<string, string> = {
  login_failure: "Sign-in failed",
  login_locked: "Sign-in locked",
  login_success: "Signed in",
  logout: "Signed out",
  metadata: "Edited metadata",
  search: "Searched",
  star: "Changed rating",
  trash: "Moved to trash",
  url_preview: "Opened URL",
  view: "Viewed",
};

const RECENT_LIMIT = 100;

export function AccessLogPanel({ expanded, range, summary, onClear, onExport, onExpandedChange, onRangeChange, onRevealFile }: AccessLogPanelProps) {
  const [eventFilter, setEventFilter] = useState<EventFilter>("");
  const recent = (summary?.recent || []).filter((entry) => !eventFilter || entry.type === eventFilter).slice(0, RECENT_LIMIT);
  const totals = summary?.totals;
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
          {summary ? <span className="text-[11.5px] font-medium text-[#7a7f88]">{summary.activeClients} connected</span> : null}
        </span>
        <ChevronIcon className={`h-[14px] w-[14px] text-[#555c66] transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div id="activityPanel" className="mt-2.5 grid gap-3" hidden={!expanded}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid grid-cols-3 rounded-full bg-[#f1f1f3] p-1" role="group" aria-label="Time range">
            {RANGE_OPTIONS.map((option) => (
              <PillButton key={option.value} active={range === option.value} onClick={() => onRangeChange(option.value)}>{option.label}</PillButton>
            ))}
          </div>
          <div className="inline-flex items-center gap-1.5">
            <IconButton label="Export log as CSV" onClick={onExport}><DownloadIcon className="h-[15px] w-[15px]" /></IconButton>
            {onRevealFile ? <IconButton label="Show log file" onClick={onRevealFile}><FolderOpenIcon className="h-[15px] w-[15px]" /></IconButton> : null}
            <IconButton label="Clear log" onClick={onClear}><TrashIcon className="h-[15px] w-[15px]" /></IconButton>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 max-[520px]:grid-cols-2">
          <StatTile label="Connected" value={summary?.activeClients ?? 0} help="Devices seen in the last 2 minutes" />
          <StatTile label="Views" value={totals?.view ?? 0} />
          <StatTile label="Requests" value={(totals?.browse ?? 0) + (totals?.edit ?? 0) + (totals?.view ?? 0) + (totals?.auth ?? 0)} />
          <StatTile label="Failed sign-ins" value={totals?.authFailures ?? 0} />
        </div>

        <ActivityChart buckets={summary?.buckets || []} range={range} />

        <div className="grid gap-1.5">
          <span className={fieldLabelClassName}>Devices</span>
          <ClientTable summary={summary} />
        </div>

        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={fieldLabelClassName}>Recent events</span>
            <div className="inline-flex rounded-full bg-[#f1f1f3] p-0.5" role="group" aria-label="Event type">
              {EVENT_FILTERS.map((option) => (
                <PillButton key={option.value || "all"} small active={eventFilter === option.value} onClick={() => setEventFilter(option.value)}>{option.label}</PillButton>
              ))}
            </div>
          </div>
          <EventTable entries={recent} />
        </div>

        <p className="m-0 text-[10.5px] leading-snug text-[#9a9ea6]">
          {summary
            ? `${summary.retainedEntries.toLocaleString()} entries kept${summary.oldestAt ? ` since ${formatDateTime(summary.oldestAt)}` : ""}. Saved in the temporary folder for up to 7 days; it is readable after the server stops and may be removed on restart.`
            : "Loading activity…"}
        </p>
      </div>
    </section>
  );
}

function ActivityChart({ buckets, range }: { buckets: AccessLogBucket[]; range: AccessLogRange }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const stacks = buckets.map((bucket) => ({ view: bucket.view, browse: bucket.browse + bucket.edit, auth: bucket.auth }));
  const max = niceMax(Math.max(0, ...stacks.map((stack) => stack.view + stack.browse + stack.auth)));
  const labelEvery = range === "24h" ? 6 : range === "1h" ? 3 : 1;
  const hoveredBucket = hovered === null ? null : buckets[hovered];
  return (
    <figure className="m-0 grid gap-2" aria-label="Requests over time">
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

function ClientTable({ summary }: { summary: AccessLogSummary | null }) {
  const clients = summary?.clients || [];
  if (!clients.length) return <EmptyRow>No devices have connected yet.</EmptyRow>;
  return (
    <div className="max-h-[180px] overflow-auto rounded-xl border border-[#e6e6e9]" role="table" aria-label="Devices">
      <div className={`${clientGridClassName} sticky top-0 border-b border-[#efeff1] bg-[#f7f7f8] ${tableHeaderClassName}`} role="row">
        <span role="columnheader">Address</span>
        <span role="columnheader">Users</span>
        <span role="columnheader">Last seen</span>
        <span className="text-right" role="columnheader">Views</span>
        <span className="text-right" role="columnheader">Requests</span>
        <span className="text-right" role="columnheader">Failed</span>
      </div>
      {clients.map((client) => (
        <div key={client.ip} className={`${clientGridClassName} border-b border-[#f3f3f5] text-[11.5px] text-[#3a3f47] last:border-b-0`} role="row">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[#171717]" role="cell">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${client.active ? "bg-[#34c759]" : "bg-[#c8ccd4]"}`} title={client.active ? "Connected" : "Not connected"} />
            <span className="truncate">{client.ip}</span>
            <span className="sr-only">{client.active ? "(connected)" : ""}</span>
          </span>
          <span className="truncate" role="cell">{client.users.join(", ") || "—"}</span>
          <span className="tabular-nums" role="cell">{formatRelative(client.lastSeen)}</span>
          <span className="text-right tabular-nums" role="cell">{client.views}</span>
          <span className="text-right tabular-nums" role="cell">{client.requests}</span>
          <span className={`text-right tabular-nums ${client.authFailures ? "font-semibold text-[#b42318]" : ""}`} role="cell">{client.authFailures}</span>
        </div>
      ))}
    </div>
  );
}

function EventTable({ entries }: { entries: AccessLogEntry[] }) {
  if (!entries.length) return <EmptyRow>No events in the log.</EmptyRow>;
  return (
    <div className="max-h-[240px] overflow-auto rounded-xl border border-[#e6e6e9]" role="table" aria-label="Recent events">
      <div className={`${eventGridClassName} sticky top-0 border-b border-[#efeff1] bg-[#f7f7f8] ${tableHeaderClassName}`} role="row">
        <span role="columnheader">Time</span>
        <span role="columnheader">Address</span>
        <span role="columnheader">User</span>
        <span role="columnheader">Event</span>
        <span role="columnheader">Detail</span>
      </div>
      {entries.map((entry, index) => {
        const failed = entry.type === "auth" ? entry.event === "login_failure" || entry.event === "login_locked" : (entry.status ?? 0) >= 400;
        return (
          <div key={`${entry.at}-${index}`} className={`${eventGridClassName} border-b border-[#f3f3f5] text-[11.5px] text-[#3a3f47] last:border-b-0`} role="row">
            <span className="whitespace-nowrap tabular-nums" role="cell" title={new Date(entry.at).toLocaleString()}>{formatTime(entry.at)}</span>
            <span className="truncate" role="cell">{entry.ip}</span>
            <span className="truncate" role="cell">{entry.user || "—"}</span>
            <span className={`truncate ${failed ? "font-semibold text-[#b42318]" : "text-[#171717]"}`} role="cell">
              {EVENT_LABELS[entry.event] || entry.event}
              {failed && entry.type !== "auth" && entry.status ? ` (${entry.status})` : ""}
            </span>
            <span className="truncate font-mono text-[10.5px] text-[#6b7079]" role="cell" title={entry.path}>{entry.itemId || entry.path || ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatTile({ help, label, value }: { help?: string; label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-xl border border-[#e6e6e9] px-3 py-2.5" title={help}>
      <span className={fieldLabelClassName}>{label}</span>
      <strong className="text-[20px] font-semibold leading-none tabular-nums text-[#171717]">{value.toLocaleString()}</strong>
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

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="grid h-8 w-8 place-items-center rounded-lg border border-[#e6e6e9] bg-white p-0 text-[#3a3f47] transition-colors hover:bg-[#f4f4f6]" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-xl border border-dashed border-[#e6e6e9] px-3 py-3 text-center text-[11.5px] text-[#8a8f99]">{children}</p>;
}

const fieldLabelClassName = "text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-[#7a7f88]";
const tableHeaderClassName = "text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-[#8a8f99]";
const clientGridClassName = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_72px_44px_60px_48px] items-center gap-2 px-2.5 py-1.5";
const eventGridClassName = "grid grid-cols-[76px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 px-2.5 py-1.5";

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
