import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const drizzleDirectory = new URL("../../../../packages/platform-db/drizzle/", import.meta.url);
const journalPath = new URL("meta/_journal.json", drizzleDirectory);

describe("Drizzle migration journal", () => {
  it("registers every committed SQL migration exactly once", () => {
    const sqlTags = readdirSync(drizzleDirectory)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.slice(0, -4))
      .sort();
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const journalTags = journal.entries.map((entry) => entry.tag).sort();

    expect(new Set(journalTags).size).toBe(journalTags.length);
    expect(journalTags).toEqual(sqlTags);
  });

  it("preserves the deployed migration chain", () => {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const deployedTags = [
      "0000_initial_schema",
      "0001_add_payment_webhook_events",
      "0002_add_credits_granted_marker",
      "0003_add_payment_snapshot",
      "0004_unique_discount_assignments",
      "0005_add_audit_entries",
      "0006_add_subscription_billing",
      "0007_phase9_credit_usage_idempotency",
      "0008_add_subscription_payments",
      "0009_add_checkout_intents",
      "0010_add_user_data_exports",
      "0011_webhook_observability",
      "0012_auth_identity_uniqueness",
      "0013_provider_neutral_billing_identifiers",
      "0014_admin_billing_dashboard_fields",
      "0015_add_voucher_tables",
      "0016_jobs_email_queue_api_keys",
      "0017_application_settings",
      "0018_exam_entitlements",
      "0019_transaction_billing",
      "0020_certdrill_exam_entitlements",
      "0021_transaction_orders_created_at_id_idx",
      "0022_rate_limit_buckets",
      "0023_background_leases",
      "0024_integrity_constraints",
    ];

    expect(journal.entries.slice(0, deployedTags.length).map((entry) => entry.tag)).toEqual(deployedTags);
    expect(journal.entries.every((entry, index) => index === 0 || entry.when > journal.entries[index - 1]!.when)).toBe(true);
  });

  it("includes the transaction order dashboard index in the incremental chain", () => {
    const migration = readFileSync(new URL("0021_transaction_orders_created_at_id_idx.sql", drizzleDirectory), "utf8");

    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "transaction_orders_created_at_id_idx" ON "transaction_orders" USING btree ("created_at" DESC, "id" DESC);');
  });
});
