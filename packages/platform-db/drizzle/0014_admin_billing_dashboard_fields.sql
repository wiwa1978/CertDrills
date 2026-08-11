ALTER TABLE "user_subscriptions"
  ADD COLUMN IF NOT EXISTS "provider_event_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "subscription_payments"
  ADD COLUMN IF NOT EXISTS "payment_method" text,
  ADD COLUMN IF NOT EXISTS "payment_method_type" text,
  ADD COLUMN IF NOT EXISTS "refund_status" text,
  ADD COLUMN IF NOT EXISTS "error_code" text,
  ADD COLUMN IF NOT EXISTS "error_message" text;

ALTER TABLE "discounts"
  ADD COLUMN IF NOT EXISTS "subscription_cycles" integer;

DO $$ BEGIN
  ALTER TABLE "discounts" ADD CONSTRAINT "discounts_subscription_cycles_range"
    CHECK ("subscription_cycles" IS NULL OR ("subscription_cycles" >= 1 AND "subscription_cycles" <= 999));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "user_subscriptions_provider_event_at_idx"
  ON "user_subscriptions" ("provider_event_at");

CREATE INDEX IF NOT EXISTS "subscription_payments_method_created_at_idx"
  ON "subscription_payments" ("payment_method", "created_at");

CREATE INDEX IF NOT EXISTS "subscription_payments_error_code_created_at_idx"
  ON "subscription_payments" ("error_code", "created_at");

CREATE INDEX IF NOT EXISTS "discounts_status_created_at_idx"
  ON "discounts" ("status", "created_at");
