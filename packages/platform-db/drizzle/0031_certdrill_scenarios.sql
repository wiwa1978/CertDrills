CREATE TABLE "certdrill_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "difficulty" text NOT NULL,
  "estimated_minutes" integer NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "content_json" jsonb NOT NULL,
  "validated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "certdrill_scenarios_estimated_minutes_positive" CHECK ("estimated_minutes" > 0),
  CONSTRAINT "certdrill_scenarios_status_check" CHECK ("status" IN ('draft', 'validated'))
);

CREATE INDEX "certdrill_scenarios_certification_id_idx"
  ON "certdrill_scenarios" ("certification_id");

CREATE INDEX "certdrill_scenarios_status_idx"
  ON "certdrill_scenarios" ("status");

CREATE TABLE "certdrill_exam_form_scenarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_form_id" uuid NOT NULL REFERENCES "certdrill_exam_forms"("id") ON DELETE cascade,
  "scenario_id" uuid NOT NULL REFERENCES "certdrill_scenarios"("id") ON DELETE cascade,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "certdrill_exam_form_scenarios_form_scenario_idx"
  ON "certdrill_exam_form_scenarios" ("exam_form_id", "scenario_id");

CREATE INDEX "certdrill_exam_form_scenarios_form_id_idx"
  ON "certdrill_exam_form_scenarios" ("exam_form_id");

CREATE INDEX "certdrill_exam_form_scenarios_scenario_id_idx"
  ON "certdrill_exam_form_scenarios" ("scenario_id");
