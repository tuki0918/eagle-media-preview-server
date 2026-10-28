import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => vi.useRealTimers());

async function setup(cached: Response | undefined, fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("Server stopped"))) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const match = vi.fn().mockImplementation(async () => cached?.clone());
  runInNewContext(await readFile(new URL("./service-worker.js", import.meta.url), "utf8"), {
    self: { addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, location: { origin: "http://localhost" } },
    caches: { open: async () => ({ match, put: vi.fn() }) },
    fetch: fetcher, URL, Response, AbortController, setTimeout, clearTimeout,
  });
  const request = (path: string, mode = "navigate") => {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: { url: `http://localhost${path}`, method: "GET", mode }, respondWith: (result: Promise<Response>) => { response = result; } });
    return response;
  };
  return { request, match, fetcher };
}

test("serves the cached startup screen and bundle when the server is unavailable", async () => {
  const worker = await setup(new Response("cached shell"));
  expect(await (await worker.request("/"))?.text()).toBe("cached shell");
  expect(worker.match).toHaveBeenCalledWith("/index.html");
  expect(await (await worker.request("/app.js", "cors"))?.text()).toBe("cached shell");
  expect(worker.request("/api/auth/status")).toBeUndefined();
  expect(worker.request("/file/private-item")).toBeUndefined();
});

test("provides a readable retry page when the shell cache is missing", async () => {
  const worker = await setup(undefined);
  const response = await worker.request("/");
  expect(response?.status).toBe(503);
  expect(await response?.text()).toContain("Retry");
});

test("falls back to the shell on a server error response", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Bad gateway", { status: 503 }));
  const worker = await setup(new Response("cached shell"), fetcher);
  expect(await (await worker.request("/"))?.text()).toBe("cached shell");
});

test("bounds stalled network requests before restoring the cached shell", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_request, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("Timed out")));
  }));
  const worker = await setup(new Response("cached shell"), fetcher);
  const response = worker.request("/");
  await vi.advanceTimersByTimeAsync(4000);
  expect(await (await response)?.text()).toBe("cached shell");
});
