import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/env", () => ({
  env: {
    TRUST_PROXY: false,
  },
}));

const { clearRequestGuardrailStateForTests, createRequestGuardrails, requestGuardrails, resolveClientIdentity } = await import("../../src/middleware/request-guardrails");

function buildApp() {
  const app = new Hono();
  app.use("/*", requestGuardrails);
  app.patch("/admin/discounts/discount-1", async (c) => c.json({ success: true, data: await c.req.json() }));
  app.post("/admin/verify-admin-secret", (c) => c.json({ success: true, data: { ok: true } }));
  app.post("/auth/dodopayments/webhooks", (c) => c.json({ success: true }));
  app.post("/auth/sign-in/email", (c) => c.json({ success: true }));
  app.post("/admin-auth/sign-in/email", (c) => c.json({ success: true }));
  app.post("/admin-auth/admin/stop-impersonating", (c) => c.json({ success: true }));
  app.post("/admin/payments/checkout", (c) => c.json({ success: true }));
  app.post("/admin/me/vouchers/redeem", (c) => c.json({ success: true }));
  app.post("/admin/me/notifications/notification-1/read", (c) => c.json({ success: true }));
  return app;
}

describe("requestGuardrails", () => {
  beforeEach(() => {
    clearRequestGuardrailStateForTests();
  });

  it("applies JSON body size limits to PATCH routes", async () => {
    const res = await buildApp().request("/admin/discounts/discount-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", "content-length": String(70 * 1024) },
      body: JSON.stringify({ code: "X" }),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("returns the nested error envelope for unsupported content type", async () => {
    const res = await buildApp().request("/admin/verify-admin-secret", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "secret=test",
    });

    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: { code: "BAD_REQUEST", message: "Unsupported content type" },
    });
  });

  it("limits Better Auth webhook bodies without requiring content type", async () => {
    const res = await buildApp().request("/auth/dodopayments/webhooks", {
      method: "POST",
      body: new Uint8Array(256 * 1024 + 1),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rate limits admin sign-in after 20 requests", async () => {
    const app = buildApp();
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "password" }),
    };

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect((await app.request("/admin-auth/sign-in/email", init)).status).toBe(200);
    }

    expect((await app.request("/admin-auth/sign-in/email", init)).status).toBe(429);
  });

  it("preserves required JSON handling for public sign-in without a body", async () => {
    const res = await buildApp().request("/auth/sign-in/email", { method: "POST" });

    expect(res.status).toBe(415);
  });

  it("applies the public checkout body limit to admin checkout", async () => {
    const res = await buildApp().request("/admin/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(9 * 1024) },
      body: "{}",
    });

    expect(res.status).toBe(413);
  });

  it("applies the public voucher rate limit to admin voucher redemption", async () => {
    const app = buildApp();
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: "{}" };

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect((await app.request("/admin/me/vouchers/redeem", init)).status).toBe(200);
    }

    expect((await app.request("/admin/me/vouchers/redeem", init)).status).toBe(429);
  });

  it.each([
    "/admin/payments/checkout",
    "/admin/me/vouchers/redeem",
    "/admin-auth/admin/stop-impersonating",
  ])("requires JSON content type for mirrored admin route %s", async (path) => {
    const res = await buildApp().request(path, { method: "POST", body: "{}" });

    expect(res.status).toBe(415);
  });

  it("enforces guardrails contributed by product modules", async () => {
    const app = new Hono();
    app.use("/*", createRequestGuardrails({
      rateLimitStore: { consume: vi.fn() },
      trustProxy: false,
      additionalGuardrails: [{ method: "POST", path: /^\/catalog\/import$/, maxBodyBytes: 16 }],
    }));
    app.post("/catalog/import", (c) => c.json({ success: true }));

    const response = await app.request("/catalog/import", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "17" },
      body: "{}",
    });

    expect(response.status).toBe(413);
  });
});

describe("resolveClientIdentity", () => {
  it("ignores spoofable forwarding headers when proxy trust is disabled", () => {
    expect(resolveClientIdentity(new Headers({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.20",
      "x-real-ip": "192.0.2.30",
    }), false)).toBe("direct-client");
  });

  it("uses the configured trusted hop from the right of the forwarding chain", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.20, 192.0.2.30" });
    expect(resolveClientIdentity(headers, true, 2)).toBe("198.51.100.20");
    expect(resolveClientIdentity(headers, true, 1)).toBe("192.0.2.30");
  });
});
