ALTER TABLE "certdrill_questions"
  ADD COLUMN "delivery_purpose" text DEFAULT 'both' NOT NULL;

ALTER TABLE "certdrill_questions"
  ADD CONSTRAINT "certdrill_questions_delivery_purpose_check"
  CHECK ("delivery_purpose" IN ('practice', 'assessment', 'both'));

CREATE INDEX "certdrill_questions_delivery_purpose_idx"
  ON "certdrill_questions" ("certification_id", "status", "delivery_purpose");
