ALTER TABLE "certdrill_exam_categories" ADD COLUMN "weight_min_pct" numeric(5, 2);
ALTER TABLE "certdrill_exam_categories" ADD COLUMN "weight_max_pct" numeric(5, 2);

UPDATE "certdrill_exam_categories"
SET
  "weight_min_pct" = "weight_pct",
  "weight_max_pct" = "weight_pct"
WHERE "weight_pct" IS NOT NULL;

WITH "latest_discovered_weights" AS (
  SELECT DISTINCT ON ("category"."id")
    "category"."id" AS "category_id",
    ("proposal_category"."value" ->> 'weightMinPct')::numeric(5, 2) AS "weight_min_pct",
    ("proposal_category"."value" ->> 'weightMaxPct')::numeric(5, 2) AS "weight_max_pct"
  FROM "certdrill_exam_categories" "category"
  INNER JOIN "certdrill_blueprint_parse_runs" "run"
    ON "run"."certification_id" = "category"."certification_id"
    AND "run"."status" = 'completed'
  CROSS JOIN LATERAL jsonb_array_elements("run"."proposal_json" -> 'categories') "proposal_category"("value")
  WHERE upper(trim("proposal_category"."value" ->> 'code')) = upper(trim("category"."code"))
    AND jsonb_typeof("proposal_category"."value" -> 'weightMinPct') = 'number'
    AND jsonb_typeof("proposal_category"."value" -> 'weightMaxPct') = 'number'
  ORDER BY "category"."id", "run"."completed_at" DESC NULLS LAST, "run"."created_at" DESC
)
UPDATE "certdrill_exam_categories" "category"
SET
  "weight_min_pct" = "weights"."weight_min_pct",
  "weight_max_pct" = "weights"."weight_max_pct"
FROM "latest_discovered_weights" "weights"
WHERE "category"."id" = "weights"."category_id"
  AND "category"."weight_min_pct" IS NULL
  AND "category"."weight_max_pct" IS NULL;
