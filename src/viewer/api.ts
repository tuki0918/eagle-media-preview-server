export class ApiError extends Error {
  /** Machine-readable reason from the server body, such as "LIBRARY_NOT_SHARED". */
  code: string;
  status: number;

  constructor(status: number, message: string, code = "") {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface RequestOutcome {
  /** Opaque id of the library that answered (X-Library-Id); empty when the server sent none. */
  libraryId: string;
  ok: boolean;
  /** 0 when the request never got a response (network failure). */
  status: number;
  url: string;
}

const requestOutcomeListeners = new Set<(outcome: RequestOutcome) => void>();

let mediaFallbackCheck: (() => Promise<boolean>) | null = null;

export function setMediaFallbackCheck(check: (() => Promise<boolean>) | null) {
  mediaFallbackCheck = check;
}

// An image error can mean a library switch, not just a missing thumbnail.
export async function canFallbackMedia() {
  return mediaFallbackCheck ? mediaFallbackCheck() : true;
}

export function subscribeRequestOutcome(listener: (outcome: RequestOutcome) => void) {
  requestOutcomeListeners.add(listener);
  return () => {
    requestOutcomeListeners.delete(listener);
  };
}

function notifyRequestOutcome(outcome: RequestOutcome) {
  for (const listener of requestOutcomeListeners) {
    listener(outcome);
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// The library the viewer connected to. Every request after Connect carries it so the server can
// refuse to answer from a different library; it is never put in the address bar.
let connectedLibraryId = "";

export function setConnectedLibraryId(libraryId: string) {
  connectedLibraryId = libraryId;
}

export function connectedLibraryHeaders(): Record<string, string> {
  return connectedLibraryId ? { "X-Library-Id": connectedLibraryId } : {};
}

export async function getJson<T = unknown>(url: string, { timeoutMs }: { timeoutMs?: number } = {}): Promise<T> {
  return requestJson<T>(url, undefined, timeoutMs);
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// `timeoutMs` aborts a request the network never answers, such as one to a stopped server whose
// port silently drops packets; without it the caller waits for the browser's TCP timeout.
async function requestJson<T>(url: string, options?: RequestInit, timeoutMs?: number): Promise<T> {
  const libraryHeaders = connectedLibraryHeaders();
  const requestOptions: RequestInit = {
    ...options,
    ...(Object.keys(libraryHeaders).length ? { headers: { ...(options?.headers as Record<string, string> | undefined), ...libraryHeaders } } : {}),
    credentials: options?.credentials ?? "same-origin",
  };
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (controller) requestOptions.signal = controller.signal;
  let response: Response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    notifyRequestOutcome({ libraryId: "", ok: false, status: 0, url });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  notifyRequestOutcome({ libraryId: response.headers?.get?.("X-Library-Id") || "", ok: response.ok, status: response.status, url });
  const data = await safeJson(response);
  if (!response.ok) throw new ApiError(response.status, responseErrorMessage(data, response.status), responseErrorCode(data));
  return data as T;
}

async function safeJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function responseErrorMessage(data: unknown, status: number) {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (error) return String(error);
  }
  return `HTTP ${status}`;
}

function responseErrorCode(data: unknown) {
  if (data && typeof data === "object" && "code" in data) {
    const code = (data as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

export function mediaUrl(id: string, kind: string) {
  const path = kind === "file"
    ? `/file/${encodeURIComponent(id)}`
    : `/api/items/${encodeURIComponent(id)}/${kind}`;
  // Media elements cannot send headers, so the connected library travels in the query string.
  return connectedLibraryId ? `${path}?library=${encodeURIComponent(connectedLibraryId)}` : path;
}

export type DebouncedFunction<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
};

export function debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, wait: number): DebouncedFunction<TArgs> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: TArgs) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
