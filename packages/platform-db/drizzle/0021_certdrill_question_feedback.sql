CREATE TABLE IF NOT EXISTS "certdrill_question_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL REFERENCES "certdrill_questions"("id") ON DELETE cascade,
  "exam_attempt_id" uuid REFERENCES "certdrill_exam_attempts"("id") ON DELETE set null,
  "rating" integer NOT NULL,
  "dispute_correct_answer" boolean DEFAULT false NOT NULL,
  "message" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "certdrill_question_feedback_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5),
  CONSTRAINT "certdrill_question_feedback_status_check" CHECK ("status" IN ('open', 'reviewed', 'resolved'))
);

CREATE INDEX IF NOT EXISTS "certdrill_question_feedback_user_id_idx" ON "certdrill_question_feedback" ("user_id");
CREATE INDEX IF NOT EXISTS "certdrill_question_feedback_question_id_idx" ON "certdrill_question_feedback" ("question_id");
CREATE INDEX IF NOT EXISTS "certdrill_question_feedback_exam_attempt_id_idx" ON "certdrill_question_feedback" ("exam_attempt_id");
CREATE INDEX IF NOT EXISTS "certdrill_question_feedback_status_idx" ON "certdrill_question_feedback" ("status");
CREATE INDEX IF NOT EXISTS "certdrill_question_feedback_created_at_idx" ON "certdrill_question_feedback" ("created_at");
