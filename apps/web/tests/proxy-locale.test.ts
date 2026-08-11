import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: () => null,
}));

vi.mock("next-intl/middleware", () => ({
  default: () => () => new Response(null, { status: 204 }),
}));

describe("proxy locale parsing", () => {
  it("redirects localized protected routes to the same locale login", async () => {
    const { proxy } = await import("../src/proxy");
    const response = proxy(new NextRequest("http://localhost/nl/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/nl/login?callbackUrl=%2Fnl%2Fdashboard",
    );
  });

  it("redirects alternate production hosts to the canonical app origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://certdrills-web.wimwauters.be");

    try {
      const { proxy } = await import("../src/proxy");
      const response = proxy(new NextRequest(
        "https://certdrills-web.example.azurecontainerapps.io/nl/login?callbackUrl=%2Fnl%2Fdashboard",
      ));

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://certdrills-web.wimwauters.be/nl/login?callbackUrl=%2Fnl%2Fdashboard",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
