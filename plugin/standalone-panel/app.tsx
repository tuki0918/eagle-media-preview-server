import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccessLogPanel, accessLogSearchKeys } from "../components/AccessLogPanel";
import { FileTextIcon } from "../components/Icons";
import type { PanelSnapshot } from "../service/standalonePanel.cjs";
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

function App() {
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null);
  const [pending, setPending] = useState<"Starting" | "Stopping" | null>(null);
  const [statusError, setStatusError] = useState("");
  const statusRequest = useRef<AbortController | null>(null);
  const powerPending = useRef(false);
  const server = snapshot?.servers[0];

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
        <h1 className="m-0 text-[14px] font-semibold">Media Preview Server</h1>
        {snapshot && (
          <details className="relative ml-auto">
            <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-lg text-[#555b65] hover:bg-[#ececef] [&::-webkit-details-marker]:hidden" aria-label="Configuration source" title="Configuration source">
              <FileTextIcon className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.75rem)] rounded-xl border border-[#e6e6e9] bg-white p-3 text-[12px] shadow-lg">
              <p className="m-0 font-semibold">Settings file</p>
              <p className="mb-2 mt-1 break-all text-[#555b65]">{snapshot.settingsPath}</p>
              <p className="m-0 text-[#555b65]">The server uses the shared libraries in this file.</p>
            </div>
          </details>
        )}
      </header>
      <div className="mx-auto grid max-w-4xl gap-3 p-3">
        {statusError && <p className="m-0 rounded-xl bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b42318]" role="alert">{statusError}</p>}
        {!snapshot && !statusError && <p role="status">Connecting to the standalone server…</p>}
        {snapshot && server && (
          <>
            <StandaloneSettings server={server} pending={pending} onPower={(checked) => void setPower(checked)} onSnapshot={applySnapshot} />
            <Activity snapshot={snapshot} onSnapshot={applySnapshot} />
          </>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
