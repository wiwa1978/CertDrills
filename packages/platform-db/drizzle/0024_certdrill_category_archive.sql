ALTER TABLE "certdrill_exam_categories" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "certdrill_exam_categories_archived_at_idx" ON "certdrill_exam_categories" ("archived_at");
