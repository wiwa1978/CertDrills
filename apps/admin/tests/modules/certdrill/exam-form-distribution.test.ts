import { describe, expect, it } from "vitest";

import type {
  CertDrillAdminCategory,
  CertDrillAdminExamForm,
  CertDrillAdminQuestion,
} from "@/lib/api/certdrill.server";
import { buildExamFormQuestionDistributions } from "@/modules/certdrill/exam-form-distribution";

const certificationId = "11111111-1111-4111-8111-111111111111";

function category(id: string, name: string, parentCategoryId: string | null = null): CertDrillAdminCategory {
  return { id, certificationId, code: id, name, parentCategoryId };
}

function question(id: string, categoryId: string, questionType?: CertDrillAdminQuestion["questionType"]): CertDrillAdminQuestion {
  return { id, certificationId, categoryId, stem: id, questionType } as CertDrillAdminQuestion;
}

function examForm(questionIds: string[]): CertDrillAdminExamForm {
  return {
    id: "form-1",
    certificationId,
    name: "Final mock exam A",
    description: null,
    sortOrder: 1,
    isActive: true,
    durationMinutes: 120,
    targetQuestionCount: questionIds.length,
    questionIds,
    assignmentVersion: 1,
    allocationSnapshot: [
      { categoryId: "category-a", categoryName: "Category A", weightPct: "80.00", allocatedCount: 4, assignedCount: 4 },
      { categoryId: "category-b", categoryName: "Category B", weightPct: "20.00", allocatedCount: 1, assignedCount: 1 },
    ],
    scenarioIds: [],
    generatedAt: "2026-08-09T12:00:00.000Z",
  };
}

describe("exam form question distribution", () => {
  it("counts every drill type overall and under its top-level category", () => {
    const categories = [
      category("category-a", "Category A"),
      category("category-a-child", "Category A child", "category-a"),
      category("category-b", "Category B"),
    ];
    const questions = [
      question("normal-legacy", "category-a-child"),
      question("normal", "category-a-child", "single_choice"),
      question("matching-a", "category-a", "matching"),
      question("fill-a", "category-a-child", "fill_blank"),
      question("matching-b", "category-b", "matching"),
    ];

    const distribution = buildExamFormQuestionDistributions(
      [examForm(questions.map((item) => item.id))],
      questions,
      categories,
    ).get("form-1");

    expect(distribution).toEqual({
      totals: { normal: 2, matching: 2, fillBlank: 1, total: 5 },
      categories: [
        {
          categoryId: "category-a",
          categoryName: "Category A",
          weightPct: "80.00",
          counts: { normal: 2, matching: 1, fillBlank: 1, total: 4 },
        },
        {
          categoryId: "category-b",
          categoryName: "Category B",
          weightPct: "20.00",
          counts: { normal: 0, matching: 1, fillBlank: 0, total: 1 },
        },
      ],
    });
  });
});
