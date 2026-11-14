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

// The browser bar and an installed app's status bar: the page background (--background in styles.css), as in index.html.
const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#ffffff", dark: "#0f1012" };

function applyThemeToDocument(resolved: ThemeState["resolved"]) {
  if (!hasBrowserApis()) return;
  document.documentElement.classList.toggle(THEME_CLASS, resolved === "dark");
  syncThemeColor(resolved);
}

// index.html's theme-color follows the device's light or dark setting, not the viewer's theme, so
// it is replaced with the theme's color. A new tag rather than a changed one: an installed app on
// iOS may not notice a change to the tag it read at launch.
function syncThemeColor(resolved: ResolvedTheme) {
  const head = document.head;
  if (!head) return;
  const color = THEME_COLORS[resolved];
  const tags = Array.from(head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  if (tags.length === 1 && !tags[0].hasAttribute("media") && tags[0].content === color) return;
  for (const tag of tags) tag.remove();
  const tag = document.createElement("meta");
  tag.name = "theme-color";
  tag.content = color;
  head.append(tag);
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
