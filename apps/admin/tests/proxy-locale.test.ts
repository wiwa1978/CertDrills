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
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3302";
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

  it("redirects to a clean localized login when NEXT_PUBLIC_API_URL is missing", async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/nl/admin/overview"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/nl/login");
  });

  it("redirects to a clean localized login when the admin status request throws", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3302";
    vi.doMock("better-auth/cookies", () => ({
      getSessionCookie: () => "session-token",
    }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Admin API unavailable")));

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/nl/admin/overview"));

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

  it("requests only the admin session cookie prefix", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:3302";
    const getSessionCookie = vi.fn(() => "admin-session-token");
    vi.doMock("better-auth/cookies", () => ({ getSessionCookie }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { proxy } = await import("../src/proxy");
    await proxy(new NextRequest("http://localhost/fr/admin/overview"));

    expect(getSessionCookie).toHaveBeenCalledWith(expect.anything(), { cookiePrefix: "better-auth-admin" });
  });

  it("redirects a public-only session without fetching admin status", async () => {
    vi.resetModules();
    const getSessionCookie = vi.fn((_request, options?: { cookiePrefix?: string }) => (
      options?.cookiePrefix === "better-auth-admin" ? null : "public-session-token"
    ));
    vi.doMock("better-auth/cookies", () => ({ getSessionCookie }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { proxy } = await import("../src/proxy");
    const response = await proxy(new NextRequest("http://localhost/fr/admin/overview", {
      headers: { cookie: "better-auth.session_token=public-session-token" },
    }));

    expect(response.status).toBe(307);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects alternate production hosts to the canonical admin origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://certdrills-admin.wimwauters.be");

    try {
      const { proxy } = await import("../src/proxy");
      const response = await proxy(new NextRequest(
        "https://certdrills-admin.example.azurecontainerapps.io/nl/login?callbackUrl=%2Fnl%2Fadmin",
      ));

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://certdrills-admin.wimwauters.be/nl/login?callbackUrl=%2Fnl%2Fadmin",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not redirect a canonical host forwarded by the platform proxy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://certdrills-admin.wimwauters.be");

    try {
      const { proxy } = await import("../src/proxy");
      const response = await proxy(new NextRequest("https://internal-container/nl/login", {
        headers: { "x-forwarded-host": "certdrills-admin.wimwauters.be" },
      }));

      expect(response.status).toBe(204);
    } finally {
      vi.unstubAllEnvs();
    }
  });

});
