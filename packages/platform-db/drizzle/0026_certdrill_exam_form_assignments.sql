ALTER TABLE "certdrill_exam_forms" ADD COLUMN "target_question_count" integer;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "generated_at" timestamp with time zone;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "assignment_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "allocation_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "certdrill_exam_forms"
SET
  "target_question_count" = GREATEST(cardinality("question_ids"), 1),
  "generated_at" = COALESCE("updated_at", "created_at", now());

WITH RECURSIVE "category_ancestry" AS (
  SELECT
    "category"."id" AS "category_id",
    "category"."id" AS "root_category_id"
  FROM "certdrill_exam_categories" "category"
  WHERE "category"."parent_category_id" IS NULL

  UNION ALL

  SELECT
    "child"."id" AS "category_id",
    "ancestry"."root_category_id"
  FROM "certdrill_exam_categories" "child"
  INNER JOIN "category_ancestry" "ancestry"
    ON "child"."parent_category_id" = "ancestry"."category_id"
),
"allocation_counts" AS (
  SELECT
    "form"."id" AS "form_id",
    "ancestry"."root_category_id",
    count(*)::integer AS "assigned_count"
  FROM "certdrill_exam_forms" "form"
  CROSS JOIN LATERAL unnest("form"."question_ids") WITH ORDINALITY AS "assignment"("question_id", "position")
  INNER JOIN "certdrill_questions" "question"
    ON "question"."id" = "assignment"."question_id"
    AND "question"."certification_id" = "form"."certification_id"
  INNER JOIN "category_ancestry" "ancestry"
    ON "ancestry"."category_id" = "question"."category_id"
  GROUP BY "form"."id", "ancestry"."root_category_id"
),
"allocation_snapshots" AS (
  SELECT
    "counts"."form_id",
    jsonb_agg(
      jsonb_build_object(
        'categoryId', "root"."id",
        'categoryName', "root"."name",
        'weightPct', to_char(COALESCE("root"."weight_pct", 0.00), 'FM999990.00'),
        'allocatedCount', "counts"."assigned_count",
        'assignedCount', "counts"."assigned_count"
      )
      ORDER BY "root"."sort_order", "root"."id"
    ) AS "allocation_snapshot"
  FROM "allocation_counts" "counts"
  INNER JOIN "certdrill_exam_categories" "root"
    ON "root"."id" = "counts"."root_category_id"
  GROUP BY "counts"."form_id"
)
UPDATE "certdrill_exam_forms" "form"
SET "allocation_snapshot" = "snapshot"."allocation_snapshot"
FROM "allocation_snapshots" "snapshot"
WHERE "snapshot"."form_id" = "form"."id";

UPDATE "certdrill_exam_forms"
SET "is_active" = false
WHERE cardinality("question_ids") = 0;

UPDATE "certdrill_exam_forms" form SET is_active=false
WHERE COALESCE((SELECT sum((allocation ->> 'assignedCount')::integer) FROM jsonb_array_elements(form.allocation_snapshot) allocation),0) <> cardinality(form.question_ids);

ALTER TABLE "certdrill_exam_forms" ALTER COLUMN "target_question_count" SET NOT NULL;
ALTER TABLE "certdrill_exam_forms" ALTER COLUMN "generated_at" SET NOT NULL;
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_target_question_count_positive" CHECK ("target_question_count" > 0);
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_duration_minutes_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_assignment_version_positive" CHECK ("assignment_version" > 0);
