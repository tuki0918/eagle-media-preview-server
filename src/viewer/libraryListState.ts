import { getJson } from "./api";

// The libraries this server offers the signed-in user (a standalone server serving several), for
// the library picker. Empty on a server with one library, or one that doesn't list them (the plugin).

export type LibraryEntryStatus = "building" | "failed" | "ready";

export interface LibraryEntry {
  id: string;
  name: string;
  status: LibraryEntryStatus;
  loaded?: number;
  total?: number;
}

export interface LibraryListState {
  currentId: string;
  libraries: LibraryEntry[];
}

// Remembers the library picked last, so a reload or a later visit opens it again.
const PICKED_LIBRARY_STORAGE_KEY = "mediaLibrary.libraryId";

const listeners = new Set<() => void>();
let current: LibraryListState = { currentId: "", libraries: [] };

export function getLibraryListState() {
  return current;
}

export function setLibraryListState(next: LibraryListState) {
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeLibraryListState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function normalizeLibraryList(value: unknown): LibraryEntry[] {
  const list = value && typeof value === "object" ? (value as { libraries?: unknown }).libraries : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (!id) return [];
    const status: LibraryEntryStatus = record.status === "building" || record.status === "failed" ? record.status : "ready";
    return [{
      id,
      name: typeof record.name === "string" && record.name ? record.name : "Library",
      status,
      ...(typeof record.loaded === "number" ? { loaded: record.loaded } : {}),
      ...(typeof record.total === "number" ? { total: record.total } : {}),
    }];
  });
}

export function getPickedLibraryId() {
  try {
    return globalThis.localStorage?.getItem(PICKED_LIBRARY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setPickedLibraryId(id: string) {
  try {
    if (id) globalThis.localStorage?.setItem(PICKED_LIBRARY_STORAGE_KEY, id);
    else globalThis.localStorage?.removeItem(PICKED_LIBRARY_STORAGE_KEY);
  } catch {
    // Private browsing: the pick lasts for this page only.
  }
}

// Asks the server which libraries this user may open. The plugin lists none, and the picker stays
// hidden; it stays hidden too when the list can't be fetched.
let refreshRun = 0;

export async function refreshLibraryList(currentId = current.currentId) {
  // Only the latest answer counts: an older one may still name the library switched away from.
  const run = ++refreshRun;
  let libraries: LibraryEntry[] = [];
  try {
    libraries = normalizeLibraryList(await getJson("/api/libraries"));
  } catch {
    libraries = [];
  }
  if (run !== refreshRun) return;
  setLibraryListState({ currentId, libraries });
  const picked = getPickedLibraryId();
  if (picked && libraries.length && !libraries.some((library) => library.id === picked)) setPickedLibraryId("");
}
