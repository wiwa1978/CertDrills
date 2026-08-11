CREATE TABLE IF NOT EXISTS "checkout_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "billing_mode" text NOT NULL,
  "package_key" text,
  "plan_key" text,
  "product_id" text NOT NULL,
  "discount_code" text,
  "reference_id" text NOT NULL,
  "payment_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "checkout_intents"
    ADD CONSTRAINT "checkout_intents_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "checkout_intents_user_id_idx" ON "checkout_intents" USING btree ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_intents_reference_id_idx" ON "checkout_intents" USING btree ("reference_id");
CREATE INDEX IF NOT EXISTS "checkout_intents_payment_id_idx" ON "checkout_intents" USING btree ("payment_id");
CREATE INDEX IF NOT EXISTS "checkout_intents_status_created_at_idx" ON "checkout_intents" USING btree ("status", "created_at");
