import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/env", () => ({
  env: {
    APP_URL: "https://app.example.com",
    API_URL: "https://api.example.com",
    ADMIN_APP_URL: "https://admin.example.com",
    BETTER_AUTH_ALLOWED_ORIGINS: "https://partner.example.com",
  },
}));

const { originGuard } = await import("../../src/middleware/origin-guard");

function buildApp() {
  const app = new Hono();
  app.use("/*", originGuard);
  app.post("/me/settings", (c) => c.json({ success: true }));
  app.post("/payments/webhooks/dodo", (c) => c.json({ success: true }));
  return app;
}

describe("originGuard", () => {
  it("blocks cookie-authenticated unsafe requests without trusted origin", async () => {
    const res = await buildApp().request("/me/settings", {
      method: "POST",
      headers: {
        cookie: "better-auth.session_token=session-token",
        origin: "https://evil.example.com",
      },
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Forbidden origin",
      },
    });
  });

  it("allows trusted app, admin, api, and configured origins", async () => {
    for (const origin of [
      "https://app.example.com",
      "https://admin.example.com",
      "https://api.example.com",
      "https://partner.example.com",
    ]) {
      const res = await buildApp().request("/me/settings", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=session-token",
          origin,
        },
      });

      expect(res.status, origin).toBe(200);
    }
  });

  it("falls back to trusted referer when origin is absent", async () => {
    const res = await buildApp().request("/me/settings", {
      method: "POST",
      headers: {
        cookie: "__Secure-better-auth.session_token=session-token",
        referer: "https://admin.example.com/admin/users",
      },
    });

    expect(res.status).toBe(200);
  });

  it("does not block bearer or webhook requests", async () => {
    const bearerRes = await buildApp().request("/me/settings", {
      method: "POST",
      headers: {
        cookie: "better-auth.session_token=session-token",
        authorization: "Bearer token",
        origin: "https://evil.example.com",
      },
    });
    const webhookRes = await buildApp().request("/payments/webhooks/dodo", {
      method: "POST",
      headers: {
        cookie: "better-auth.session_token=session-token",
        origin: "https://evil.example.com",
      },
    });

    expect(bearerRes.status).toBe(200);
    expect(webhookRes.status).toBe(200);
  });
});
