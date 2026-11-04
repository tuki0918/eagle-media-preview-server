const { basename } = require("path");

interface SharedLibrary {
  /** "selected" limits the library to `users`; absent means every signed-in user. */
  access?: "selected";
  name: string;
  path: string;
  users?: string[];
}

// A library shared only with some users; passed to the server only while password protection is on.
interface LibraryUserRule {
  path: string;
  users: string[];
}

interface LibraryUser {
  role?: string;
  username: string;
}

// "forbidden": shared, but not with this signed-in user.
type LibraryStatus = "forbidden" | "not_shared" | "shared" | "unrestricted";

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
    const library: SharedLibrary = { path, name: String(input?.name || "").trim() || libraryNameFromPath(path) };
    if ((input as { access?: unknown } | null)?.access === "selected") {
      // An empty list means nobody, not everybody: removing the last allowed user never opens the library.
      library.access = "selected";
      library.users = normalizeUsernames((input as { users?: unknown }).users);
    }
    output.push(library);
  }
  return output;
}

function normalizeUsernames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((name) => String(name || "").trim()).filter(Boolean))];
}

// `null` means protection is off and whichever library Eagle has open is shared.
// The list is fixed for the lifetime of a server; changing it requires a restart.
// `userRules` limits some shared libraries to named users. `status()` checks them only when given
// a user argument: `null` for a request that is not signed in, which a limited library refuses.
// Admins can open every shared library.
function createLibraryAccessPolicy(sharedLibraryPaths: string[] | null = null, userRules: LibraryUserRule[] = [], platform: string = process.platform) {
  const allowedKeys = sharedLibraryPaths
    ? new Set(sharedLibraryPaths.map((path) => libraryPathKey(path, platform)).filter(Boolean))
    : null;
  const usersByKey = new Map<string, Set<string>>();
  if (allowedKeys) {
    for (const rule of userRules) {
      const key = libraryPathKey(rule.path, platform);
      if (key && allowedKeys.has(key)) usersByKey.set(key, new Set(rule.users));
    }
  }

  return {
    status(libraryPath: unknown, user?: LibraryUser | null): LibraryStatus {
      if (!allowedKeys) return "unrestricted";
      const key = libraryPathKey(libraryPath, platform);
      if (!key || !allowedKeys.has(key)) return "not_shared";
      if (user === undefined) return "shared";
      const allowed = usersByKey.get(key);
      if (!allowed || user?.role === "admin" || (user && allowed.has(user.username))) return "shared";
      return "forbidden";
    },
  };
}

module.exports = { createLibraryAccessPolicy, libraryNameFromPath, libraryPathKey, normalizeSharedLibraries };
