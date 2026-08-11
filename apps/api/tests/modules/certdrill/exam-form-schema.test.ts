import { readFileSync } from "node:fs";

import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { certdrillExamForms } from "@platform/platform-db";

const migrationSql = readFileSync(
  new URL("../../../../../packages/platform-db/drizzle/0026_certdrill_module.sql", import.meta.url),
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

  it("creates generated assignment metadata and invariants", () => {
    expect(migrationSql).toContain('"target_question_count" integer NOT NULL');
    expect(migrationSql).toContain('"assignment_version" integer DEFAULT 1 NOT NULL');
    expect(migrationSql).toContain('"allocation_snapshot" jsonb DEFAULT \'[]\'::jsonb NOT NULL');
    expect(migrationSql).toContain('"generated_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(migrationSql).toContain('CONSTRAINT "certdrill_exam_forms_target_question_count_positive"');
    expect(migrationSql).toContain('CONSTRAINT "certdrill_exam_forms_assignment_version_positive"');
  });
});
