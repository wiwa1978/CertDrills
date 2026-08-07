import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL("../../../../../packages/platform-db/drizzle/0026_certdrill_exam_form_assignments.sql", import.meta.url),
  "utf8",
);

const ids = {
  certification: "00000000-0000-4000-8000-000000000001",
  nullWeightCertification: "00000000-0000-4000-8000-000000000002",
  zeroWeightCertification: "00000000-0000-4000-8000-000000000003",
  rootA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  childA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  grandchildA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  rootB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  nullWeightRoot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  nullWeightValidRoot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
  zeroWeightRoot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
  zeroWeightValidRoot: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
  questionA: "11111111-1111-4111-8111-111111111111",
  questionB: "22222222-2222-4222-8222-222222222222",
  questionA2: "22222222-2222-4222-8222-222222222223",
  missingQuestion: "33333333-3333-4333-8333-333333333333",
  draftQuestion: "33333333-3333-4333-8333-333333333334",
  archivedQuestion: "33333333-3333-4333-8333-333333333335",
  nullWeightQuestion: "33333333-3333-4333-8333-333333333336",
  zeroWeightQuestion: "33333333-3333-4333-8333-333333333337",
  archivedCategory: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  mappedForm: "44444444-4444-4444-8444-444444444441",
  unmappableForm: "44444444-4444-4444-8444-444444444442",
  emptyForm: "44444444-4444-4444-8444-444444444443",
  fallbackForm: "44444444-4444-4444-8444-444444444444",
  defaultForm: "44444444-4444-4444-8444-444444444445",
  duplicateForm: "44444444-4444-4444-8444-444444444446",
  draftForm: "44444444-4444-4444-8444-444444444447",
  archivedCategoryForm: "44444444-4444-4444-8444-444444444448",
  staleDistributionForm: "44444444-4444-4444-8444-444444444449",
  nullWeightForm: "44444444-4444-4444-8444-444444444450",
  zeroWeightForm: "44444444-4444-4444-8444-444444444451",
};

