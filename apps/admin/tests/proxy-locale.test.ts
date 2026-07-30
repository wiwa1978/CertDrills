import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: () => null,
}));

vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response(null, { status: 204 }),
}));

describe("proxy locale parsing", () => {
  it("allows authenticated admin routes when admin status is valid", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8877";
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            message: "Admin access granted.",
          },
        }),
      }),
    );

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(response.status).toBe(204);
  });

  it("uses NEXT_PUBLIC_API_URL for server-side admin session checks", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://public-api.example";
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(fetchMock).toHaveBeenCalledWith("http://public-api.example/admin/status", expect.any(Object));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/fr/login");
  });

  it("does not expose admin unavailable reasons in login redirects", async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/nl/admin/certdrill"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/nl/login");
  });

  it("redirects localized protected routes to the same locale login", async () => {
    vi.resetModules();
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => null,
    }));

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/fr/login?callbackUrl=%2Ffr%2Fadmin%2Foverview",
    );
  });

});
