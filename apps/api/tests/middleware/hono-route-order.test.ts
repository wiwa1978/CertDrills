import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

describe("Hono route ordering", () => {
  it("does not run middleware registered after an already matched route", async () => {
    const middleware = vi.fn(async (_c, next) => next());
    const app = new Hono();
    app.post("/admin-auth/admin/stop-impersonating", (c) => c.json({ success: true }));
    app.use("/admin-auth/admin/*", middleware);

    const res = await app.request("/admin-auth/admin/stop-impersonating", { method: "POST" });

    expect(res.status).toBe(200);
    expect(middleware).not.toHaveBeenCalled();
  });
});
