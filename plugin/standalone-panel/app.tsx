import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccessLogPanel, accessLogSearchKeys } from "../components/AccessLogPanel";
import { ServerStatusPanel } from "../components/ServerStatusPanel";
import { createQrDataUrl } from "../qrCode";
import type { PanelServer, PanelSnapshot } from "../service/standalonePanel.cjs";
import type { AccessLogEventFilter, AccessLogFilter, AccessLogRange, AccessLogSummary } from "../types";

import { errorMessage, postJson, request } from "./panelApi";
import { StandaloneSettings } from "./StandaloneSettings";

function Activity({ snapshot, onSnapshot }: { snapshot: PanelSnapshot; onSnapshot(snapshot: PanelSnapshot): void }) {
  const [summary, setSummary] = useState<AccessLogSummary | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [range, setRange] = useState<AccessLogRange>("24h");
  const [eventFilter, setEventFilter] = useState<AccessLogEventFilter>("");
  const [filters, setFilters] = useState<AccessLogFilter[]>([]);
  const [search, setSearch] = useState("");
  const [searchedText, setSearchedText] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ source: "refresh" | "action"; message: string } | null>(null);
  const libraryNames = new Map(snapshot.libraryNames);
  const refresh = () => setRevision((current) => current + 1);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const term = search.trim();
      const keys = accessLogSearchKeys(term);
      const query = new URLSearchParams({ range, search: term, type: eventFilter });
      for (const key of keys.events) query.append("eventKey", key);
      for (const key of keys.fields) query.append("fieldKey", key);
      for (const filter of filters) query.append(filter.field, filter.value);
      setLoading(true);
      try {
        const response = await request(`/api/activity?${query}`, { signal: controller.signal });
        const next = await response.json();
        if (controller.signal.aborted) return;
        setSummary(next);
        setSearchedText(term);
        setError((current) => current?.source === "refresh" ? null : current);
      } catch (error) {
        if (!controller.signal.aborted) setError({ source: "refresh", message: errorMessage(error) });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [eventFilter, expanded, filters, range, revision, search]);

  useEffect(() => {
    if (!expanded || !autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, expanded]);

  async function exportLog() {
    setError(null);
    try {
      const response = await request("/api/activity/export");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "standalone-access-log.csv";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError({ source: "action", message: errorMessage(error) });
    }
  }

  async function clearLog() {
    if (!window.confirm("Clear the standalone access log?")) return;
    setError(null);
    try {
      await request("/api/activity/clear", { method: "POST" });
      refresh();
    } catch (error) {
      setError({ source: "action", message: errorMessage(error) });
    }
  }

  async function changeBlockedAddress(address: string, blocked: boolean) {
    if (blocked && !window.confirm(`Block ${address} from all viewer servers?`)) return false;
    setError(null);
    try {
      const response = await postJson(blocked ? "/api/settings/block" : "/api/settings/unblock", { address });
      onSnapshot(await response.json());
      refresh();
      return true;
    } catch (error) {
      setError({ source: "action", message: errorMessage(error) });
      return false;
    }
  }

  return (
    <AccessLogPanel
      activeClients={snapshot.activeClients}
      autoRefresh={autoRefresh}
      blockedAddresses={snapshot.blockedAddresses}
      eventFilter={eventFilter}
      expanded={expanded}
      filters={filters}
      libraryNames={libraryNames}
      loading={loading}
      notice={error ? { isError: true, text: error.message } : null}
      onAutoRefreshChange={setAutoRefresh}
      onBlock={(address) => changeBlockedAddress(address, true)}
      onClear={() => void clearLog()}
      onUnblock={(address) => void changeBlockedAddress(address, false)}
      onDismissNotice={() => setError(null)}
      onEventFilterChange={setEventFilter}
      onExpandedChange={setExpanded}
      onExport={() => void exportLog()}
      onFiltersChange={setFilters}
      onRangeChange={setRange}
      onRefresh={refresh}
      onSearchChange={setSearch}
      range={range}
      retentionNote="Standalone activity is kept for up to 7 days and stays available after the viewer servers stop."
      search={search}
      searchedText={searchedText}
      summary={summary}
    />
  );
}

