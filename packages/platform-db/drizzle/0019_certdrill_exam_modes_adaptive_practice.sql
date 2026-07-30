ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "quick_drill_question_count" integer DEFAULT 10 NOT NULL;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "category_drill_question_count" integer DEFAULT 10 NOT NULL;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "exam_simulation_question_count" integer;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "exam_simulation_duration_minutes" integer DEFAULT 120 NOT NULL;

ALTER TABLE "certdrill_exam_categories" ADD COLUMN IF NOT EXISTS "drill_question_count" integer;

CREATE TABLE IF NOT EXISTS "certdrill_exam_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "duration_minutes" integer DEFAULT 120 NOT NULL,
  "question_ids" uuid[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "certdrill_exam_forms_certification_id_idx" ON "certdrill_exam_forms" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_exam_forms_active_idx" ON "certdrill_exam_forms" ("is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "certdrill_exam_forms_cert_sort_idx" ON "certdrill_exam_forms" ("certification_id", "sort_order");

ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "test_mode" text DEFAULT 'practice' NOT NULL;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "test_variant" text DEFAULT 'quick_drill' NOT NULL;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "exam_form_id" uuid REFERENCES "certdrill_exam_forms"("id") ON DELETE set null;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "confidence_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

UPDATE "certdrill_exam_attempts"
SET
  "test_mode" = CASE WHEN "feedback_mode" = 'exam' THEN 'exam' ELSE 'practice' END,
  "test_variant" = CASE
    WHEN "feedback_mode" = 'exam' THEN 'exam_simulation'
    WHEN "selection_mode" = 'category_focus' THEN 'category_drill'
    ELSE 'quick_drill'
  END
WHERE "test_variant" = 'quick_drill'
  AND "test_mode" = 'practice'
  AND "exam_form_id" IS NULL
  AND "confidence_enabled" = false
  AND "expires_at" IS NULL;

ALTER TABLE "certdrill_exam_attempt_answers" ADD COLUMN IF NOT EXISTS "confidence" text;

CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_test_mode_variant_idx" ON "certdrill_exam_attempts" ("test_mode", "test_variant");
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_expires_at_idx" ON "certdrill_exam_attempts" ("expires_at");