describe("CertDrill exam form assignment migration", () => {
  it("backfills legacy forms and enforces assignment metadata invariants", async () => {
    const db = new PGlite();

    try {
      await db.exec(`
        CREATE TABLE "certdrill_exam_categories" (
          "id" uuid PRIMARY KEY,
          "certification_id" uuid NOT NULL,
          "parent_category_id" uuid,
          "name" text NOT NULL,
          "weight_pct" numeric(5, 2),
          "sort_order" integer NOT NULL,
          "archived_at" timestamp with time zone
        );

        CREATE TABLE "certdrill_questions" (
          "id" uuid PRIMARY KEY,
          "certification_id" uuid NOT NULL,
          "category_id" uuid NOT NULL,
          "status" text NOT NULL
        );

        CREATE TABLE "certdrill_exam_forms" (
          "id" uuid PRIMARY KEY,
          "certification_id" uuid NOT NULL,
          "is_active" boolean NOT NULL,
          "duration_minutes" integer NOT NULL,
          "question_ids" uuid[] NOT NULL,
          "created_at" timestamp with time zone,
          "updated_at" timestamp with time zone
        );

        INSERT INTO "certdrill_exam_categories"
          ("id", "certification_id", "parent_category_id", "name", "weight_pct", "sort_order", "archived_at")
        VALUES
          ('${ids.rootA}', '${ids.certification}', NULL, 'Domain A', 60.00, 2, NULL),
          ('${ids.childA}', '${ids.certification}', '${ids.rootA}', 'Child A', NULL, 1, NULL),
          ('${ids.grandchildA}', '${ids.certification}', '${ids.childA}', 'Grandchild A', NULL, 1, NULL),
          ('${ids.archivedCategory}', '${ids.certification}', '${ids.rootA}', 'Archived A', NULL, 2, now()),
          ('${ids.rootB}', '${ids.certification}', NULL, 'Domain B', 40.00, 1, NULL),
          ('${ids.nullWeightValidRoot}', '${ids.nullWeightCertification}', NULL, 'Valid 100', 100.00, 1, NULL),
          ('${ids.nullWeightRoot}', '${ids.nullWeightCertification}', NULL, 'Missing weight', NULL, 2, NULL),
          ('${ids.zeroWeightValidRoot}', '${ids.zeroWeightCertification}', NULL, 'Valid 100', 100.00, 1, NULL),
          ('${ids.zeroWeightRoot}', '${ids.zeroWeightCertification}', NULL, 'Zero weight', 0.00, 2, NULL);

        INSERT INTO "certdrill_questions" ("id", "certification_id", "category_id", "status")
        VALUES
          ('${ids.questionA}', '${ids.certification}', '${ids.grandchildA}', 'published'),
          ('${ids.questionA2}', '${ids.certification}', '${ids.grandchildA}', 'published'),
          ('${ids.questionB}', '${ids.certification}', '${ids.rootB}', 'published'),
          ('${ids.draftQuestion}', '${ids.certification}', '${ids.grandchildA}', 'draft'),
          ('${ids.archivedQuestion}', '${ids.certification}', '${ids.archivedCategory}', 'published'),
          ('${ids.nullWeightQuestion}', '${ids.nullWeightCertification}', '${ids.nullWeightValidRoot}', 'published'),
          ('${ids.zeroWeightQuestion}', '${ids.zeroWeightCertification}', '${ids.zeroWeightValidRoot}', 'published');

        INSERT INTO "certdrill_exam_forms"
          ("id", "certification_id", "is_active", "duration_minutes", "question_ids", "created_at", "updated_at")
        VALUES
          ('${ids.mappedForm}', '${ids.certification}', true, 120, ARRAY['${ids.questionA}', '${ids.questionB}']::uuid[], '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'),
          ('${ids.unmappableForm}', '${ids.certification}', true, 120, ARRAY['${ids.missingQuestion}']::uuid[], '2026-01-02T00:00:00Z', '2026-02-02T00:00:00Z'),
          ('${ids.emptyForm}', '${ids.certification}', true, 120, ARRAY[]::uuid[], '2026-01-03T00:00:00Z', '2026-02-03T00:00:00Z'),
          ('${ids.fallbackForm}', '${ids.certification}', true, 120, ARRAY['${ids.questionA}']::uuid[], '2026-01-04T00:00:00Z', NULL),
          ('${ids.duplicateForm}', '${ids.certification}', true, 120, ARRAY['${ids.questionA}', '${ids.questionA}']::uuid[], now(), now()),
          ('${ids.draftForm}', '${ids.certification}', true, 120, ARRAY['${ids.draftQuestion}']::uuid[], now(), now()),
          ('${ids.archivedCategoryForm}', '${ids.certification}', true, 120, ARRAY['${ids.archivedQuestion}']::uuid[], now(), now()),
          ('${ids.staleDistributionForm}', '${ids.certification}', true, 120, ARRAY['${ids.questionA}', '${ids.questionA2}']::uuid[], now(), now()),
          ('${ids.nullWeightForm}', '${ids.nullWeightCertification}', true, 120, ARRAY['${ids.nullWeightQuestion}']::uuid[], now(), now()),
          ('${ids.zeroWeightForm}', '${ids.zeroWeightCertification}', true, 120, ARRAY['${ids.zeroWeightQuestion}']::uuid[], now(), now());
      `);

      await db.exec(migrationSql);

      const result = await db.query(`
        SELECT
          "id",
          "is_active" AS "isActive",
          "target_question_count" AS "targetQuestionCount",
          "assignment_version" AS "assignmentVersion",
          "allocation_snapshot" AS "allocationSnapshot",
          "generated_at" AS "generatedAt"
        FROM "certdrill_exam_forms"
        ORDER BY "id"
      `);

      expect(result.rows).toEqual([
        {
          id: ids.mappedForm,
          isActive: true,
          targetQuestionCount: 2,
          assignmentVersion: 1,
          allocationSnapshot: [
            { categoryId: ids.rootB, categoryName: "Domain B", weightPct: "40.00", allocatedCount: 1, assignedCount: 1 },
            { categoryId: ids.rootA, categoryName: "Domain A", weightPct: "60.00", allocatedCount: 1, assignedCount: 1 },
          ],
          generatedAt: new Date("2026-02-01T00:00:00Z"),
        },
        expect.objectContaining({
          id: ids.unmappableForm,
          isActive: false,
          targetQuestionCount: 1,
        }),
        expect.objectContaining({
          id: ids.emptyForm,
          isActive: false,
          targetQuestionCount: 1,
        }),
        expect.objectContaining({
          id: ids.fallbackForm,
          isActive: true,
          targetQuestionCount: 1,
          generatedAt: new Date("2026-01-04T00:00:00Z"),
        }),
        expect.objectContaining({ id: ids.duplicateForm, isActive: false }),
        expect.objectContaining({ id: ids.draftForm, isActive: false }),
        expect.objectContaining({ id: ids.archivedCategoryForm, isActive: false }),
        expect.objectContaining({ id: ids.staleDistributionForm, isActive: false }),
        expect.objectContaining({ id: ids.nullWeightForm, isActive: false }),
        expect.objectContaining({ id: ids.zeroWeightForm, isActive: false }),
      ]);

      for (const row of result.rows as Array<{ allocationSnapshot: Array<{ weightPct: unknown }> }>) {
        expect(row.allocationSnapshot.every((allocation) => typeof allocation.weightPct === "string")).toBe(true);
      }

      await db.query(`
        INSERT INTO "certdrill_exam_forms"
          ("id", "certification_id", "is_active", "duration_minutes", "target_question_count", "question_ids")
        VALUES ('${ids.defaultForm}', '${ids.certification}', false, 120, 1, ARRAY[]::uuid[])
      `);
      const defaultResult = await db.query(
        `SELECT "generated_at" AS "generatedAt" FROM "certdrill_exam_forms" WHERE "id" = '${ids.defaultForm}'`,
      );
      expect(defaultResult.rows[0]).toEqual({ generatedAt: expect.any(Date) });

      await expect(
        db.query(`UPDATE "certdrill_exam_forms" SET "target_question_count" = 0 WHERE "id" = '${ids.mappedForm}'`),
      ).rejects.toThrow(/certdrill_exam_forms_target_question_count_positive/);
      await expect(
        db.query(`UPDATE "certdrill_exam_forms" SET "duration_minutes" = 0 WHERE "id" = '${ids.mappedForm}'`),
      ).rejects.toThrow(/certdrill_exam_forms_duration_minutes_positive/);
      await expect(
        db.query(`UPDATE "certdrill_exam_forms" SET "assignment_version" = 0 WHERE "id" = '${ids.mappedForm}'`),
      ).rejects.toThrow(/certdrill_exam_forms_assignment_version_positive/);
    } finally {
      await db.close();
    }
  });
});
