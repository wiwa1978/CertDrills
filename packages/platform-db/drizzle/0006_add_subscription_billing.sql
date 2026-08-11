CREATE TABLE IF NOT EXISTS "user_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "plan_key" text NOT NULL,
  "dodo_customer_id" text,
  "dodo_subscription_id" text NOT NULL,
  "status" text NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "user_subscriptions_user_id_idx" ON "user_subscriptions" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_dodo_subscription_id_idx" ON "user_subscriptions" ("dodo_subscription_id");
CREATE INDEX IF NOT EXISTS "user_subscriptions_status_idx" ON "user_subscriptions" ("status");
CREATE INDEX IF NOT EXISTS "user_subscriptions_plan_key_idx" ON "user_subscriptions" ("plan_key");

CREATE TABLE IF NOT EXISTS "subscription_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "dodo_subscription_id" text,
  "event_type" text NOT NULL,
  "status" text,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "subscription_events_user_id_idx" ON "subscription_events" ("user_id");
CREATE INDEX IF NOT EXISTS "subscription_events_dodo_subscription_id_idx" ON "subscription_events" ("dodo_subscription_id");
CREATE INDEX IF NOT EXISTS "subscription_events_event_type_idx" ON "subscription_events" ("event_type");
CREATE INDEX IF NOT EXISTS "subscription_events_created_at_idx" ON "subscription_events" ("created_at");
