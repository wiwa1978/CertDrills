CREATE TABLE "certdrill_scenario_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "resource_ids" uuid[] NOT NULL,
  "requested_count" integer NOT NULL,
  "difficulty" text NOT NULL,
  "focus" text,
  "instructions" text,
  "provider" text NOT NULL,
  "model_used" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "resource_checksums_json" jsonb NOT NULL,
  "raw_output" text,
  "generated_count" integer,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "certdrill_scenario_generation_jobs_requested_count_positive" CHECK ("requested_count" > 0)
);

CREATE INDEX "certdrill_scenario_generation_jobs_certification_id_idx" ON "certdrill_scenario_generation_jobs" ("certification_id");
CREATE INDEX "certdrill_scenario_generation_jobs_status_idx" ON "certdrill_scenario_generation_jobs" ("status");

ALTER TABLE "certdrill_scenarios"
  ADD COLUMN "source_resource_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
  ADD COLUMN "generation_job_id" uuid REFERENCES "certdrill_scenario_generation_jobs"("id") ON DELETE set null,
  ADD COLUMN "created_by" text DEFAULT 'admin' NOT NULL;

CREATE INDEX "certdrill_scenarios_generation_job_id_idx" ON "certdrill_scenarios" ("generation_job_id");
