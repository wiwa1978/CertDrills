ALTER TABLE "credit_purchases" ADD COLUMN "credits_granted_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "credit_purchases"
SET "credits_granted_at" = "updated_at"
WHERE "payment_status" = 'completed' AND "credits_granted_at" IS NULL;
