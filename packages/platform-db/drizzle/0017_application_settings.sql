CREATE TABLE IF NOT EXISTS "application_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "value_type" text NOT NULL,
  "description" text,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "application_settings_updated_by_user_id_idx" ON "application_settings" USING btree ("updated_by_user_id");
