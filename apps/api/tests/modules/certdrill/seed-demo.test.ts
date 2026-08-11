import { getTableName, type Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { seedCertDrillDemoData } from "../../../src/product/certdrill/seed-demo";

type CertificationRow = {
  id: string;
  quickDrillQuestionCount?: number | null;
  categoryDrillQuestionCount?: number | null;
  examSimulationQuestionCount?: number | null;
  examSimulationDurationMinutes?: number | null;
};

type InsertEntry = { table: string; values: Record<string, unknown> };
type UpdateEntry = { table: string; values: Record<string, unknown> };

const awsQuestion1Stem = "A company needs to store application secrets for an AWS Lambda function. Which service should be used to rotate and retrieve the secrets securely?";
const awsQuestion2Stem = "Which design gives private subnets outbound internet access without accepting inbound internet connections?";
const azQuestion1Stem = "Which Azure feature should you use to enforce that new resources include a cost center tag?";
const azQuestion2Stem = "An administrator needs to grant a user permission to restart virtual machines in one resource group only. What should be configured?";

function createSeedDb(input: {
  certifications: Array<CertificationRow | null>;
  categories?: Array<{ id: string } | null>;
  questionRows?: Array<Array<{ id: string; stem?: string }>>;
  forms?: Array<Array<{ sortOrder: number }>>;
}) {
  const inserts: InsertEntry[] = [];
  const updates: UpdateEntry[] = [];
  const certifications = [...input.certifications];
  const categories = [...(input.categories ?? [])];
  const questionRows = [...(input.questionRows ?? [])];
  const forms = [...(input.forms ?? [])];
  const questionCountsByCertification = new Map<string, number>();

  const db = {
    query: {
      certdrillCertifications: {
        findFirst: async () => certifications.shift() ?? null,
      },
      certdrillExamCategories: {
        findFirst: async () => categories.shift() ?? null,
      },
      certdrillExamForms: {
        findFirst: async () => (forms.shift() ?? [])[0] ?? null,
        findMany: async () => forms.shift() ?? [],
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => questionRows.shift() ?? [],
        }),
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        const tableName = getTableName(table);
        inserts.push({ table: tableName, values });

        const certificationId = String(values.certificationId ?? values.code);
        const questionCount = questionCountsByCertification.get(certificationId) ?? 0;
        const id = tableName === "certdrill_certifications"
          ? `${values.code}-cert`
          : tableName === "certdrill_exam_categories"
            ? `${values.certificationId}-${values.code}-category`
            : tableName === "certdrill_questions"
              ? `${certificationId}-question-${questionCount + 1}`
              : `${certificationId}-${tableName}-${inserts.length}`;

        if (tableName === "certdrill_questions") {
          questionCountsByCertification.set(certificationId, questionCount + 1);
        }

        return { returning: async () => [{ id }] };
      },
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => {
        updates.push({ table: getTableName(table), values });
        return { where: async () => undefined };
      },
    }),
  };

  return { db, inserts, updates };
}

