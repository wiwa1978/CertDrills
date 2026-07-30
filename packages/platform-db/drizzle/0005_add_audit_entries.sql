CREATE TABLE IF NOT EXISTS "audit_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "outcome" text NOT NULL,
  "actor_id" uuid,
  "target_type" text,
  "target_id" text,
  "request_id" text,
  "ip" text,
  "user_agent" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_id_user_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "audit_entries_action_idx" ON "audit_entries" ("action");
CREATE INDEX IF NOT EXISTS "audit_entries_actor_idx" ON "audit_entries" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_entries_target_idx" ON "audit_entries" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_entries_created_at_idx" ON "audit_entries" ("created_at");
