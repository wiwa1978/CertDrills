ALTER TABLE "credit_purchases" ADD COLUMN IF NOT EXISTS "provider_customer_id" text;
UPDATE "credit_purchases" SET "provider_customer_id" = "dodo_customer_id" WHERE "provider_customer_id" IS NULL AND "dodo_customer_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "credit_purchases_provider_customer_id_idx" ON "credit_purchases" ("provider_customer_id");

ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "provider_customer_id" text;
ALTER TABLE "user_subscriptions" ADD COLUMN IF NOT EXISTS "provider_subscription_id" text;
UPDATE "user_subscriptions" SET "provider_customer_id" = "dodo_customer_id" WHERE "provider_customer_id" IS NULL AND "dodo_customer_id" IS NOT NULL;
UPDATE "user_subscriptions" SET "provider_subscription_id" = "dodo_subscription_id" WHERE "provider_subscription_id" IS NULL;
ALTER TABLE "user_subscriptions" ALTER COLUMN "provider_subscription_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_provider_subscription_id_idx" ON "user_subscriptions" ("provider_subscription_id");
CREATE INDEX IF NOT EXISTS "user_subscriptions_provider_customer_id_idx" ON "user_subscriptions" ("provider_customer_id");

ALTER TABLE "subscription_events" ADD COLUMN IF NOT EXISTS "provider_subscription_id" text;
UPDATE "subscription_events" SET "provider_subscription_id" = "dodo_subscription_id" WHERE "provider_subscription_id" IS NULL AND "dodo_subscription_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "subscription_events_provider_subscription_id_idx" ON "subscription_events" ("provider_subscription_id");

ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_customer_id" text;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_subscription_id" text;
UPDATE "subscription_payments" SET "provider_customer_id" = "dodo_customer_id" WHERE "provider_customer_id" IS NULL AND "dodo_customer_id" IS NOT NULL;
UPDATE "subscription_payments" SET "provider_subscription_id" = "dodo_subscription_id" WHERE "provider_subscription_id" IS NULL AND "dodo_subscription_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "subscription_payments_provider_customer_id_idx" ON "subscription_payments" ("provider_customer_id");
CREATE INDEX IF NOT EXISTS "subscription_payments_provider_subscription_id_idx" ON "subscription_payments" ("provider_subscription_id");

ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "provider_discount_id" text;
UPDATE "discounts" SET "provider_discount_id" = "dodo_discount_id" WHERE "provider_discount_id" IS NULL AND "dodo_discount_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "discounts_provider_discount_id_idx" ON "discounts" ("provider_discount_id");
