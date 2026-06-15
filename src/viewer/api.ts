export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
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
  const response = await fetch(url, options);
  const data = await safeJson(response);
  if (!response.ok) throw new ApiError(response.status, responseErrorMessage(data, response.status));
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

export function mediaUrl(id: string, kind: string) {
  if (kind === "file") {
    return `/file/${encodeURIComponent(id)}`;
  }
  return `/api/items/${encodeURIComponent(id)}/${kind}`;
}

export function debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, wait: number) {
  let timer = 0;
  return (...args: TArgs) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
