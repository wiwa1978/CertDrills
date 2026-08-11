import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./helpers";

export type BackgroundEventStatus = "pending" | "publishing" | "published" | "failed";

export const backgroundEvents = pgTable(
  "background_events",
  {
    id,
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").$type<BackgroundEventStatus>().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    inngestEventId: text("inngest_event_id"),
    lastError: text("last_error"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("background_events_dedupe_key_idx").on(table.dedupeKey),
    index("background_events_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
    check("background_events_status_check", sql`${table.status} in ('pending', 'publishing', 'published', 'failed')`),
    check("background_events_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check("background_events_lock_consistent", sql`(${table.status} = 'publishing') = (${table.lockedAt} is not null and ${table.lockedBy} is not null)`),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    updatedAt,
  },
  (table) => [index("rate_limit_buckets_reset_at_idx").on(table.resetAt)],
);
