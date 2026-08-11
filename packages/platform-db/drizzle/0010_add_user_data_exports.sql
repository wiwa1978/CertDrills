CREATE TABLE IF NOT EXISTS "user_data_export_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "status" text DEFAULT 'pending' NOT NULL,
  "file_name" text,
  "file_size_bytes" integer,
  "download_token_hash" text,
  "export_data" jsonb,
  "expires_at" timestamp with time zone,
  "downloaded_at" timestamp with time zone,
  "failed_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_data_export_request_user_created_idx"
  ON "user_data_export_request" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "user_data_export_request_status_expires_idx"
  ON "user_data_export_request" ("status", "expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "user_data_export_request_token_idx"
  ON "user_data_export_request" ("download_token_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "user_data_export_request_active_user_idx"
  ON "user_data_export_request" ("user_id")
  WHERE "status" IN ('pending', 'ready');