function SelectedServer({ server, pending, saving, onPower }: {
  server: PanelServer;
  pending: "Starting" | "Stopping" | null;
  saving: boolean;
  onPower(checked: boolean): void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const qrSrc = useMemo(() => server.url ? createQrDataUrl(server.url) : "", [server.url]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(server.url);
      setCopyError("");
      setCopied(true);
    } catch (error) {
      setCopyError(errorMessage(error));
    }
  }

  return (
    <>
      {(server.error || copyError) && <p className="m-0 rounded-xl bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b42318]" role="alert">{server.error || copyError}</p>}
      <ServerStatusPanel
        authEnabled={server.authEnabled}
        formDisabled={pending !== null || saving}
        httpsEnabled={server.httpsEnabled}
        publicNetwork={server.publicNetwork}
        qrSrc={qrSrc}
        serverState={server.state}
        statusLabel={pending || { running: "Running", stopped: "Stopped", error: "Error" }[server.state]}
        statusPending={pending !== null}
        url={server.url}
        urlCopied={copied}
        onCopyAccessUrl={() => void copyUrl()}
        onOpenEndpointUrl={() => server.url && window.open(server.url, "_blank", "noopener")}
        onServerPowerChange={onPower}
      />
      <section className="grid gap-2 rounded-2xl border border-[#e6e6e9] bg-white p-4">
        <h2 className="m-0 text-[15px] font-semibold">Libraries</h2>
        <ul className="m-0 grid list-none divide-y divide-[#efeff1] p-0 text-[13px]">
          {server.libraries.map(({ name, status }, index) => (
            <li key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
              <span className="min-w-0 break-words font-medium">{name}</span>
              <span className="min-w-0 break-words text-[#5f6670]">{status === "-" ? "Not open" : status}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null);
  const [selected, setSelected] = useState(0);
  const [pending, setPending] = useState<"Starting" | "Stopping" | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const statusRequest = useRef<AbortController | null>(null);
  const powerPending = useRef(false);
  const server = snapshot?.servers[selected] ?? snapshot?.servers[0];

  useEffect(() => {
    async function refresh() {
      if (powerPending.current || statusRequest.current) return;
      const controller = new AbortController();
      statusRequest.current = controller;
      try {
        const response = await request("/api/status", { signal: controller.signal });
        const next = await response.json();
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setStatusError("");
      } catch (error) {
        if (!controller.signal.aborted) setStatusError(errorMessage(error));
      } finally {
        if (statusRequest.current === controller) statusRequest.current = null;
      }
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => {
      window.clearInterval(timer);
      statusRequest.current?.abort();
    };
  }, []);

  function applySnapshot(next: PanelSnapshot) {
    statusRequest.current?.abort();
    setSnapshot(next);
    setSelected((current) => current < next.servers.length ? current : 0);
  }

  async function setPower(checked: boolean) {
    if (!server || powerPending.current) return;
    powerPending.current = true;
    statusRequest.current?.abort();
    setPending(checked ? "Starting" : "Stopping");
    setStatusError("");
    try {
      const response = await request(`/api/servers/${server.index}/${checked ? "start" : "stop"}`, { method: "POST" });
      setSnapshot(await response.json());
    } catch (error) {
      setStatusError(errorMessage(error));
    } finally {
      powerPending.current = false;
      setPending(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#171717]">
      <header className="sticky top-0 z-10 flex h-[46px] items-center gap-2.5 border-b border-[#e6e6e9] bg-white/90 px-3.5 backdrop-blur-xl">
        <img className="h-6 w-6 rounded-md" src={snapshot?.servers.some(({ state }) => state === "running") ? "/assets/icon_on.svg" : "/assets/icon_off.svg"} alt="" />
        <h1 className="m-0 text-[14px] font-semibold">Media Preview Server · Standalone</h1>
      </header>
      <div className="mx-auto grid max-w-4xl gap-3 p-3">
        {statusError && <p className="m-0 rounded-xl bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b42318]" role="alert">{statusError}</p>}
        {!snapshot && !statusError && <p role="status">Connecting to the standalone server…</p>}
        {snapshot && server && (
          <>
            {snapshot.servers.length > 1 && (
              <label className="grid gap-1 text-[13px] font-medium">
                Viewer server
                <select className="w-full rounded-xl border border-[#e6e6e9] bg-white px-3 py-2" disabled={pending !== null} value={selected} onChange={(event) => setSelected(Number(event.currentTarget.value))}>
                  {snapshot.servers.map((entry) => (
                    <option key={entry.index} value={entry.index}>
                      {entry.libraries.map(({ name }) => name).join(", ")} · {entry.port || "automatic port"} · {entry.state}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <SelectedServer key={server.index} server={server} pending={pending} saving={saving} onPower={(checked) => void setPower(checked)} />
            <StandaloneSettings snapshot={snapshot} powerPending={pending !== null} onSavingChange={setSaving} onSnapshot={applySnapshot} />
            <Activity snapshot={snapshot} onSnapshot={applySnapshot} />
            <dl className="m-0 grid gap-1 break-all text-[11.5px] text-[#5f6670]">
              <div><dt className="inline font-semibold">Settings </dt><dd className="inline">{snapshot.settingsPath}</dd></div>
              <div><dt className="inline font-semibold">Servers </dt><dd className="inline">{snapshot.source}</dd></div>
            </dl>
          </>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
