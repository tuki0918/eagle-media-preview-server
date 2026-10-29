const { createEagleClient } = require("./eagleClient.cjs");

interface ConnectionInput {
  host?: unknown;
  port?: unknown;
  token?: unknown;
}

interface NormalizeConnectionOptions {
  requestHost?: string;
  requireRemoteToken?: boolean;
}

interface EagleConnection {
  baseUrl: string;
  host: string;
  port: number;
  token: string;
}

interface EagleClient {
  libraryInfo(): Promise<unknown>;
}

interface ConnectionContextOptions {
  client?: EagleClient;
  connection?: EagleConnection;
  fetchImpl?: typeof fetch;
  input?: ConnectionInput;
  libraryInfoTtlMs?: number;
}

// The open library can change in the Eagle app at any time, so the cached info is only
// trusted briefly; the plugin also clears it as soon as Eagle reports a library change.
const DEFAULT_LIBRARY_INFO_TTL_MS = 3000;

function normalizeConnectionInput(input: ConnectionInput = {}, { requestHost = "", requireRemoteToken = false }: NormalizeConnectionOptions = {}) {
  const host = String(input.host || "127.0.0.1").trim() || "127.0.0.1";
  const rawPort = String(input.port || "41595").trim();
  const parsedPort = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error("Invalid port");
  }

  const token = String(input.token || "").trim();
  if (requireRemoteToken && requiresToken({ host, requestHost }) && !token) {
    throw new Error("A token is required when connecting to a remote Eagle API");
  }

  return {
    host,
    port: parsedPort,
    token,
    baseUrl: `http://${formatHostForUrl(host)}:${parsedPort}`,
  };
}

function buildConnectionCandidates({ input = {}, requestHost = "" }: { input?: ConnectionInput; requestHost?: string } = {}) {
  const primary = normalizeConnectionInput(input, { requestHost, requireRemoteToken: true });
  const viewerHost = extractHostname(requestHost);

  if (
    viewerHost &&
    primary.host === viewerHost &&
    !["127.0.0.1", "localhost", "::1"].includes(primary.host)
  ) {
    return [
      normalizeConnectionInput({
        ...input,
        host: "127.0.0.1",
        port: primary.port,
        token: primary.token,
      }),
      primary,
    ];
  }

  return [primary];
}

function requiresToken({ host, requestHost = "" }: { host: string; requestHost?: string }) {
  const viewerHost = extractHostname(requestHost);
  return !["127.0.0.1", "localhost", "::1", viewerHost].includes(host);
}

function createConnectionContext({ input, connection, fetchImpl = globalThis.fetch, client, libraryInfoTtlMs = DEFAULT_LIBRARY_INFO_TTL_MS }: ConnectionContextOptions = {}) {
  const resolvedConnection = connection || normalizeConnectionInput(input);
  const resolvedClient = client || createEagleClient({
    baseUrl: resolvedConnection.baseUrl,
    token: resolvedConnection.token,
    fetchImpl,
  });
  let libraryInfoCache: { expiresAt: number; value: Promise<unknown> } | null = null;

  return {
    connection: resolvedConnection,
    client: resolvedClient,
    async libraryInfo() {
      const now = Date.now();
      if (!libraryInfoCache || libraryInfoCache.expiresAt <= now) {
        const entry = { expiresAt: now + libraryInfoTtlMs, value: resolvedClient.libraryInfo() };
        libraryInfoCache = entry;
        entry.value.catch(() => {
          if (libraryInfoCache === entry) libraryInfoCache = null;
        });
      }
      return libraryInfoCache.value;
    },
    clearLibraryInfo() {
      libraryInfoCache = null;
    },
  };
}

function extractHostname(hostHeader: string) {
  if (!hostHeader) return "";
  if (hostHeader.startsWith("[")) {
    return hostHeader.slice(1, hostHeader.indexOf("]"));
  }
  return hostHeader.split(":")[0];
}

function formatHostForUrl(host: string) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
module.exports = { normalizeConnectionInput, buildConnectionCandidates, requiresToken, createConnectionContext };
