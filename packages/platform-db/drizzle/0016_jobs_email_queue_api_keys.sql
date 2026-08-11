CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'idle' NOT NULL,
  "interval_seconds" integer NOT NULL,
  "next_run_at" timestamp with time zone NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "last_run_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_failure_at" timestamp with time zone,
  "last_error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "jobs_name_idx" ON "jobs" ("name");
CREATE INDEX IF NOT EXISTS "jobs_status_next_run_idx" ON "jobs" ("status", "next_run_at");

CREATE TABLE IF NOT EXISTS "job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" text NOT NULL,
  "job_name" text NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone NOT NULL,
  "duration_ms" integer NOT NULL,
  "result" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "job_runs_job_name_started_idx" ON "job_runs" ("job_name", "started_at");
CREATE INDEX IF NOT EXISTS "job_runs_status_started_idx" ON "job_runs" ("status", "started_at");

CREATE TABLE IF NOT EXISTS "pending_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "to" text NOT NULL,
  "subject" text NOT NULL,
  "html" text NOT NULL,
  "text" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_error" text,
  "provider_message_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pending_emails_status_next_attempt_idx" ON "pending_emails" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "pending_emails_created_idx" ON "pending_emails" ("created_at");

CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "scopes" text[] NOT NULL,
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_user_created_idx" ON "api_keys" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "api_keys_user_revoked_idx" ON "api_keys" ("user_id", "revoked_at");

ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "dead_lettered_at" timestamp with time zone;
