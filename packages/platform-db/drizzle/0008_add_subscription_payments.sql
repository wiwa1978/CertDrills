CREATE TABLE "subscription_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "plan_key" text NOT NULL,
  "dodo_customer_id" text,
  "dodo_subscription_id" text,
  "payment_provider" text DEFAULT 'dodo' NOT NULL,
  "payment_id" text NOT NULL,
  "payment_status" text DEFAULT 'pending' NOT NULL,
  "price_excl_vat" integer NOT NULL,
  "price_incl_vat" integer NOT NULL,
  "vat_amount" integer NOT NULL,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "payment_snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "subscription_payments_user_id_idx" ON "subscription_payments" USING btree ("user_id");
CREATE UNIQUE INDEX "subscription_payments_provider_payment_id_idx" ON "subscription_payments" USING btree ("payment_provider", "payment_id");
CREATE INDEX "subscription_payments_payment_id_idx" ON "subscription_payments" USING btree ("payment_id");
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("dodo_subscription_id");
CREATE INDEX "subscription_payments_status_created_at_idx" ON "subscription_payments" USING btree ("payment_status", "created_at");
