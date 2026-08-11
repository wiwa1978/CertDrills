import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { rateLimitBuckets } from "@platform/platform-db";

import { createPostgresRateLimitStore } from "../../src/modules/security/postgres-rate-limit-store";
import { fixtureToken, openTestDatabase, rateLimitKey } from "../support/database";

const rawKeys = new Set<string>();
let database: ReturnType<typeof openTestDatabase>;

function testKey(label: string) {
  const key = fixtureToken(`integration-rate-limit-${label}`);
  rawKeys.add(key);
  return key;
}

describe("PostgreSQL rate-limit store integration", () => {
  beforeAll(() => {
    database = openTestDatabase();
  });

  afterEach(async () => {
    const keys = [...rawKeys].map(rateLimitKey);
    rawKeys.clear();
    if (keys.length > 0) {
      await database.db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.key, keys));
    }
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("atomically enforces a shared limit under concurrent requests", async () => {
    const key = testKey("concurrency");
    const store = createPostgresRateLimitStore(database.db);

    const results = await Promise.all(
      Array.from({ length: 12 }, () => store.consume(key, { max: 5, windowMs: 60_000 })),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(7);

    const [bucket] = await database.db
      .select({ count: rateLimitBuckets.count })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, rateLimitKey(key)));
    expect(bucket?.count).toBe(12);
  });

  it("starts a new window after the stored bucket expires", async () => {
    const key = testKey("expiry");
    const store = createPostgresRateLimitStore(database.db);

    await store.consume(key, { max: 1, windowMs: 60_000 });
    await database.db
      .update(rateLimitBuckets)
      .set({ resetAt: new Date(Date.now() - 1_000) })
      .where(eq(rateLimitBuckets.key, rateLimitKey(key)));

    await expect(store.consume(key, { max: 1, windowMs: 60_000 })).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });

    const [bucket] = await database.db
      .select({ count: rateLimitBuckets.count })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.key, rateLimitKey(key)));
    expect(bucket?.count).toBe(1);
  });
});
