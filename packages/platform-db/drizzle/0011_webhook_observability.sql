ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "sanitized_payload" jsonb;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "request_id" text;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "correlation_id" text;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
