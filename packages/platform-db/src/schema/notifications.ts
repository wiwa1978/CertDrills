import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export const notification = pgTable(
  "notification",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").default("info").notNull(),
    category: text("category").notNull(),
    read: boolean("read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    showAsBanner: boolean("show_as_banner").default(false).notNull(),
    bannerExpiresAt: timestamp("banner_expires_at", { withTimezone: true }),
    data: jsonb("data"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("notification_user_idx").on(table.userId),
    index("notification_user_unread_idx").on(table.userId, table.read),
  ],
);
