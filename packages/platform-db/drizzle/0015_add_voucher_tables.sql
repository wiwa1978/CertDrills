CREATE TABLE IF NOT EXISTS "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"credit_amount" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"applies_to_all_users" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_code_unique" UNIQUE("code");
EXCEPTION
	WHEN duplicate_object OR duplicate_table THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "voucher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "voucher_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"credits_granted" integer NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "voucher_assignments" ADD CONSTRAINT "voucher_assignments_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "voucher_assignments" ADD CONSTRAINT "voucher_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "vouchers_code_idx" ON "vouchers" USING btree ("code");
CREATE INDEX IF NOT EXISTS "vouchers_status_idx" ON "vouchers" USING btree ("status");
CREATE INDEX IF NOT EXISTS "vouchers_applies_to_all_users_idx" ON "vouchers" USING btree ("applies_to_all_users");
CREATE INDEX IF NOT EXISTS "vouchers_expires_at_idx" ON "vouchers" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "voucher_assignments_voucher_id_idx" ON "voucher_assignments" USING btree ("voucher_id");
CREATE INDEX IF NOT EXISTS "voucher_assignments_user_id_idx" ON "voucher_assignments" USING btree ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_assignments_voucher_user_idx" ON "voucher_assignments" USING btree ("voucher_id", "user_id");
CREATE INDEX IF NOT EXISTS "voucher_redemptions_voucher_id_idx" ON "voucher_redemptions" USING btree ("voucher_id");
CREATE INDEX IF NOT EXISTS "voucher_redemptions_user_id_idx" ON "voucher_redemptions" USING btree ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "voucher_redemptions_voucher_user_idx" ON "voucher_redemptions" USING btree ("voucher_id", "user_id");
