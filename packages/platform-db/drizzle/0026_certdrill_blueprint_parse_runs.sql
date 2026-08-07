CREATE TABLE "certdrill_blueprint_parse_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"content_checksum" text NOT NULL,
	"proposal_json" jsonb,
	"raw_output" text,
	"confidence" text,
	"warnings_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
ALTER TABLE "certdrill_blueprint_parse_runs" ADD CONSTRAINT "certdrill_blueprint_parse_runs_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "certdrill_blueprint_parse_runs" ADD CONSTRAINT "certdrill_blueprint_parse_runs_resource_id_certdrill_learn_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."certdrill_learn_resources"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "certdrill_blueprint_parse_runs_certification_id_idx" ON "certdrill_blueprint_parse_runs" USING btree ("certification_id");
--> statement-breakpoint
CREATE INDEX "certdrill_blueprint_parse_runs_resource_id_idx" ON "certdrill_blueprint_parse_runs" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX "certdrill_blueprint_parse_runs_status_idx" ON "certdrill_blueprint_parse_runs" USING btree ("status");
