INSERT INTO "certdrill_exam_entitlements" (
  "id", "user_id", "exam_key", "price_cents", "status", "purchased_at", "consumed_at", "refunded_at", "created_at", "updated_at"
)
SELECT "id", "user_id", "exam_key", "price_cents", "status", "purchased_at", "consumed_at", "refunded_at", "created_at", "updated_at"
FROM "exam_entitlements"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
DROP TABLE "exam_entitlements";
--> statement-breakpoint
UPDATE "jobs" SET "locked_at" = NULL, "locked_by" = NULL WHERE "status" <> 'running';
--> statement-breakpoint
UPDATE "jobs" SET "status" = 'idle', "next_run_at" = now(), "locked_at" = NULL, "locked_by" = NULL WHERE "status" = 'running' AND ("locked_at" IS NULL OR "locked_by" IS NULL);
--> statement-breakpoint
UPDATE "pending_emails" SET "status" = 'pending', "next_attempt_at" = now(), "locked_at" = NULL, "locked_by" = NULL WHERE "status" = 'sending';
--> statement-breakpoint
UPDATE "pending_emails" SET "attempts" = GREATEST(0, LEAST("attempts", "max_attempts")), "max_attempts" = GREATEST(1, "max_attempts");
--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_status_check" CHECK ("payment_status" IN ('pending', 'completed', 'failed', 'refunded')) NOT VALID;
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_amounts_nonnegative" CHECK ("credits" >= 0 AND "bonus_credits" >= 0 AND "price" >= 0 AND "price_excl_vat" >= 0 AND "price_incl_vat" >= 0 AND "vat_amount" >= 0) NOT VALID;
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_total_consistent" CHECK ("price_incl_vat" = "price_excl_vat" + "vat_amount") NOT VALID;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_status_check" CHECK ("processing_status" IN ('processing', 'processed', 'failed', 'dead_lettered')) NOT VALID;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_retry_nonnegative" CHECK ("retry_count" >= 0) NOT VALID;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_duration_nonnegative" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0) NOT VALID;
ALTER TABLE "checkout_intents" ADD CONSTRAINT "checkout_intents_billing_mode_check" CHECK ("billing_mode" IN ('credits', 'subscriptions', 'transactions')) NOT VALID;
ALTER TABLE "checkout_intents" ADD CONSTRAINT "checkout_intents_status_check" CHECK ("status" IN ('pending', 'completed', 'failed', 'cancelled', 'expired')) NOT VALID;
ALTER TABLE "transaction_baskets" ADD CONSTRAINT "transaction_baskets_status_check" CHECK ("status" IN ('draft', 'converted', 'abandoned')) NOT VALID;
ALTER TABLE "transaction_orders" ADD CONSTRAINT "transaction_orders_status_check" CHECK ("status" IN ('pending_payment', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded', 'partially_refunded')) NOT VALID;
ALTER TABLE "transaction_orders" ADD CONSTRAINT "transaction_orders_total_consistent" CHECK ("total_amount" = "subtotal_amount" + "tax_amount") NOT VALID;
ALTER TABLE "transaction_order_items" ADD CONSTRAINT "transaction_order_items_total_consistent" CHECK ("total_amount" = "unit_price" * "quantity") NOT VALID;
ALTER TABLE "transaction_entitlements" ADD CONSTRAINT "transaction_entitlements_status_check" CHECK ("status" IN ('available', 'consumed', 'refunded')) NOT VALID;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_check" CHECK ("status" IN ('idle', 'running', 'disabled')) NOT VALID;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_interval_positive" CHECK ("interval_seconds" > 0) NOT VALID;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_lock_consistent" CHECK (("status" = 'running') = ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)) NOT VALID;
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_status_check" CHECK ("status" IN ('success', 'failed')) NOT VALID;
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_duration_nonnegative" CHECK ("duration_ms" >= 0) NOT VALID;
ALTER TABLE "pending_emails" ADD CONSTRAINT "pending_emails_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed')) NOT VALID;
ALTER TABLE "pending_emails" ADD CONSTRAINT "pending_emails_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts") NOT VALID;
ALTER TABLE "pending_emails" ADD CONSTRAINT "pending_emails_lock_consistent" CHECK (("status" = 'sending') = ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)) NOT VALID;
ALTER TABLE "user_data_export_request" ADD CONSTRAINT "user_data_export_status_check" CHECK ("status" IN ('pending', 'ready', 'downloaded', 'expired', 'failed')) NOT VALID;
ALTER TABLE "user_data_export_request" ADD CONSTRAINT "user_data_export_file_size_nonnegative" CHECK ("file_size_bytes" IS NULL OR "file_size_bytes" >= 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE "credit_purchases" VALIDATE CONSTRAINT "credit_purchases_status_check";
ALTER TABLE "credit_purchases" VALIDATE CONSTRAINT "credit_purchases_amounts_nonnegative";
ALTER TABLE "credit_purchases" VALIDATE CONSTRAINT "credit_purchases_total_consistent";
ALTER TABLE "payment_webhook_events" VALIDATE CONSTRAINT "payment_webhook_events_status_check";
ALTER TABLE "payment_webhook_events" VALIDATE CONSTRAINT "payment_webhook_events_retry_nonnegative";
ALTER TABLE "payment_webhook_events" VALIDATE CONSTRAINT "payment_webhook_events_duration_nonnegative";
ALTER TABLE "checkout_intents" VALIDATE CONSTRAINT "checkout_intents_billing_mode_check";
ALTER TABLE "checkout_intents" VALIDATE CONSTRAINT "checkout_intents_status_check";
ALTER TABLE "transaction_baskets" VALIDATE CONSTRAINT "transaction_baskets_status_check";
ALTER TABLE "transaction_orders" VALIDATE CONSTRAINT "transaction_orders_status_check";
ALTER TABLE "transaction_orders" VALIDATE CONSTRAINT "transaction_orders_total_consistent";
ALTER TABLE "transaction_order_items" VALIDATE CONSTRAINT "transaction_order_items_total_consistent";
ALTER TABLE "transaction_entitlements" VALIDATE CONSTRAINT "transaction_entitlements_status_check";
ALTER TABLE "jobs" VALIDATE CONSTRAINT "jobs_status_check";
ALTER TABLE "jobs" VALIDATE CONSTRAINT "jobs_interval_positive";
ALTER TABLE "jobs" VALIDATE CONSTRAINT "jobs_lock_consistent";
ALTER TABLE "job_runs" VALIDATE CONSTRAINT "job_runs_status_check";
ALTER TABLE "job_runs" VALIDATE CONSTRAINT "job_runs_duration_nonnegative";
ALTER TABLE "pending_emails" VALIDATE CONSTRAINT "pending_emails_status_check";
ALTER TABLE "pending_emails" VALIDATE CONSTRAINT "pending_emails_attempts_check";
ALTER TABLE "pending_emails" VALIDATE CONSTRAINT "pending_emails_lock_consistent";
ALTER TABLE "user_data_export_request" VALIDATE CONSTRAINT "user_data_export_status_check";
ALTER TABLE "user_data_export_request" VALIDATE CONSTRAINT "user_data_export_file_size_nonnegative";
