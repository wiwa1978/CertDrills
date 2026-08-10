ALTER TABLE "certdrill_certifications" ADD COLUMN "exam_simulation_scenario_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "certdrill_certifications" ADD CONSTRAINT "certdrill_certifications_exam_simulation_scenario_count_nonnegative" CHECK ("exam_simulation_scenario_count" >= 0);

ALTER TABLE "certdrill_exam_attempts" ADD COLUMN "scenario_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL;

CREATE TABLE "certdrill_exam_attempt_scenario_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_attempt_id" uuid NOT NULL REFERENCES "certdrill_exam_attempts"("id") ON DELETE CASCADE,
  "scenario_id" uuid NOT NULL REFERENCES "certdrill_scenarios"("id") ON DELETE RESTRICT,
  "decisions_json" jsonb NOT NULL,
  "earned_points" integer NOT NULL,
  "max_points" integer NOT NULL,
  "score_pct" numeric(5, 2) NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "certdrill_exam_attempt_scenario_responses_attempt_scenario_unique" UNIQUE("exam_attempt_id", "scenario_id"),
  CONSTRAINT "certdrill_exam_attempt_scenario_responses_points_nonnegative" CHECK ("earned_points" >= 0 AND "max_points" > 0),
  CONSTRAINT "certdrill_exam_attempt_scenario_responses_score_range" CHECK ("score_pct" >= 0 AND "score_pct" <= 100)
);
CREATE INDEX "certdrill_exam_attempt_scenario_responses_attempt_id_idx" ON "certdrill_exam_attempt_scenario_responses" ("exam_attempt_id");

UPDATE "certdrill_scenarios" AS scenario
SET "content_json" = jsonb_set(
  scenario."content_json",
  '{nodes}',
  (
    SELECT jsonb_agg(
      jsonb_set(
        node.value,
        '{options}',
        (
          SELECT jsonb_agg(
            option.value || jsonb_build_object('points', CASE WHEN option.ordinality = 1 THEN 100 ELSE 0 END)
            ORDER BY option.ordinality
          )
          FROM jsonb_array_elements(node.value->'options') WITH ORDINALITY AS option(value, ordinality)
        )
      )
      ORDER BY node.ordinality
    )
    FROM jsonb_array_elements(scenario."content_json"->'nodes') WITH ORDINALITY AS node(value, ordinality)
  )
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(scenario."content_json"->'nodes') AS node(value),
       jsonb_array_elements(node.value->'options') AS option(value)
  WHERE NOT option.value ? 'points'
);
