import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt } from "./helpers";

export type PendingEmailStatus = "pending" | "sending" | "sent" | "failed";

export const pendingEmails = pgTable(
  "pending_emails",
  {
    id,
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text"),
    status: text("status").$type<PendingEmailStatus>().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    metadata: jsonb("metadata"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("pending_emails_status_next_attempt_idx").on(table.status, table.nextAttemptAt),
    index("pending_emails_created_idx").on(table.createdAt),
  ],
);
