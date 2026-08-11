import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { createPlatformDb, rateLimitBuckets } from "@platform/platform-db";

import type { RateLimitStore } from "../../middleware/request-guardrails";

type PlatformDb = ReturnType<typeof createPlatformDb>["db"];

export function createPostgresRateLimitStore(db: PlatformDb): RateLimitStore & { cleanupExpired: () => Promise<number> } {
  return {
    async consume(rawKey, rule) {
      const key = createHash("sha256").update(rawKey).digest("hex");
      const now = new Date();
      const nextResetAt = new Date(now.getTime() + rule.windowMs);
      const [bucket] = await db
        .insert(rateLimitBuckets)
        .values({ key, count: 1, resetAt: nextResetAt, updatedAt: now })
        .onConflictDoUpdate({
          target: rateLimitBuckets.key,
          set: {
            count: sql<number>`case when ${rateLimitBuckets.resetAt} <= ${sql.param(now, rateLimitBuckets.resetAt)} then 1 else ${rateLimitBuckets.count} + 1 end`,
            resetAt: sql<Date>`case when ${rateLimitBuckets.resetAt} <= ${sql.param(now, rateLimitBuckets.resetAt)} then ${sql.param(nextResetAt, rateLimitBuckets.resetAt)} else ${rateLimitBuckets.resetAt} end`,
            updatedAt: now,
          },
        })
        .returning({ count: rateLimitBuckets.count, resetAt: rateLimitBuckets.resetAt });

      if (!bucket) throw new Error("Failed to consume rate-limit bucket");

      return {
        allowed: bucket.count <= rule.max,
        remaining: Math.max(0, rule.max - bucket.count),
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000)),
      };
    },

    async cleanupExpired() {
      const deleted = await db
        .delete(rateLimitBuckets)
        .where(sql`${rateLimitBuckets.resetAt} <= now()`)
        .returning({ key: rateLimitBuckets.key });
      return deleted.length;
    },
  };
}
