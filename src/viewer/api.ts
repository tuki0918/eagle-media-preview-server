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

export async function getJson<T = unknown>(url: string): Promise<T> {
  return requestJson<T>(url);
}

export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const requestOptions: RequestInit = {
    ...options,
    credentials: options?.credentials ?? "same-origin",
  };
  let response: Response;
  try {
    response = await fetch(url, requestOptions);
  } catch (error) {
    notifyRequestOutcome({ libraryId: "", ok: false, status: 0, url });
    throw error;
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
  if (kind === "file") {
    return `/file/${encodeURIComponent(id)}`;
  }
  return `/api/items/${encodeURIComponent(id)}/${kind}`;
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
