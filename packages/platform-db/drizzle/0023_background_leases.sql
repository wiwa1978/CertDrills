ALTER TABLE "pending_emails" ADD COLUMN "locked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "pending_emails" ADD COLUMN "locked_by" text;
--> statement-breakpoint
CREATE INDEX "pending_emails_status_locked_at_idx" ON "pending_emails" USING btree ("status", "locked_at");
