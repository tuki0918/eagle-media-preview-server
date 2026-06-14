export async function getJson(url: string) {
  return requestJson(url);
}

export async function postJson(url: string, body: unknown) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
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
