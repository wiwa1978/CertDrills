import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, createApiRequest, createBearerApiRequest } from "../src/api-client";

describe("frontend shared API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults cookie requests to no-store", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await request("/me/session");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/me/session", expect.objectContaining({
      cache: "no-store",
      credentials: "include",
    }));
  });

  it("allows per-request cache options", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await request("/public/countries", { cache: "force-cache" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/public/countries", expect.objectContaining({
      cache: "force-cache",
    }));
  });

  it("adds bearer authorization without cookies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createBearerApiRequest({ baseURL: "https://api.example.test", getToken: () => "token-123" });

    await request("/mobile/me");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("keeps bearer requests cookie-free when credentials are provided per request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createBearerApiRequest({ baseURL: "https://api.example.test", getToken: () => "token-123" });

    await request("/mobile/me", { credentials: "include" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
  });

  it("uses nested API error code and message from failed responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid payload",
      },
      requestId: "req-123",
    }), { status: 400 }));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await expect(request("/bad", { method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 400,
      message: "API request failed (400): Invalid payload",
      errorCode: "VALIDATION_FAILED",
      requestId: "req-123",
      digest: "VALIDATION_FAILED",
    } satisfies Partial<ApiRequestError>);
  });

  it("preserves structured details for a 409 import conflict response", async () => {
    const details = {
      documentHash: "a".repeat(64),
      rows: [{ sourceIndex: 0, valid: true, duplicate: { existingQuestionIds: ["q-1"], earlierSourceIndexes: [] } }],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: false,
      error: {
        code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
        message: "Question import selection no longer matches the current preview. Review the refreshed preview.",
        details,
      },
      requestId: "req-789",
    }), { status: 409 }));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await expect(request("/admin/certdrill/questions/import", { method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 409,
      errorCode: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
      requestId: "req-789",
      details,
    } satisfies Partial<ApiRequestError>);
  });
});
