import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, errorMessage, getJson } from "./api";

describe("viewer API helpers", () => {
  afterEach(() => {
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
});
