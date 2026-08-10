ALTER TABLE "certdrill_question_generation_jobs"
  ADD COLUMN "configuration_json" jsonb DEFAULT '{"focus":null,"instructions":null,"difficultyMix":{"easy":20,"medium":60,"hard":20}}'::jsonb NOT NULL;

ALTER TABLE "certdrill_question_generation_jobs"
  ADD COLUMN "resource_checksums_json" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "certdrill_question_generation_jobs"
  ADD COLUMN "raw_output" text;
