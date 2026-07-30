import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/env", () => ({
  env: {
    TRUST_PROXY: false,
  },
}));

const { clearRequestGuardrailStateForTests, requestGuardrails } = await import("../../src/middleware/request-guardrails");

function buildApp() {
  const app = new Hono();
  app.use("/*", requestGuardrails);
  app.patch("/admin/discounts/discount-1", async (c) => c.json({ success: true, data: await c.req.json() }));
  app.post("/admin/verify-admin-secret", (c) => c.json({ success: true, data: { ok: true } }));
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
});
