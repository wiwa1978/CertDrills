import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createRequireAdminAccess } from "@platform/auth-core";

type TestUser = {
  id: string;
  role: string;
  email: string;
  twoFactorEnabled: boolean;
};

function createApp({
  totpRequired,
  user = { id: "admin-1", role: "admin", email: "admin@example.com", twoFactorEnabled: false },
  session = null,
  actor = null,
}: {
  totpRequired: boolean;
  user?: TestUser;
  session?: unknown;
  actor?: TestUser | null;
}) {
  const app = new Hono();
  const findById = vi.fn(async (userId: string) => userId === actor?.id ? actor : null);
  const requireAdminAccess = createRequireAdminAccess({
    allowlist: new Set(["admin@example.com"]),
    totpRequired,
    users: { findById },
  });

  app.use("/*", async (c, next) => {
    c.set("authUser" as never, user as never);
    c.set("authSession" as never, session as never);
    await next();
  });
  app.get("/admin", requireAdminAccess as never, (c) => c.json({ success: true }));

  return { app, findById };
}

describe("admin TOTP policy", () => {
  it("allows an eligible admin without 2FA when the policy is disabled", async () => {
    const response = await createApp({ totpRequired: false }).app.request("/admin");

    expect(response.status).toBe(200);
  });

  it("requires 2FA enrollment when the policy is enabled", async () => {
    const response = await createApp({ totpRequired: true }).app.request("/admin");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "TWO_FACTOR_REQUIRED" },
      redirectTo: "/settings?reason=totp-required",
    });
  });

  it("allows an impersonated target when the persisted actor retains admin access", async () => {
    const actor = { id: "actor-1", role: "admin", email: " ADMIN@example.com ", twoFactorEnabled: true };
    const { app, findById } = createApp({
      totpRequired: true,
      user: { id: "target-1", role: "user", email: "target@example.com", twoFactorEnabled: false },
      session: { impersonatedBy: actor.id },
      actor,
    });

    expect((await app.request("/admin")).status).toBe(200);
    expect(findById).toHaveBeenCalledWith("actor-1");
  });

  it.each([
    ["missing", null],
    ["demoted", { id: "actor-1", role: "user", email: "admin@example.com", twoFactorEnabled: true }],
    ["non-allowlisted", { id: "actor-1", role: "admin", email: "other@example.com", twoFactorEnabled: true }],
  ])("rejects an impersonated target when the actor is %s", async (_case, actor) => {
    const { app } = createApp({
      totpRequired: true,
      user: { id: "target-1", role: "user", email: "target@example.com", twoFactorEnabled: false },
      session: { impersonatedBy: "actor-1" },
      actor,
    });

    const response = await app.request("/admin");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("requires TOTP enrollment on the persisted impersonating actor", async () => {
    const { app } = createApp({
      totpRequired: true,
      user: { id: "target-1", role: "user", email: "target@example.com", twoFactorEnabled: false },
      session: { impersonatedBy: "actor-1" },
      actor: { id: "actor-1", role: "admin", email: "admin@example.com", twoFactorEnabled: false },
    });

    const response = await app.request("/admin");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "TWO_FACTOR_REQUIRED" } });
  });

});
