import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, debounce, errorMessage, getJson, postJson } from "./api";

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
