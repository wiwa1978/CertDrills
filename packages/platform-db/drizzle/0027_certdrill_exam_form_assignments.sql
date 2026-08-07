ALTER TABLE "certdrill_exam_forms" ADD COLUMN "target_question_count" integer;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now();
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
    AND "category"."archived_at" IS NULL

  UNION ALL

  SELECT
    "child"."id" AS "category_id",
    "ancestry"."root_category_id"
  FROM "certdrill_exam_categories" "child"
  INNER JOIN "category_ancestry" "ancestry"
    ON "child"."parent_category_id" = "ancestry"."category_id"
  WHERE "child"."archived_at" IS NULL
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
    AND "question"."status" = 'published'
  INNER JOIN "category_ancestry" "ancestry"
    ON "ancestry"."category_id" = "question"."category_id"
  GROUP BY "form"."id", "ancestry"."root_category_id"
),
"weighted_roots" AS (
  SELECT
    "form"."id" AS "form_id",
    "root"."id" AS "root_category_id",
    "root"."name" AS "category_name",
    "root"."weight_pct",
    "root"."sort_order",
    round("root"."weight_pct" * 100)::integer AS "weight_basis_points",
    (cardinality("form"."question_ids") * round("root"."weight_pct" * 100)::integer) / 10000 AS "floor_count",
    (cardinality("form"."question_ids") * round("root"."weight_pct" * 100)::integer) % 10000 AS "remainder"
  FROM "certdrill_exam_forms" "form"
  INNER JOIN "certdrill_exam_categories" "root"
    ON "root"."certification_id" = "form"."certification_id"
    AND "root"."parent_category_id" IS NULL
    AND "root"."archived_at" IS NULL
),
"ranked_roots" AS (
  SELECT
    "weighted".*,
    cardinality("form"."question_ids") - sum("weighted"."floor_count") OVER (PARTITION BY "weighted"."form_id") AS "remaining_count",
    row_number() OVER (PARTITION BY "weighted"."form_id" ORDER BY "weighted"."remainder" DESC, "weighted"."sort_order", "weighted"."root_category_id") AS "remainder_rank",
    sum("weighted"."weight_basis_points") OVER (PARTITION BY "weighted"."form_id") AS "total_weight_basis_points",
    bool_and(
      "weighted"."weight_pct" IS NOT NULL
      AND "weighted"."weight_pct" > 0
      AND "weighted"."weight_pct" <= 100
      AND "weighted"."weight_pct" * 100 = round("weighted"."weight_pct" * 100)
    ) OVER (PARTITION BY "weighted"."form_id") AS "all_weights_valid"
  FROM "weighted_roots" "weighted"
  INNER JOIN "certdrill_exam_forms" "form" ON "form"."id" = "weighted"."form_id"
),
"expected_allocations" AS (
  SELECT
    "ranked"."form_id",
    "ranked"."root_category_id",
    "ranked"."category_name",
    "ranked"."weight_pct",
    "ranked"."sort_order",
    "ranked"."total_weight_basis_points",
    "ranked"."all_weights_valid",
    ("ranked"."floor_count" + CASE WHEN "ranked"."remainder_rank" <= "ranked"."remaining_count" THEN 1 ELSE 0 END)::integer AS "allocated_count"
  FROM "ranked_roots" "ranked"
),
"allocation_snapshots" AS (
  SELECT
    "expected"."form_id",
    jsonb_agg(
      jsonb_build_object(
        'categoryId', "expected"."root_category_id",
        'categoryName', "expected"."category_name",
        'weightPct', to_char("expected"."weight_pct", 'FM999990.00'),
        'allocatedCount', "expected"."allocated_count",
        'assignedCount', COALESCE("counts"."assigned_count", 0)
      )
      ORDER BY "expected"."sort_order", "expected"."root_category_id"
    ) AS "allocation_snapshot"
  FROM "expected_allocations" "expected"
  LEFT JOIN "allocation_counts" "counts"
    ON "counts"."form_id" = "expected"."form_id"
    AND "counts"."root_category_id" = "expected"."root_category_id"
  WHERE "expected"."all_weights_valid"
    AND "expected"."total_weight_basis_points" = 10000
  GROUP BY "expected"."form_id"
)
UPDATE "certdrill_exam_forms" "form"
SET "allocation_snapshot" = "snapshot"."allocation_snapshot"
FROM "allocation_snapshots" "snapshot"
WHERE "snapshot"."form_id" = "form"."id";

UPDATE "certdrill_exam_forms" form SET "is_active" = false
WHERE cardinality(form."question_ids") = 0
   OR cardinality(form."question_ids") <> (SELECT count(DISTINCT "question_id") FROM unnest(form."question_ids") AS assigned("question_id"))
   OR COALESCE((SELECT sum((allocation ->> 'assignedCount')::integer) FROM jsonb_array_elements(form."allocation_snapshot") allocation), 0) <> cardinality(form."question_ids")
   OR EXISTS (
     SELECT 1
     FROM jsonb_array_elements(form."allocation_snapshot") allocation
     WHERE (allocation ->> 'assignedCount')::integer <> (allocation ->> 'allocatedCount')::integer
   );

ALTER TABLE "certdrill_exam_forms" ALTER COLUMN "target_question_count" SET NOT NULL;
ALTER TABLE "certdrill_exam_forms" ALTER COLUMN "generated_at" SET NOT NULL;
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_target_question_count_positive" CHECK ("target_question_count" > 0);
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_duration_minutes_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_assignment_version_positive" CHECK ("assignment_version" > 0);
