import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(join(process.cwd(), "../../README.md"), "utf8");
const databaseReadme = readFileSync(join(process.cwd(), "../../packages/platform-db/README.md"), "utf8");

describe("deployment README", () => {
  it("documents the explicit test-mode Dodo environment for the current catalog", () => {
    expect(readme).toContain("`DODO_PAYMENTS_ENVIRONMENT`: required; set to `test_mode` for the current committed test catalog");
    expect(readme).not.toContain("`DODO_PAYMENTS_ENVIRONMENT`: defaults to `live_mode`");
  });

  it("documents all mode-specific Dodo brand variables and active-only requirement", () => {
    expect(readme).toContain("`DODO_CREDITS_BRAND_ID`");
    expect(readme).toContain("`DODO_SUBSCRIPTIONS_BRAND_ID`");
    expect(readme).toContain("`DODO_TRANSACTIONS_BRAND_ID`");
    expect(readme).toContain("Only the brand variable for the compile-time active billing mode is required");
  });

  it("warns that live mode requires a separate live catalog", () => {
    expect(readme).toContain("Do not switch to `live_mode` until separate live product IDs and live brand IDs are configured");
  });

  it("documents the operational lock for transaction dashboard index migration 0021", () => {
    expect(databaseReadme).toContain("`0021_transaction_orders_created_at_id_idx` uses a normal `CREATE INDEX`");
    expect(databaseReadme).toContain("brief write lock");
    expect(databaseReadme).toContain("maintenance window");
  });
});
