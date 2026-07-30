CREATE TABLE IF NOT EXISTS "certdrill_review_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "question_id" uuid NOT NULL REFERENCES "certdrill_questions"("id") ON DELETE cascade,
  "due_at" timestamp with time zone NOT NULL,
  "reason" text NOT NULL,
  "interval_days" integer DEFAULT 1 NOT NULL,
  "ease" numeric(4, 2) DEFAULT '2.50' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "certdrill_review_queue_reason_check" CHECK ("reason" IN ('incorrect', 'low_confidence', 'incorrect_low_confidence')),
  CONSTRAINT "certdrill_review_queue_status_check" CHECK ("status" IN ('active', 'completed', 'dismissed')),
  CONSTRAINT "certdrill_review_queue_interval_days_positive" CHECK ("interval_days" >= 1),
  CONSTRAINT "certdrill_review_queue_ease_positive" CHECK ("ease" > 0)
);

CREATE INDEX IF NOT EXISTS "certdrill_review_queue_user_due_idx" ON "certdrill_review_queue" ("user_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "certdrill_review_queue_certification_id_idx" ON "certdrill_review_queue" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_review_queue_question_id_idx" ON "certdrill_review_queue" ("question_id");
CREATE UNIQUE INDEX IF NOT EXISTS "certdrill_review_queue_user_cert_question_idx" ON "certdrill_review_queue" ("user_id", "certification_id", "question_id");
