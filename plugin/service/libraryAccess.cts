const { basename } = require("path");

interface SharedLibrary {
  name: string;
  path: string;
}

type LibraryStatus = "not_shared" | "shared" | "unrestricted";

// Eagle reports the same library with or without a trailing separator, and macOS/Windows
// file systems are case-insensitive by default, so comparisons use a normalized key.
function libraryPathKey(path: unknown, platform: string = process.platform) {
  const trimmed = String(path || "").trim().replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  const separators = platform === "win32" ? trimmed.replace(/\//g, "\\") : trimmed;
  return platform === "darwin" || platform === "win32" ? separators.toLowerCase() : separators;
}

function libraryNameFromPath(path: string) {
  return basename(String(path || "").trim().replace(/[\\/]+$/, "")).replace(/\.library$/i, "") || path;
}

function normalizeSharedLibraries(value: unknown, platform: string = process.platform): SharedLibrary[] {
  if (!Array.isArray(value)) return [];
  const output: SharedLibrary[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const input = typeof entry === "string" ? { path: entry } : entry && typeof entry === "object" ? entry as { name?: unknown; path?: unknown } : null;
    const path = String(input?.path || "").trim().replace(/[\\/]+$/, "");
    const key = libraryPathKey(path, platform);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push({ path, name: String(input?.name || "").trim() || libraryNameFromPath(path) });
  }
  return output;
}

// `null` means protection is off and whichever library Eagle has open is shared.
// The list is fixed for the lifetime of a server; changing it requires a restart.
function createLibraryAccessPolicy(sharedLibraryPaths: string[] | null = null, platform: string = process.platform) {
  const allowedKeys = sharedLibraryPaths
    ? new Set(sharedLibraryPaths.map((path) => libraryPathKey(path, platform)).filter(Boolean))
    : null;

  return {
    status(libraryPath: unknown): LibraryStatus {
      if (!allowedKeys) return "unrestricted";
      const key = libraryPathKey(libraryPath, platform);
      return key && allowedKeys.has(key) ? "shared" : "not_shared";
    },
  };
}

module.exports = { createLibraryAccessPolicy, libraryNameFromPath, libraryPathKey, normalizeSharedLibraries };