describe("CertDrill demo seeder", () => {
  it("creates new demo certifications with defaults and one exam form from available questions", async () => {
    const { db, inserts } = createSeedDb({ certifications: [null, null] });

    const result = await seedCertDrillDemoData(db as never);

    expect(result).toEqual({ createdCertifications: 2, skippedCertifications: 0 });

    const certificationInserts = inserts.filter((entry) => entry.table === "certdrill_certifications");
    expect(certificationInserts).toHaveLength(2);
    expect(certificationInserts[0]?.values).toMatchObject({
      quickDrillQuestionCount: 10,
      categoryDrillQuestionCount: 10,
      examSimulationQuestionCount: 2,
      examSimulationDurationMinutes: 120,
    });

    const formInserts = inserts.filter((entry) => entry.table === "certdrill_exam_forms");
    expect(formInserts).toHaveLength(2);
    expect(formInserts[0]?.values).toMatchObject({
      name: "Exam Form A",
      sortOrder: 1,
      isActive: true,
      durationMinutes: 120,
      questionIds: ["AWS-SAA-C03-cert-question-1", "AWS-SAA-C03-cert-question-2"],
      allocationSnapshot: [expect.objectContaining({ categoryName: "Design Secure Architectures", weightPct: "100.00", assignedCount: 2 })],
    });
  });

  it("creates Exam Form A, B, and C when enough ordered question IDs exist", async () => {
    const { db, inserts } = createSeedDb({
      certifications: [
        { id: "aws-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
        { id: "az-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
      ],
      categories: [{ id: "aws-category" }, { id: "az-category" }],
      questionRows: [
        [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }, { id: "q5" }, { id: "q6" }],
        [{ id: "az-q1" }, { id: "az-q2" }],
      ],
      forms: [[], [{ sortOrder: 1 }]],
    });

    await seedCertDrillDemoData(db as never);

    const awsForms = inserts
      .filter((entry) => entry.table === "certdrill_exam_forms" && entry.values.certificationId === "aws-cert")
      .map((entry) => entry.values);
    expect(awsForms).toEqual([
      expect.objectContaining({ name: "Exam Form A", sortOrder: 1, questionIds: ["q1", "q2"] }),
      expect.objectContaining({ name: "Exam Form B", sortOrder: 2, questionIds: ["q3", "q4"] }),
      expect.objectContaining({ name: "Exam Form C", sortOrder: 3, questionIds: ["q5", "q6"] }),
    ]);
  });

  it("sizes existing-certification exam forms from the effective exam simulation count", async () => {
    const { db, inserts } = createSeedDb({
      certifications: [
        { id: "aws-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 3, examSimulationDurationMinutes: 120 },
        { id: "az-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
      ],
      categories: [{ id: "aws-category" }, { id: "az-category" }],
      questionRows: [
        [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }, { id: "q5" }, { id: "q6" }],
        [{ id: "az-q1" }, { id: "az-q2" }],
      ],
      forms: [[], [{ sortOrder: 1 }]],
    });

    await seedCertDrillDemoData(db as never);

    const awsForms = inserts
      .filter((entry) => entry.table === "certdrill_exam_forms" && entry.values.certificationId === "aws-cert")
      .map((entry) => entry.values);
    expect(awsForms).toEqual([
      expect.objectContaining({ name: "Exam Form A", sortOrder: 1, questionIds: ["q1", "q2", "q3"] }),
      expect.objectContaining({ name: "Exam Form B", sortOrder: 2, questionIds: ["q4", "q5", "q6"] }),
    ]);
  });

  it("preserves existing exam simulation counts while repairing missing demo questions and forms", async () => {
    const { db, inserts, updates } = createSeedDb({
      certifications: [
        { id: "aws-cert", quickDrillQuestionCount: 0, categoryDrillQuestionCount: null, examSimulationQuestionCount: 60, examSimulationDurationMinutes: 0 },
        { id: "az-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
      ],
      categories: [null, { id: "az-category" }],
      questionRows: [[], [{ id: "az-q1", stem: azQuestion1Stem }, { id: "az-q2", stem: azQuestion2Stem }]],
      forms: [[], [{ sortOrder: 1 }]],
    });

    const result = await seedCertDrillDemoData(db as never);

    expect(result).toEqual({ createdCertifications: 0, skippedCertifications: 2 });
    expect(updates[0]?.values).toMatchObject({
      quickDrillQuestionCount: 10,
      categoryDrillQuestionCount: 10,
      examSimulationQuestionCount: 60,
      examSimulationDurationMinutes: 120,
    });
    expect(inserts.some((entry) => entry.table === "certdrill_exam_categories" && entry.values.certificationId === "aws-cert")).toBe(true);

    const awsQuestionInserts = inserts.filter((entry) => entry.table === "certdrill_questions" && entry.values.certificationId === "aws-cert");
    expect(awsQuestionInserts).toHaveLength(2);
    expect(inserts.filter((entry) => entry.table === "certdrill_answer_options")).toHaveLength(4);
    expect(inserts.find((entry) => entry.table === "certdrill_exam_forms" && entry.values.certificationId === "aws-cert")?.values).toMatchObject({
      name: "Exam Form A",
      sortOrder: 1,
      questionIds: ["aws-cert-question-1", "aws-cert-question-2"],
    });
  });

  it("repairs individually missing demo questions for partially seeded existing certifications", async () => {
    const { db, inserts } = createSeedDb({
      certifications: [
        { id: "aws-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
        { id: "az-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
      ],
      categories: [{ id: "aws-category" }, { id: "az-category" }],
      questionRows: [
        [{ id: "aws-existing-question-1", stem: awsQuestion1Stem }],
        [{ id: "az-q1", stem: azQuestion1Stem }, { id: "az-q2", stem: azQuestion2Stem }],
      ],
      forms: [[], [{ sortOrder: 1 }]],
    });

    await seedCertDrillDemoData(db as never);

    const awsQuestionInserts = inserts.filter((entry) => entry.table === "certdrill_questions" && entry.values.certificationId === "aws-cert");
    expect(awsQuestionInserts).toHaveLength(1);
    expect(awsQuestionInserts[0]?.values).toMatchObject({
      stem: "Which design gives private subnets outbound internet access without accepting inbound internet connections?",
    });
    expect(inserts.find((entry) => entry.table === "certdrill_exam_forms" && entry.values.certificationId === "aws-cert")?.values).toMatchObject({
      questionIds: ["aws-existing-question-1", "aws-cert-question-1"],
    });
  });

  it("does not duplicate existing categories, questions, or exam forms on rerun", async () => {
    const { db, inserts } = createSeedDb({
      certifications: [
        { id: "aws-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
        { id: "az-cert", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 10, examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120 },
      ],
      categories: [{ id: "aws-category" }, { id: "az-category" }],
      questionRows: [
        [{ id: "q1", stem: awsQuestion1Stem }, { id: "q2", stem: awsQuestion2Stem }, { id: "q3" }, { id: "q4" }, { id: "q5" }, { id: "q6" }],
        [{ id: "az-q1", stem: azQuestion1Stem }, { id: "az-q2", stem: azQuestion2Stem }],
      ],
      forms: [[{ sortOrder: 1 }, { sortOrder: 2 }, { sortOrder: 3 }], [{ sortOrder: 1 }]],
    });

    await seedCertDrillDemoData(db as never);

    expect(inserts).toEqual([]);
  });
});
