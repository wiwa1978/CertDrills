import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createPostgresRateLimitStore } from "../../../src/modules/security/postgres-rate-limit-store";

describe("PostgreSQL rate-limit store", () => {
  it("hashes caller identity and returns the atomic upsert result", async () => {
    const values = vi.fn();
    const onConflictDoUpdate = vi.fn();
    const returning = vi.fn().mockResolvedValue([{ count: 3, resetAt: new Date("2026-08-09T12:01:00.000Z") }]);
    values.mockReturnValue({ onConflictDoUpdate });
    onConflictDoUpdate.mockReturnValue({ returning });
    const db = { insert: vi.fn(() => ({ values })) };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));

    const result = await createPostgresRateLimitStore(db as never).consume("login:203.0.113.10", { max: 2, windowMs: 60_000 });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      key: createHash("sha256").update("login:203.0.113.10").digest("hex"),
      count: 1,
    }));
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
    expect(result).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    vi.useRealTimers();
  });

  it("deletes expired distributed buckets", async () => {
    const returning = vi.fn().mockResolvedValue([{ key: "a" }, { key: "b" }]);
    const where = vi.fn(() => ({ returning }));
    const db = { delete: vi.fn(() => ({ where })) };

    await expect(createPostgresRateLimitStore(db as never).cleanupExpired()).resolves.toBe(2);
    expect(where).toHaveBeenCalledOnce();
  });
});
