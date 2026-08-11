import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createApiKeyOrSessionAuth } from "../../src/middleware/api-key-auth";
import { createApiKeysService } from "../../src/modules/api-keys/service";

describe("scoped API keys", () => {
  it("stores only a hash and returns the plaintext key once", async () => {
    let inserted: Record<string, unknown> | undefined;
    const row = {
      id: "key-1", userId: "user-1", name: "Automation", keyPrefix: "placeholder", keyHash: "placeholder", scopes: ["read:billing"],
      lastUsedAt: null, expiresAt: null, revokedAt: null, createdAt: new Date("2026-08-09T12:00:00.000Z"), updatedAt: new Date("2026-08-09T12:00:00.000Z"),
    };
    const db = {
      insert: vi.fn(() => ({ values: vi.fn((value) => {
        inserted = value;
        return { returning: vi.fn().mockResolvedValue([{ ...row, ...value }]) };
      }) })),
    };
    const result = await createApiKeysService({ db: db as never }).create({ userId: "user-1", name: "Automation", scopes: ["read:billing"] });

    expect(result.plaintextKey).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
    expect(inserted?.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted?.keyHash).not.toBe(result.plaintextKey);
    expect(inserted?.keyPrefix).toBe(result.plaintextKey.slice(0, 10));
  });

  it("enforces route scopes and rejects API keys on mutation routes", async () => {
    const authenticate = vi.fn().mockResolvedValue({ userId: "user-1", scopes: ["read:billing"] });
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: "user-1", role: "user", email: "user@example.com", twoFactorEnabled: false }]) })) })) })),
    };
    const sessionAuth = vi.fn(async (_c, next) => next());
    const app = new Hono();
    app.use("*", createApiKeyOrSessionAuth({ db: db as never, apiKeysService: { authenticate } as never, sessionAuth: sessionAuth as never }) as never);
    app.get("/me/transaction-orders", (c) => c.json({ success: true }));
    app.post("/me/transaction-basket/checkout", (c) => c.json({ success: true }));
    app.get("/me/credits/balance", (c) => c.json({ success: true }));

    expect((await app.request("/me/transaction-orders", { headers: { authorization: "Bearer sk_valid" } })).status).toBe(200);
    expect((await app.request("/me/transaction-basket/checkout", { method: "POST", headers: { authorization: "Bearer sk_valid" } })).status).toBe(403);
    expect((await app.request("/me/credits/balance", { headers: { authorization: "Bearer sk_valid" } })).status).toBe(403);
    expect(sessionAuth).not.toHaveBeenCalled();
  });
});
