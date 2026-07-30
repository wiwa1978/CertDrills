import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/env", () => ({
  env: {
    NODE_ENV: "production",
  },
}));

const { securityHeaders } = await import("../../src/middleware/security-headers");

describe("securityHeaders", () => {
  it("sets baseline hardening headers", async () => {
    const app = new Hono();
    app.use("/*", securityHeaders);
    app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));

    const res = await app.request("/health");

    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });
});
