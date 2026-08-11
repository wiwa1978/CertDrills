import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "better-auth-admin.session_token=admin-token" }),
}));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_API_URL: "http://localhost:8787",
    NEXT_PUBLIC_APP_URL: "http://localhost:3101",
  },
}));
vi.mock("@platform/frontend-shared", () => ({
  normalizeBaseUrl: (url: string) => url.replace(/\/$/, ""),
  createApiRequest: () => mocks.request,
}));

describe("admin-local API paths", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockResolvedValue({ success: true });
  });

  it.each([
    ["/me", "/admin/me"],
    ["/me/session", "/admin/me/session"],
    ["/payments/checkout", "/admin/payments/checkout"],
    ["/admin/status", "/admin/status"],
    ["/health", "/health"],
  ])("rewrites client path %s to %s", async (input, expected) => {
    const { apiRequest } = await import("../../src/lib/api/client");
    await apiRequest(input);
    expect(mocks.request).toHaveBeenLastCalledWith(expected, undefined);
  });

  it.each([
    ["/me", "/admin/me"],
    ["/me/session", "/admin/me/session"],
    ["/payments/checkout", "/admin/payments/checkout"],
    ["/admin/status", "/admin/status"],
  ])("rewrites server path %s to %s", async (input, expected) => {
    const { serverApiRequest } = await import("../../src/lib/api/client.server");
    await serverApiRequest(input);
    expect(mocks.request).toHaveBeenLastCalledWith(expected, undefined);
  });
});
