export type ThemePreference = "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  resolved: ThemePreference;
}

const THEME_STORAGE_KEY = "eagle-media-preview-theme";
const THEME_CLASS = "dark";
const listeners = new Set<() => void>();

let currentThemeState: ThemeState = {
  preference: "light",
  resolved: "light",
};

function hasBrowserApis() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark";
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

function getSystemResolvedTheme() {
  if (!hasBrowserApis() || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

function emitThemeChange() {
  for (const listener of listeners) {
    listener();
  }
}

function setCurrentThemeState(nextState: ThemeState) {
  if (currentThemeState.preference === nextState.preference && currentThemeState.resolved === nextState.resolved) return;
  currentThemeState = nextState;
  applyThemeToDocument(nextState.resolved);
  emitThemeChange();
}

export function initializeThemeState() {
  const preference = readStoredPreference() ?? getSystemResolvedTheme();
  writeStoredPreference(preference);
  currentThemeState = {
    preference,
    resolved: preference,
  };
  applyThemeToDocument(currentThemeState.resolved);
}

export function getThemeState() {
  return currentThemeState;
}

export function setThemePreference(preference: ThemePreference) {
  writeStoredPreference(preference);
  setCurrentThemeState({
    preference,
    resolved: preference,
  });
}

export function subscribeThemeState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

initializeThemeState();
