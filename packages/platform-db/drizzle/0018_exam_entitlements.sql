CREATE TABLE IF NOT EXISTS "exam_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "exam_key" text NOT NULL,
  "price_cents" integer NOT NULL,
  "status" text DEFAULT 'available' NOT NULL,
  "purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
  "consumed_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_entitlements" ADD CONSTRAINT "exam_entitlements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_entitlements_user_id_idx" ON "exam_entitlements" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_entitlements_user_status_idx" ON "exam_entitlements" USING btree ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_entitlements_exam_key_idx" ON "exam_entitlements" USING btree ("exam_key");
