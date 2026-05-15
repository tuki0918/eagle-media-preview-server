const { createEagleClient } = require("./eagleClient.cjs");

function normalizeConnectionInput(input = {}, { requestHost = "", requireRemoteToken = false } = {}) {
  const host = String(input.host || "127.0.0.1").trim() || "127.0.0.1";
  const parsedPort = Number.parseInt(input.port || "41595", 10);

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
    baseUrl: `http://${host}:${parsedPort}`,
  };
}

function buildConnectionCandidates({ input = {}, requestHost = "" } = {}) {
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

function requiresToken({ host, requestHost = "" }) {
  const viewerHost = extractHostname(requestHost);
  return !["127.0.0.1", "localhost", "::1", viewerHost].includes(host);
}

function createConnectionContext({ input, connection, fetchImpl = globalThis.fetch, client } = {}) {
  const resolvedConnection = connection || normalizeConnectionInput(input);
  const resolvedClient = client || createEagleClient({
    baseUrl: resolvedConnection.baseUrl,
    token: resolvedConnection.token,
    fetchImpl,
  });
  let libraryInfoCache = null;

  return {
    connection: resolvedConnection,
    client: resolvedClient,
    async libraryInfo() {
      libraryInfoCache ??= await resolvedClient.libraryInfo();
      return libraryInfoCache;
    },
    clearLibraryInfo() {
      libraryInfoCache = null;
    },
  };
}

function extractHostname(hostHeader) {
  if (!hostHeader) return "";
  if (hostHeader.startsWith("[")) {
    return hostHeader.slice(1, hostHeader.indexOf("]"));
  }
  return hostHeader.split(":")[0];
}
module.exports = { normalizeConnectionInput, buildConnectionCandidates, requiresToken, createConnectionContext };
