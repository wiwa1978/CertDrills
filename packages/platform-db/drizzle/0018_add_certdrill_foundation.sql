CREATE TABLE IF NOT EXISTS "certdrill_certifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "vendor" text NOT NULL,
  "blueprint_source_url" text,
  "description" text,
  "question_count_default" integer NOT NULL,
  "pass_threshold_pct" integer NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_exam_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "parent_category_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "weight_pct" numeric(5, 2),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'certdrill_exam_categories_parent_fk'
      AND conrelid = 'certdrill_exam_categories'::regclass
  ) THEN
    ALTER TABLE "certdrill_exam_categories"
      ADD CONSTRAINT "certdrill_exam_categories_parent_fk"
      FOREIGN KEY ("parent_category_id") REFERENCES "certdrill_exam_categories"("id") ON DELETE cascade;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "certdrill_learn_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "category_id" uuid REFERENCES "certdrill_exam_categories"("id") ON DELETE set null,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "source_type" text NOT NULL,
  "content_mode" text NOT NULL,
  "raw_content" text,
  "ingested_at" timestamp with time zone,
  "status" text DEFAULT 'pending' NOT NULL,
  "ingest_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_handoff_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "blueprint_url" text NOT NULL,
  "requested_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "status" text DEFAULT 'pending' NOT NULL,
  "model_strategy" text NOT NULL,
  "model_primary" text NOT NULL,
  "model_secondary" text,
  "target_questions_per_domain" integer NOT NULL,
  "provider" text DEFAULT 'inngest' NOT NULL,
  "provider_run_id" text,
  "provider_run_url" text,
  "progress_json" jsonb,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_question_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "handoff_run_id" uuid REFERENCES "certdrill_handoff_runs"("id") ON DELETE set null,
  "category_id" uuid REFERENCES "certdrill_exam_categories"("id") ON DELETE set null,
  "resource_ids" uuid[] NOT NULL,
  "requested_count" integer NOT NULL,
  "provider" text DEFAULT 'inngest' NOT NULL,
  "provider_run_id" text,
  "provider_run_url" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "model_used" text,
  "generated_count" integer,
  "error_message" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "category_id" uuid NOT NULL REFERENCES "certdrill_exam_categories"("id") ON DELETE restrict,
  "source_resource_id" uuid REFERENCES "certdrill_learn_resources"("id") ON DELETE set null,
  "generation_job_id" uuid REFERENCES "certdrill_question_generation_jobs"("id") ON DELETE set null,
  "stem" text NOT NULL,
  "media_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "difficulty" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_answer_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid NOT NULL REFERENCES "certdrill_questions"("id") ON DELETE cascade,
  "text" text NOT NULL,
  "media_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_correct" boolean NOT NULL,
  "explanation" text NOT NULL,
  "citation_urls" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_exam_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "feedback_mode" text NOT NULL,
  "selection_mode" text NOT NULL,
  "category_ids" uuid[],
  "question_ids" uuid[] NOT NULL,
  "snapshot_version" integer DEFAULT 1 NOT NULL,
  "question_snapshot_json" jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "score_pct" numeric(5, 2),
  "status" text DEFAULT 'in_progress' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "certdrill_exam_attempt_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_attempt_id" uuid NOT NULL REFERENCES "certdrill_exam_attempts"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL,
  "selected_option_id" uuid NOT NULL,
  "is_correct" boolean NOT NULL,
  "answered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "certdrill_certifications_is_active_idx" ON "certdrill_certifications" ("is_active");
CREATE INDEX IF NOT EXISTS "certdrill_exam_categories_certification_id_idx" ON "certdrill_exam_categories" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_exam_categories_parent_category_id_idx" ON "certdrill_exam_categories" ("parent_category_id");
CREATE UNIQUE INDEX IF NOT EXISTS "certdrill_exam_categories_cert_code_idx" ON "certdrill_exam_categories" ("certification_id", "code");
CREATE INDEX IF NOT EXISTS "certdrill_learn_resources_certification_id_idx" ON "certdrill_learn_resources" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_learn_resources_category_id_idx" ON "certdrill_learn_resources" ("category_id");
CREATE INDEX IF NOT EXISTS "certdrill_learn_resources_status_idx" ON "certdrill_learn_resources" ("status");
CREATE INDEX IF NOT EXISTS "certdrill_handoff_runs_certification_id_idx" ON "certdrill_handoff_runs" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_handoff_runs_status_idx" ON "certdrill_handoff_runs" ("status");
CREATE INDEX IF NOT EXISTS "certdrill_question_generation_jobs_certification_id_idx" ON "certdrill_question_generation_jobs" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_question_generation_jobs_status_idx" ON "certdrill_question_generation_jobs" ("status");
CREATE INDEX IF NOT EXISTS "certdrill_question_generation_jobs_handoff_run_id_idx" ON "certdrill_question_generation_jobs" ("handoff_run_id");
CREATE INDEX IF NOT EXISTS "certdrill_questions_certification_status_idx" ON "certdrill_questions" ("certification_id", "status");
CREATE INDEX IF NOT EXISTS "certdrill_questions_category_id_idx" ON "certdrill_questions" ("category_id");
CREATE INDEX IF NOT EXISTS "certdrill_questions_generation_job_id_idx" ON "certdrill_questions" ("generation_job_id");
CREATE INDEX IF NOT EXISTS "certdrill_answer_options_question_id_idx" ON "certdrill_answer_options" ("question_id");
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_user_id_idx" ON "certdrill_exam_attempts" ("user_id");
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_cert_completed_status_idx" ON "certdrill_exam_attempts" ("certification_id", "completed_at", "status");
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_status_idx" ON "certdrill_exam_attempts" ("status");
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempt_answers_attempt_id_idx" ON "certdrill_exam_attempt_answers" ("exam_attempt_id");
CREATE UNIQUE INDEX IF NOT EXISTS "certdrill_exam_attempt_answers_attempt_question_idx" ON "certdrill_exam_attempt_answers" ("exam_attempt_id", "question_id");
