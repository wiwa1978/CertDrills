import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export type ApiKeyScope = "read:profile" | "read:billing" | "read:credits";

export const apiKeys = pgTable(
  "api_keys",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").array().$type<ApiKeyScope[]>().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("api_keys_hash_idx").on(table.keyHash),
    index("api_keys_user_created_idx").on(table.userId, table.createdAt),
    index("api_keys_user_revoked_idx").on(table.userId, table.revokedAt),
  ],
);
