import { readFileSync } from "node:fs";

import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { certdrillExamForms } from "@platform/platform-db";

const migrationSql = readFileSync(
  new URL("../../../../../packages/platform-db/drizzle/0027_certdrill_exam_form_assignments.sql", import.meta.url),
  "utf8",
);

describe("CertDrill exam form schema", () => {
  it("persists generated assignment metadata", () => {
    const columns = getTableColumns(certdrillExamForms);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "targetQuestionCount",
        "assignmentVersion",
        "allocationSnapshot",
        "generatedAt",
      ]),
    );
  });

  it("gives generated timestamps a database default", () => {
    expect(migrationSql).toMatch(
      /ADD COLUMN "generated_at" timestamp with time zone DEFAULT now\(\)/,
    );
  });

  it("deactivates invalid legacy assignments in one update", () => {
    const deactivationUpdates = migrationSql.match(
      /UPDATE "certdrill_exam_forms"(?:.|\n)*?SET "?is_active"?\s*=\s*false/g,
    );

    expect(deactivationUpdates).toHaveLength(1);
    expect(migrationSql).toContain('cardinality(form."question_ids") <> (SELECT count(DISTINCT "question_id")');
    expect(migrationSql).toContain("(allocation ->> 'assignedCount')::integer <> (allocation ->> 'allocatedCount')::integer");
  });
});
