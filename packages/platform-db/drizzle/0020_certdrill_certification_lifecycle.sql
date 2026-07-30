ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "enabled_at" timestamp with time zone;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "certdrill_certifications_enabled_at_idx" ON "certdrill_certifications" ("enabled_at");
CREATE INDEX IF NOT EXISTS "certdrill_certifications_archived_at_idx" ON "certdrill_certifications" ("archived_at");
