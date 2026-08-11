CREATE TABLE "background_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_name" text NOT NULL,
  "payload" jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "published_at" timestamp with time zone,
  "inngest_event_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "background_events_status_check" CHECK ("status" IN ('pending', 'publishing', 'published', 'failed')),
  CONSTRAINT "background_events_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "background_events_lock_consistent" CHECK (("status" = 'publishing') = ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "background_events_dedupe_key_idx" ON "background_events" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "background_events_status_next_attempt_idx" ON "background_events" USING btree ("status", "next_attempt_at");
--> statement-breakpoint
ALTER TABLE "pending_emails" RENAME TO "email_deliveries";
--> statement-breakpoint
ALTER TABLE "email_deliveries" DROP CONSTRAINT "pending_emails_status_check";
ALTER TABLE "email_deliveries" DROP CONSTRAINT "pending_emails_attempts_check";
ALTER TABLE "email_deliveries" DROP CONSTRAINT "pending_emails_lock_consistent";
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD COLUMN "last_attempt_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "email_deliveries"
SET "last_attempt_at" = "updated_at"
WHERE "attempts" > 0 AND "last_attempt_at" IS NULL;
--> statement-breakpoint
DROP INDEX "pending_emails_created_idx";
DROP INDEX "pending_emails_status_locked_at_idx";
DROP INDEX "pending_emails_status_next_attempt_idx";
--> statement-breakpoint
CREATE INDEX "email_deliveries_status_created_idx" ON "email_deliveries" USING btree ("status", "created_at");
CREATE INDEX "email_deliveries_to_created_idx" ON "email_deliveries" USING btree ("to", "created_at");
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed')) NOT VALID;
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_attempts_nonnegative" CHECK ("attempts" >= 0) NOT VALID;
ALTER TABLE "email_deliveries" VALIDATE CONSTRAINT "email_deliveries_status_check";
ALTER TABLE "email_deliveries" VALIDATE CONSTRAINT "email_deliveries_attempts_nonnegative";
--> statement-breakpoint
ALTER TABLE "user_data_export_request" ADD COLUMN "storage_key" text;
--> statement-breakpoint
ALTER TABLE "credit_usage_events" DROP CONSTRAINT "credit_usage_events_user_id_fkey";
ALTER TABLE "credit_usage_events" DROP CONSTRAINT "credit_usage_events_transaction_id_fkey";
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_fkey";
ALTER TABLE "transaction_entitlements" DROP CONSTRAINT "transaction_entitlements_order_item_id_transaction_order_items_";
ALTER TABLE "user_data_export_request" DROP CONSTRAINT "user_data_export_request_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_usage_events" ADD CONSTRAINT "credit_usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "credit_usage_events" ADD CONSTRAINT "credit_usage_events_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "transaction_entitlements" ADD CONSTRAINT "transaction_entitlements_order_item_id_transaction_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."transaction_order_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_data_export_request" ADD CONSTRAINT "user_data_export_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
