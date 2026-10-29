import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, debounce, errorMessage, getJson, postJson, subscribeRequestOutcome, type RequestOutcome } from "./api";

describe("viewer API helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("throws ApiError with response status and server message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Authentication required" }),
    } as Response);

    await expect(getJson("/api/items")).rejects.toMatchObject({
      message: "Authentication required",
      name: "ApiError",
      status: 401,
    } satisfies Partial<ApiError>);
  });

  test("notifies request outcomes, including network failures", async () => {
    const outcomes: RequestOutcome[] = [];
    const unsubscribe = subscribeRequestOutcome((outcome) => outcomes.push(outcome));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers({ "X-Library-Id": "lib-a" }), json: async () => ({}) } as Response);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "Unable to connect to Eagle API" }) } as Response);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await getJson("/api/items");
    await expect(getJson("/api/folders")).rejects.toBeInstanceOf(ApiError);
    await expect(getJson("/api/tags")).rejects.toThrow("Failed to fetch");
    unsubscribe();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    await getJson("/api/items");

    expect(outcomes).toEqual([
      { libraryId: "lib-a", ok: true, status: 200, url: "/api/items" },
      { libraryId: "", ok: false, status: 502, url: "/api/folders" },
      { libraryId: "", ok: false, status: 0, url: "/api/tags" },
    ]);
  });

  test("sends same-origin credentials with JSON requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    await getJson("/api/auth/status");
    await postJson("/api/auth/login", { username: "eagle", password: "secret" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/status", {
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "eagle", password: "secret" }),
      credentials: "same-origin",
    });
  });

  test("throws ApiError with response status when the error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);

    await expect(getJson("/api/items")).rejects.toMatchObject({
      message: "HTTP 502",
      name: "ApiError",
      status: 502,
    } satisfies Partial<ApiError>);
  });

  test("normalizes unknown thrown values to display messages", () => {
    expect(errorMessage(new Error("Boom"))).toBe("Boom");
    expect(errorMessage("plain failure")).toBe("plain failure");
  });

  test("cancels a pending debounced call", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const debounced = debounce(callback, 220);

    debounced("stale query");
    debounced.cancel();
    vi.advanceTimersByTime(220);

    expect(callback).not.toHaveBeenCalled();
  });
});
