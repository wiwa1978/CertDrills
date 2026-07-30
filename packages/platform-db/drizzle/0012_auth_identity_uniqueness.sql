CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_account_unique_idx"
  ON "account" ("provider_id", "account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credential_id_unique_idx"
  ON "passkey" ("credential_id");
