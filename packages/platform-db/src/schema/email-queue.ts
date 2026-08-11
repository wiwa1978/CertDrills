import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./helpers";

export type EmailDeliveryStatus = "pending" | "sending" | "sent" | "failed";

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id,
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text"),
    status: text("status").$type<EmailDeliveryStatus>().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    metadata: jsonb("metadata"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("email_deliveries_status_created_idx").on(table.status, table.createdAt),
    index("email_deliveries_to_created_idx").on(table.to, table.createdAt),
    check("email_deliveries_status_check", sql`${table.status} in ('pending', 'sending', 'sent', 'failed')`),
    check("email_deliveries_attempts_nonnegative", sql`${table.attempts} >= 0`),
  ],
);
