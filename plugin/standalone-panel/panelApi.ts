const tokenKey = "standalone-panel-token";
const launchToken = location.hash.slice(1);
if (launchToken) {
  sessionStorage.setItem(tokenKey, launchToken);
  history.replaceState(null, "", location.pathname);
}
const token = launchToken || sessionStorage.getItem(tokenKey);

export async function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token || ""}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error);
  }
  return response;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function postJson(path: string, body: unknown) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
