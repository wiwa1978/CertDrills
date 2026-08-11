CREATE TABLE IF NOT EXISTS "certdrill_answer_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"text" text NOT NULL,
	"media_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_correct" boolean NOT NULL,
	"explanation" text NOT NULL,
	"citation_urls" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_blueprint_parse_runs" (
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
CREATE TABLE IF NOT EXISTS "certdrill_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"vendor" text NOT NULL,
	"vendor_id" uuid,
	"logo_url" text,
	"blueprint_source_url" text,
	"description" text,
	"question_count_default" integer NOT NULL,
	"quick_drill_question_count" integer DEFAULT 10 NOT NULL,
	"category_drill_question_count" integer DEFAULT 10 NOT NULL,
	"exam_simulation_question_count" integer,
	"exam_simulation_scenario_count" integer DEFAULT 0 NOT NULL,
	"exam_simulation_duration_minutes" integer DEFAULT 120 NOT NULL,
	"pass_threshold_pct" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"enabled_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_certifications_code_unique" UNIQUE("code"),
	CONSTRAINT "certdrill_certifications_exam_simulation_scenario_count_nonnegative" CHECK ("certdrill_certifications"."exam_simulation_scenario_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_exam_attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_id" uuid,
	"response_json" jsonb NOT NULL,
	"is_correct" boolean NOT NULL,
	"confidence" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_exam_attempt_scenario_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_attempt_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"decisions_json" jsonb NOT NULL,
	"earned_points" integer NOT NULL,
	"max_points" integer NOT NULL,
	"score_pct" numeric(5, 2) NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_exam_attempt_scenario_responses_points_nonnegative" CHECK ("certdrill_exam_attempt_scenario_responses"."earned_points" >= 0 AND "certdrill_exam_attempt_scenario_responses"."max_points" > 0),
	CONSTRAINT "certdrill_exam_attempt_scenario_responses_score_range" CHECK ("certdrill_exam_attempt_scenario_responses"."score_pct" >= 0 AND "certdrill_exam_attempt_scenario_responses"."score_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"feedback_mode" text NOT NULL,
	"selection_mode" text NOT NULL,
	"test_mode" text DEFAULT 'practice' NOT NULL,
	"test_variant" text DEFAULT 'quick_drill' NOT NULL,
	"exam_form_id" uuid,
	"confidence_enabled" boolean DEFAULT false NOT NULL,
	"category_ids" uuid[],
	"question_ids" uuid[] NOT NULL,
	"scenario_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"snapshot_version" integer DEFAULT 1 NOT NULL,
	"question_snapshot_json" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"score_pct" numeric(5, 2),
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_exam_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"parent_category_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"weight_pct" numeric(5, 2),
	"weight_min_pct" numeric(5, 2),
	"weight_max_pct" numeric(5, 2),
	"drill_question_count" integer,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_exam_form_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_form_id" uuid NOT NULL,
	"scenario_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_exam_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"duration_minutes" integer DEFAULT 120 NOT NULL,
	"target_question_count" integer NOT NULL,
	"question_ids" uuid[] NOT NULL,
	"assignment_version" integer DEFAULT 1 NOT NULL,
	"allocation_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_exam_forms_target_question_count_positive" CHECK ("certdrill_exam_forms"."target_question_count" > 0),
	CONSTRAINT "certdrill_exam_forms_duration_minutes_positive" CHECK ("certdrill_exam_forms"."duration_minutes" > 0),
	CONSTRAINT "certdrill_exam_forms_assignment_version_positive" CHECK ("certdrill_exam_forms"."assignment_version" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_handoff_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"blueprint_url" text NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_learn_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"category_id" uuid,
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_question_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"exam_attempt_id" uuid,
	"rating" integer NOT NULL,
	"dispute_correct_answer" boolean DEFAULT false NOT NULL,
	"message" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_question_feedback_rating_range" CHECK ("certdrill_question_feedback"."rating" >= 1 AND "certdrill_question_feedback"."rating" <= 5),
	CONSTRAINT "certdrill_question_feedback_status_check" CHECK ("certdrill_question_feedback"."status" IN ('open', 'reviewed', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_question_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"handoff_run_id" uuid,
	"category_id" uuid,
	"resource_ids" uuid[] NOT NULL,
	"requested_count" integer NOT NULL,
	"provider" text DEFAULT 'inngest' NOT NULL,
	"provider_run_id" text,
	"provider_run_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"model_used" text,
	"configuration_json" jsonb NOT NULL,
	"resource_checksums_json" jsonb NOT NULL,
	"raw_output" text,
	"generated_count" integer,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"source_resource_id" uuid,
	"generation_job_id" uuid,
	"question_type" text DEFAULT 'single_choice' NOT NULL,
	"interaction_json" jsonb,
	"stem" text NOT NULL,
	"media_assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"delivery_purpose" text DEFAULT 'both' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"ease" numeric(4, 2) DEFAULT '2.50' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_review_queue_reason_check" CHECK ("certdrill_review_queue"."reason" IN ('incorrect', 'low_confidence', 'incorrect_low_confidence')),
	CONSTRAINT "certdrill_review_queue_status_check" CHECK ("certdrill_review_queue"."status" IN ('active', 'completed', 'dismissed')),
	CONSTRAINT "certdrill_review_queue_interval_days_positive" CHECK ("certdrill_review_queue"."interval_days" >= 1),
	CONSTRAINT "certdrill_review_queue_ease_positive" CHECK ("certdrill_review_queue"."ease" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_scenario_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
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
	CONSTRAINT "certdrill_scenario_generation_jobs_requested_count_positive" CHECK ("certdrill_scenario_generation_jobs"."requested_count" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" uuid NOT NULL,
	"source_resource_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"generation_job_id" uuid,
	"created_by" text DEFAULT 'admin' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"difficulty" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_json" jsonb NOT NULL,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_scenarios_estimated_minutes_positive" CHECK ("certdrill_scenarios"."estimated_minutes" > 0),
	CONSTRAINT "certdrill_scenarios_status_check" CHECK ("certdrill_scenarios"."status" IN ('draft', 'validated', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "certdrill_vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certdrill_vendors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DROP INDEX IF EXISTS "passkey_credentialID_idx";--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "certdrill_answer_options" DROP CONSTRAINT IF EXISTS "certdrill_answer_options_question_id_certdrill_questions_id_fk";
ALTER TABLE "certdrill_blueprint_parse_runs" DROP CONSTRAINT IF EXISTS "certdrill_blueprint_parse_runs_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_blueprint_parse_runs" DROP CONSTRAINT IF EXISTS "certdrill_blueprint_parse_runs_resource_id_certdrill_learn_resources_id_fk";
ALTER TABLE "certdrill_certifications" DROP CONSTRAINT IF EXISTS "certdrill_certifications_vendor_id_certdrill_vendors_id_fk";
ALTER TABLE "certdrill_exam_attempt_answers" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempt_answers_exam_attempt_id_certdrill_exam_attempts_id_fk";
ALTER TABLE "certdrill_exam_attempt_scenario_responses" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempt_scenario_responses_exam_attempt_id_certdrill_exam_attempts_id_fk";
ALTER TABLE "certdrill_exam_attempt_scenario_responses" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempt_scenario_responses_scenario_id_certdrill_scenarios_id_fk";
ALTER TABLE "certdrill_exam_attempts" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempts_user_id_user_id_fk";
ALTER TABLE "certdrill_exam_attempts" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempts_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_exam_attempts" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempts_exam_form_id_certdrill_exam_forms_id_fk";
ALTER TABLE "certdrill_exam_categories" DROP CONSTRAINT IF EXISTS "certdrill_exam_categories_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_exam_categories" DROP CONSTRAINT IF EXISTS "certdrill_exam_categories_parent_category_id_certdrill_exam_categories_id_fk";
ALTER TABLE "certdrill_exam_form_scenarios" DROP CONSTRAINT IF EXISTS "certdrill_exam_form_scenarios_exam_form_id_certdrill_exam_forms_id_fk";
ALTER TABLE "certdrill_exam_form_scenarios" DROP CONSTRAINT IF EXISTS "certdrill_exam_form_scenarios_scenario_id_certdrill_scenarios_id_fk";
ALTER TABLE "certdrill_exam_forms" DROP CONSTRAINT IF EXISTS "certdrill_exam_forms_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_handoff_runs" DROP CONSTRAINT IF EXISTS "certdrill_handoff_runs_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_handoff_runs" DROP CONSTRAINT IF EXISTS "certdrill_handoff_runs_requested_by_user_id_user_id_fk";
ALTER TABLE "certdrill_learn_resources" DROP CONSTRAINT IF EXISTS "certdrill_learn_resources_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_learn_resources" DROP CONSTRAINT IF EXISTS "certdrill_learn_resources_category_id_certdrill_exam_categories_id_fk";
ALTER TABLE "certdrill_question_feedback" DROP CONSTRAINT IF EXISTS "certdrill_question_feedback_user_id_user_id_fk";
ALTER TABLE "certdrill_question_feedback" DROP CONSTRAINT IF EXISTS "certdrill_question_feedback_question_id_certdrill_questions_id_fk";
ALTER TABLE "certdrill_question_feedback" DROP CONSTRAINT IF EXISTS "certdrill_question_feedback_exam_attempt_id_certdrill_exam_attempts_id_fk";
ALTER TABLE "certdrill_question_generation_jobs" DROP CONSTRAINT IF EXISTS "certdrill_question_generation_jobs_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_question_generation_jobs" DROP CONSTRAINT IF EXISTS "certdrill_question_generation_jobs_handoff_run_id_certdrill_handoff_runs_id_fk";
ALTER TABLE "certdrill_question_generation_jobs" DROP CONSTRAINT IF EXISTS "certdrill_question_generation_jobs_category_id_certdrill_exam_categories_id_fk";
ALTER TABLE "certdrill_questions" DROP CONSTRAINT IF EXISTS "certdrill_questions_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_questions" DROP CONSTRAINT IF EXISTS "certdrill_questions_category_id_certdrill_exam_categories_id_fk";
ALTER TABLE "certdrill_questions" DROP CONSTRAINT IF EXISTS "certdrill_questions_source_resource_id_certdrill_learn_resources_id_fk";
ALTER TABLE "certdrill_questions" DROP CONSTRAINT IF EXISTS "certdrill_questions_generation_job_id_certdrill_question_generation_jobs_id_fk";
ALTER TABLE "certdrill_review_queue" DROP CONSTRAINT IF EXISTS "certdrill_review_queue_user_id_user_id_fk";
ALTER TABLE "certdrill_review_queue" DROP CONSTRAINT IF EXISTS "certdrill_review_queue_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_review_queue" DROP CONSTRAINT IF EXISTS "certdrill_review_queue_question_id_certdrill_questions_id_fk";
ALTER TABLE "certdrill_scenario_generation_jobs" DROP CONSTRAINT IF EXISTS "certdrill_scenario_generation_jobs_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_scenarios" DROP CONSTRAINT IF EXISTS "certdrill_scenarios_certification_id_certdrill_certifications_id_fk";
ALTER TABLE "certdrill_scenarios" DROP CONSTRAINT IF EXISTS "certdrill_scenarios_generation_job_id_certdrill_scenario_generation_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "certdrill_answer_options" ADD CONSTRAINT "certdrill_answer_options_question_id_certdrill_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."certdrill_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_blueprint_parse_runs" ADD CONSTRAINT "certdrill_blueprint_parse_runs_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_blueprint_parse_runs" ADD CONSTRAINT "certdrill_blueprint_parse_runs_resource_id_certdrill_learn_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."certdrill_learn_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_certifications" ADD CONSTRAINT "certdrill_certifications_vendor_id_certdrill_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."certdrill_vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_attempt_answers" ADD CONSTRAINT "certdrill_exam_attempt_answers_exam_attempt_id_certdrill_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."certdrill_exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_attempt_scenario_responses" ADD CONSTRAINT "certdrill_exam_attempt_scenario_responses_exam_attempt_id_certdrill_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."certdrill_exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_attempt_scenario_responses" ADD CONSTRAINT "certdrill_exam_attempt_scenario_responses_scenario_id_certdrill_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."certdrill_scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_attempts" ADD CONSTRAINT "certdrill_exam_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_attempts" ADD CONSTRAINT "certdrill_exam_attempts_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_attempts" ADD CONSTRAINT "certdrill_exam_attempts_exam_form_id_certdrill_exam_forms_id_fk" FOREIGN KEY ("exam_form_id") REFERENCES "public"."certdrill_exam_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_categories" ADD CONSTRAINT "certdrill_exam_categories_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_categories" ADD CONSTRAINT "certdrill_exam_categories_parent_category_id_certdrill_exam_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."certdrill_exam_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_form_scenarios" ADD CONSTRAINT "certdrill_exam_form_scenarios_exam_form_id_certdrill_exam_forms_id_fk" FOREIGN KEY ("exam_form_id") REFERENCES "public"."certdrill_exam_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_form_scenarios" ADD CONSTRAINT "certdrill_exam_form_scenarios_scenario_id_certdrill_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."certdrill_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_handoff_runs" ADD CONSTRAINT "certdrill_handoff_runs_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_handoff_runs" ADD CONSTRAINT "certdrill_handoff_runs_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_learn_resources" ADD CONSTRAINT "certdrill_learn_resources_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_learn_resources" ADD CONSTRAINT "certdrill_learn_resources_category_id_certdrill_exam_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."certdrill_exam_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_question_feedback" ADD CONSTRAINT "certdrill_question_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_question_feedback" ADD CONSTRAINT "certdrill_question_feedback_question_id_certdrill_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."certdrill_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_question_feedback" ADD CONSTRAINT "certdrill_question_feedback_exam_attempt_id_certdrill_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."certdrill_exam_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_question_generation_jobs" ADD CONSTRAINT "certdrill_question_generation_jobs_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_question_generation_jobs" ADD CONSTRAINT "certdrill_question_generation_jobs_handoff_run_id_certdrill_handoff_runs_id_fk" FOREIGN KEY ("handoff_run_id") REFERENCES "public"."certdrill_handoff_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_question_generation_jobs" ADD CONSTRAINT "certdrill_question_generation_jobs_category_id_certdrill_exam_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."certdrill_exam_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_questions" ADD CONSTRAINT "certdrill_questions_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_questions" ADD CONSTRAINT "certdrill_questions_category_id_certdrill_exam_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."certdrill_exam_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_questions" ADD CONSTRAINT "certdrill_questions_source_resource_id_certdrill_learn_resources_id_fk" FOREIGN KEY ("source_resource_id") REFERENCES "public"."certdrill_learn_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_questions" ADD CONSTRAINT "certdrill_questions_generation_job_id_certdrill_question_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."certdrill_question_generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_review_queue" ADD CONSTRAINT "certdrill_review_queue_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_review_queue" ADD CONSTRAINT "certdrill_review_queue_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_review_queue" ADD CONSTRAINT "certdrill_review_queue_question_id_certdrill_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."certdrill_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_scenario_generation_jobs" ADD CONSTRAINT "certdrill_scenario_generation_jobs_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_scenarios" ADD CONSTRAINT "certdrill_scenarios_certification_id_certdrill_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certdrill_certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certdrill_scenarios" ADD CONSTRAINT "certdrill_scenarios_generation_job_id_certdrill_scenario_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."certdrill_scenario_generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
DROP INDEX IF EXISTS "certdrill_answer_options_question_id_idx";
DROP INDEX IF EXISTS "certdrill_blueprint_parse_runs_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_blueprint_parse_runs_resource_id_idx";
DROP INDEX IF EXISTS "certdrill_blueprint_parse_runs_status_idx";
DROP INDEX IF EXISTS "certdrill_certifications_is_active_idx";
DROP INDEX IF EXISTS "certdrill_certifications_enabled_at_idx";
DROP INDEX IF EXISTS "certdrill_certifications_archived_at_idx";
DROP INDEX IF EXISTS "certdrill_certifications_vendor_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempt_answers_attempt_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempt_answers_attempt_question_idx";
ALTER TABLE "certdrill_exam_attempt_scenario_responses" DROP CONSTRAINT IF EXISTS "certdrill_exam_attempt_scenario_responses_attempt_scenario_unique";
DROP INDEX IF EXISTS "certdrill_exam_attempt_scenario_responses_attempt_scenario_unique";
DROP INDEX IF EXISTS "certdrill_exam_attempt_scenario_responses_attempt_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempts_user_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempts_cert_completed_status_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempts_status_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempts_test_mode_variant_idx";
DROP INDEX IF EXISTS "certdrill_exam_attempts_expires_at_idx";
DROP INDEX IF EXISTS "certdrill_exam_categories_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_categories_parent_category_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_categories_archived_at_idx";
DROP INDEX IF EXISTS "certdrill_exam_categories_cert_code_idx";
DROP INDEX IF EXISTS "certdrill_exam_form_scenarios_form_scenario_idx";
DROP INDEX IF EXISTS "certdrill_exam_form_scenarios_form_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_form_scenarios_scenario_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_forms_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_exam_forms_active_idx";
DROP INDEX IF EXISTS "certdrill_exam_forms_cert_sort_idx";
DROP INDEX IF EXISTS "certdrill_handoff_runs_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_handoff_runs_status_idx";
DROP INDEX IF EXISTS "certdrill_learn_resources_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_learn_resources_category_id_idx";
DROP INDEX IF EXISTS "certdrill_learn_resources_status_idx";
DROP INDEX IF EXISTS "certdrill_question_feedback_user_id_idx";
DROP INDEX IF EXISTS "certdrill_question_feedback_question_id_idx";
DROP INDEX IF EXISTS "certdrill_question_feedback_exam_attempt_id_idx";
DROP INDEX IF EXISTS "certdrill_question_feedback_status_idx";
DROP INDEX IF EXISTS "certdrill_question_feedback_created_at_idx";
DROP INDEX IF EXISTS "certdrill_question_generation_jobs_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_question_generation_jobs_status_idx";
DROP INDEX IF EXISTS "certdrill_question_generation_jobs_handoff_run_id_idx";
DROP INDEX IF EXISTS "certdrill_questions_certification_status_idx";
DROP INDEX IF EXISTS "certdrill_questions_category_id_idx";
DROP INDEX IF EXISTS "certdrill_questions_generation_job_id_idx";
DROP INDEX IF EXISTS "certdrill_questions_delivery_purpose_idx";
DROP INDEX IF EXISTS "certdrill_review_queue_user_due_idx";
DROP INDEX IF EXISTS "certdrill_review_queue_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_review_queue_question_id_idx";
DROP INDEX IF EXISTS "certdrill_review_queue_user_cert_question_idx";
DROP INDEX IF EXISTS "certdrill_scenario_generation_jobs_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_scenario_generation_jobs_status_idx";
DROP INDEX IF EXISTS "certdrill_scenarios_certification_id_idx";
DROP INDEX IF EXISTS "certdrill_scenarios_generation_job_id_idx";
DROP INDEX IF EXISTS "certdrill_scenarios_status_idx";
DROP INDEX IF EXISTS "certdrill_vendors_is_active_idx";
DROP INDEX IF EXISTS "certdrill_vendors_sort_order_idx";
--> statement-breakpoint
CREATE INDEX "certdrill_answer_options_question_id_idx" ON "certdrill_answer_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "certdrill_blueprint_parse_runs_certification_id_idx" ON "certdrill_blueprint_parse_runs" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_blueprint_parse_runs_resource_id_idx" ON "certdrill_blueprint_parse_runs" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "certdrill_blueprint_parse_runs_status_idx" ON "certdrill_blueprint_parse_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_certifications_is_active_idx" ON "certdrill_certifications" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "certdrill_certifications_enabled_at_idx" ON "certdrill_certifications" USING btree ("enabled_at");--> statement-breakpoint
CREATE INDEX "certdrill_certifications_archived_at_idx" ON "certdrill_certifications" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "certdrill_certifications_vendor_id_idx" ON "certdrill_certifications" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempt_answers_attempt_id_idx" ON "certdrill_exam_attempt_answers" USING btree ("exam_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certdrill_exam_attempt_answers_attempt_question_idx" ON "certdrill_exam_attempt_answers" USING btree ("exam_attempt_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certdrill_exam_attempt_scenario_responses_attempt_scenario_unique" ON "certdrill_exam_attempt_scenario_responses" USING btree ("exam_attempt_id","scenario_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempt_scenario_responses_attempt_id_idx" ON "certdrill_exam_attempt_scenario_responses" USING btree ("exam_attempt_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempts_user_id_idx" ON "certdrill_exam_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempts_cert_completed_status_idx" ON "certdrill_exam_attempts" USING btree ("certification_id","completed_at","status");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempts_status_idx" ON "certdrill_exam_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempts_test_mode_variant_idx" ON "certdrill_exam_attempts" USING btree ("test_mode","test_variant");--> statement-breakpoint
CREATE INDEX "certdrill_exam_attempts_expires_at_idx" ON "certdrill_exam_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "certdrill_exam_categories_certification_id_idx" ON "certdrill_exam_categories" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_categories_parent_category_id_idx" ON "certdrill_exam_categories" USING btree ("parent_category_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_categories_archived_at_idx" ON "certdrill_exam_categories" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "certdrill_exam_categories_cert_code_idx" ON "certdrill_exam_categories" USING btree ("certification_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "certdrill_exam_form_scenarios_form_scenario_idx" ON "certdrill_exam_form_scenarios" USING btree ("exam_form_id","scenario_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_form_scenarios_form_id_idx" ON "certdrill_exam_form_scenarios" USING btree ("exam_form_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_form_scenarios_scenario_id_idx" ON "certdrill_exam_form_scenarios" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_forms_certification_id_idx" ON "certdrill_exam_forms" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_exam_forms_active_idx" ON "certdrill_exam_forms" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "certdrill_exam_forms_cert_sort_idx" ON "certdrill_exam_forms" USING btree ("certification_id","sort_order");--> statement-breakpoint
CREATE INDEX "certdrill_handoff_runs_certification_id_idx" ON "certdrill_handoff_runs" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_handoff_runs_status_idx" ON "certdrill_handoff_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_learn_resources_certification_id_idx" ON "certdrill_learn_resources" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_learn_resources_category_id_idx" ON "certdrill_learn_resources" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "certdrill_learn_resources_status_idx" ON "certdrill_learn_resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_question_feedback_user_id_idx" ON "certdrill_question_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "certdrill_question_feedback_question_id_idx" ON "certdrill_question_feedback" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "certdrill_question_feedback_exam_attempt_id_idx" ON "certdrill_question_feedback" USING btree ("exam_attempt_id");--> statement-breakpoint
CREATE INDEX "certdrill_question_feedback_status_idx" ON "certdrill_question_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_question_feedback_created_at_idx" ON "certdrill_question_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "certdrill_question_generation_jobs_certification_id_idx" ON "certdrill_question_generation_jobs" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_question_generation_jobs_status_idx" ON "certdrill_question_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_question_generation_jobs_handoff_run_id_idx" ON "certdrill_question_generation_jobs" USING btree ("handoff_run_id");--> statement-breakpoint
CREATE INDEX "certdrill_questions_certification_status_idx" ON "certdrill_questions" USING btree ("certification_id","status");--> statement-breakpoint
CREATE INDEX "certdrill_questions_category_id_idx" ON "certdrill_questions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "certdrill_questions_generation_job_id_idx" ON "certdrill_questions" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "certdrill_questions_delivery_purpose_idx" ON "certdrill_questions" USING btree ("certification_id","status","delivery_purpose");--> statement-breakpoint
CREATE INDEX "certdrill_review_queue_user_due_idx" ON "certdrill_review_queue" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "certdrill_review_queue_certification_id_idx" ON "certdrill_review_queue" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_review_queue_question_id_idx" ON "certdrill_review_queue" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certdrill_review_queue_user_cert_question_idx" ON "certdrill_review_queue" USING btree ("user_id","certification_id","question_id");--> statement-breakpoint
CREATE INDEX "certdrill_scenario_generation_jobs_certification_id_idx" ON "certdrill_scenario_generation_jobs" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_scenario_generation_jobs_status_idx" ON "certdrill_scenario_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_scenarios_certification_id_idx" ON "certdrill_scenarios" USING btree ("certification_id");--> statement-breakpoint
CREATE INDEX "certdrill_scenarios_generation_job_id_idx" ON "certdrill_scenarios" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "certdrill_scenarios_status_idx" ON "certdrill_scenarios" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certdrill_vendors_is_active_idx" ON "certdrill_vendors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "certdrill_vendors_sort_order_idx" ON "certdrill_vendors" USING btree ("sort_order");--> statement-breakpoint
