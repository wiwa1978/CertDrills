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
  app.post("/admin", (c) => c.json({ success: true }));
  app.post("/admin-auth", (c) => c.json({ success: true }));
  app.post("/admin-auth/sign-in/email", (c) => c.json({ success: true }));
  app.post("/admin/me/notifications/read-all", (c) => c.json({ success: true }));
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

  it.each([
    "better-auth-admin.session_token=admin-token",
    "__Secure-better-auth-admin.session_token=admin-token",
  ])("blocks unsafe evil-origin requests with admin cookie %s", async (cookie) => {
    const res = await buildApp().request("/me/settings", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example.com" },
    });

    expect(res.status).toBe(403);
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

  it("retains all configured public referer origins", async () => {
    for (const referer of [
      "https://app.example.com/settings",
      "https://admin.example.com/admin/users",
      "https://api.example.com/me/settings",
      "https://partner.example.com/settings",
    ]) {
      const res = await buildApp().request("/me/settings", {
        method: "POST",
        headers: {
          cookie: "__Secure-better-auth.session_token=session-token",
          referer,
        },
      });

      expect(res.status, referer).toBe(200);
    }
  });

  it.each(["origin", "referer"] as const)("narrows admin request trust for the %s header", async (header) => {
    const app = buildApp();
    const request = (value: string) => app.request("/admin/me/notifications/read-all", {
      method: "POST",
      headers: {
        cookie: "better-auth-admin.session_token=admin-token",
        [header]: header === "referer" ? `${value}/settings` : value,
      },
    });

    expect((await request("https://app.example.com")).status).toBe(403);
    expect((await request("https://admin.example.com")).status).toBe(200);
    expect((await request("https://api.example.com")).status).toBe(200);
  });

  it.each([
    "/admin",
    "/admin/me/notifications/read-all",
    "/admin-auth",
    "/admin-auth/sign-in/email",
  ])("narrows unsafe requests on admin namespace path %s", async (path) => {
    const res = await buildApp().request(path, {
      method: "POST",
      headers: {
        cookie: "better-auth-admin.session_token=admin-token",
        origin: "https://partner.example.com",
      },
    });

    expect(res.status).toBe(403);
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
