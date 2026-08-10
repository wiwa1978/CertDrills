ALTER TABLE "certdrill_questions"
  ADD COLUMN "question_type" text DEFAULT 'single_choice' NOT NULL,
  ADD COLUMN "interaction_json" jsonb;

ALTER TABLE "certdrill_exam_attempt_answers"
  ADD COLUMN "response_json" jsonb;

UPDATE "certdrill_exam_attempt_answers"
SET "response_json" = jsonb_build_object(
  'type', 'single_choice',
  'selectedOptionId', "selected_option_id"
);

ALTER TABLE "certdrill_exam_attempt_answers"
  ALTER COLUMN "response_json" SET NOT NULL,
  ALTER COLUMN "selected_option_id" DROP NOT NULL;

ALTER TABLE "certdrill_questions"
  ADD CONSTRAINT "certdrill_questions_type_check"
  CHECK ("question_type" IN ('single_choice', 'fill_blank', 'matching'));
