export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = Exclude<ThemePreference, "system">;

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const THEME_STORAGE_KEY = "eagle-media-preview-theme";
const THEME_CLASS = "dark";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
let systemThemeQuery: MediaQueryList | null = null;

let currentThemeState: ThemeState = {
  preference: "light",
  resolved: "light",
};

function hasBrowserApis() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function normalizeStoredPreference(value: string | null): ThemePreference | null {
  if (isThemePreference(value)) return value;
  if (value === "white") return "light";
  if (value === "black") return "dark";
  return null;
}

function readStoredPreference(): ThemePreference | null {
  if (!hasBrowserApis()) return null;

  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return normalizeStoredPreference(storedPreference);
  } catch {
    return null;
  }
}

function getSystemResolvedTheme(): ResolvedTheme {
  if (!hasBrowserApis() || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemResolvedTheme() : preference;
}

function handleSystemThemeChange() {
  if (currentThemeState.preference !== "system") return;
  setCurrentThemeState({ preference: "system", resolved: getSystemResolvedTheme() });
}

// Only follow OS changes while the viewer is set to System.
function syncSystemThemeListener(preference: ThemePreference) {
  if (!hasBrowserApis() || typeof window.matchMedia !== "function") return;
  if (preference === "system") {
    if (systemThemeQuery) return;
    systemThemeQuery = window.matchMedia(SYSTEM_DARK_QUERY);
    systemThemeQuery.addEventListener?.("change", handleSystemThemeChange);
    return;
  }
  systemThemeQuery?.removeEventListener?.("change", handleSystemThemeChange);
  systemThemeQuery = null;
}

function writeStoredPreference(preference: ThemePreference) {
  if (!hasBrowserApis()) return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore unavailable storage; the in-memory preference still updates.
  }
}

function applyThemeToDocument(resolved: ThemeState["resolved"]) {
  if (!hasBrowserApis()) return;
  document.documentElement.classList.toggle(THEME_CLASS, resolved === "dark");
}

function setCurrentThemeState(nextState: ThemeState) {
  if (currentThemeState.preference === nextState.preference && currentThemeState.resolved === nextState.resolved) return;
  currentThemeState = nextState;
  applyThemeToDocument(nextState.resolved);
}

export function initializeThemeState() {
  const preference = readStoredPreference() ?? "system";
  currentThemeState = {
    preference,
    resolved: resolveTheme(preference),
  };
  syncSystemThemeListener(preference);
  applyThemeToDocument(currentThemeState.resolved);
}

export function getThemeState() {
  return currentThemeState;
}

export function setThemePreference(preference: ThemePreference) {
  writeStoredPreference(preference);
  syncSystemThemeListener(preference);
  setCurrentThemeState({
    preference,
    resolved: resolveTheme(preference),
  });
}

initializeThemeState();
