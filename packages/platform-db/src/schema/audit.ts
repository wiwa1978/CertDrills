import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id } from "./helpers";

export const auditEntries = pgTable(
  "audit_entries",
  {
    id,
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    actorId: uuid("actor_id").references(() => user.id, { onDelete: "set null" }),
    targetType: text("target_type"),
    targetId: text("target_id"),
    requestId: text("request_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    createdAt,
  },
  (table) => [
    index("audit_entries_action_idx").on(table.action),
    index("audit_entries_actor_idx").on(table.actorId),
    index("audit_entries_target_idx").on(table.targetType, table.targetId),
    index("audit_entries_created_at_idx").on(table.createdAt),
  ],
);
