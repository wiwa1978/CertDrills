import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, updatedAt } from "./helpers";

export const applicationSettings = pgTable("application_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  valueType: text("value_type").$type<"number">().notNull(),
  description: text("description"),
  updatedByUserId: uuid("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt,
  updatedAt,
}, (table) => [
  index("application_settings_updated_by_user_id_idx").on(table.updatedByUserId),
]);
