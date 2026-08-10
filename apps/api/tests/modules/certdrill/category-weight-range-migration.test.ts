import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL("../../../../../packages/platform-db/drizzle/0028_certdrill_category_weight_ranges.sql", import.meta.url),
  "utf8",
);

describe("category weight range migration", () => {
  it("backfills exact weights and historical AI ranges", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE "certdrill_exam_categories" (
        "id" uuid PRIMARY KEY,
        "certification_id" uuid NOT NULL,
        "code" text NOT NULL,
        "weight_pct" numeric(5, 2)
      );
      CREATE TABLE "certdrill_blueprint_parse_runs" (
        "id" uuid PRIMARY KEY,
        "certification_id" uuid NOT NULL,
        "status" text NOT NULL,
        "proposal_json" jsonb,
        "completed_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL
      );
      INSERT INTO "certdrill_exam_categories" ("id", "certification_id", "code", "weight_pct") VALUES
        ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOMAIN-01', 30.00),
        ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'DOMAIN-02', NULL);
      INSERT INTO "certdrill_blueprint_parse_runs" (
        "id", "certification_id", "status", "proposal_json", "completed_at", "created_at"
      ) VALUES (
        '33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'completed',
        '{"categories":[{"code":"DOMAIN-02","weightPct":null,"weightMinPct":20,"weightMaxPct":25}]}'::jsonb,
        '2026-08-09T10:00:00Z',
        '2026-08-09T09:59:00Z'
      );
    `);

    await db.exec(migrationSql);
    const result = await db.query<{ code: string; weight_min_pct: string; weight_max_pct: string }>(`
      SELECT "code", "weight_min_pct", "weight_max_pct"
      FROM "certdrill_exam_categories"
      ORDER BY "code"
    `);

    expect(result.rows).toEqual([
      { code: "DOMAIN-01", weight_min_pct: "30.00", weight_max_pct: "30.00" },
      { code: "DOMAIN-02", weight_min_pct: "20.00", weight_max_pct: "25.00" },
    ]);

    await db.close();
  });
});
