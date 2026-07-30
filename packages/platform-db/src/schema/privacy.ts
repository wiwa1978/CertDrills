import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export type UserDataExportStatus = "pending" | "ready" | "downloaded" | "expired" | "failed";

export const userDataExportRequests = pgTable(
  "user_data_export_request",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<UserDataExportStatus>().default("pending").notNull(),
    fileName: text("file_name"),
    fileSizeBytes: integer("file_size_bytes"),
    downloadTokenHash: text("download_token_hash"),
    exportData: jsonb("export_data"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    failedReason: text("failed_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("user_data_export_request_user_created_idx").on(table.userId, table.createdAt),
    index("user_data_export_request_status_expires_idx").on(table.status, table.expiresAt),
    uniqueIndex("user_data_export_request_token_idx").on(table.downloadTokenHash),
    uniqueIndex("user_data_export_request_active_user_idx")
      .on(table.userId)
      .where(sql`${table.status} IN ('pending', 'ready')`),
  ],
);
