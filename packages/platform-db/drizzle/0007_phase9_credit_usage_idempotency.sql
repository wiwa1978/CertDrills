CREATE TABLE IF NOT EXISTS "credit_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "feature_key" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "credit_transactions"("id") ON DELETE restrict,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_usage_events_user_id_idempotency_key_idx" ON "credit_usage_events" ("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "credit_usage_events_feature_key_created_at_idx" ON "credit_usage_events" ("feature_key", "created_at");
CREATE INDEX IF NOT EXISTS "credit_usage_events_transaction_id_idx" ON "credit_usage_events" ("transaction_id");
