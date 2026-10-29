interface EagleClient {
  libraryInfo(): Promise<unknown>;
}

interface ConnectionContextOptions {
  client: EagleClient;
  libraryInfoTtlMs?: number;
}

// The open library can change in the Eagle app at any time, so the cached info is only
// trusted briefly; the plugin also clears it as soon as Eagle reports a library change.
const DEFAULT_LIBRARY_INFO_TTL_MS = 3000;

// Wraps the server's own Eagle client with a short-lived cache of the open library.
function createConnectionContext({ client, libraryInfoTtlMs = DEFAULT_LIBRARY_INFO_TTL_MS }: ConnectionContextOptions) {
  let libraryInfoCache: { expiresAt: number; value: Promise<unknown> } | null = null;

  return {
    client,
    async libraryInfo() {
      const now = Date.now();
      if (!libraryInfoCache || libraryInfoCache.expiresAt <= now) {
        const entry = { expiresAt: now + libraryInfoTtlMs, value: client.libraryInfo() };
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
module.exports = { createConnectionContext };
