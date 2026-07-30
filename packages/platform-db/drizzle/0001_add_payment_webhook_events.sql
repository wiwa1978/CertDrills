CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'dodo' NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payment_id" text,
	"signature_timestamp" timestamp with time zone,
	"sanitized_payload" jsonb,
	"request_id" text,
	"correlation_id" text,
	"duration_ms" integer,
	"processing_status" text DEFAULT 'processing' NOT NULL,
	"error_details" jsonb,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_idx" ON "payment_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_payment_id_idx" ON "payment_webhook_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_event_type_idx" ON "payment_webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_processing_status_idx" ON "payment_webhook_events" USING btree ("processing_status");
