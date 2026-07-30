import { describe, expect, it } from "vitest";

import { selectQuestionIdsForVariant, uniqueOrderedIds } from "../../../src/modules/certdrill/selection";

const categories = [
  { id: "domain-1", parentCategoryId: null, weightPct: "60.00", drillQuestionCount: 3 },
  { id: "task-1", parentCategoryId: "domain-1", weightPct: null, drillQuestionCount: null },
  { id: "domain-2", parentCategoryId: null, weightPct: "40.00", drillQuestionCount: null },
];

const questions = [
  { id: "q1", categoryId: "domain-1" },
  { id: "q2", categoryId: "task-1" },
  { id: "q3", categoryId: "domain-1" },
  { id: "q4", categoryId: "domain-2" },
  { id: "q5", categoryId: "domain-2" },
];

describe("CertDrill mode selection", () => {
  it("returns unique ordered ids", () => {
    expect(uniqueOrderedIds(["q2", "q1", "q2", "q3", "q1"])).toEqual(["q2", "q1", "q3"]);
  });

  it("selects quick drill questions using certification count", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "quick_drill",
      categories,
      questions,
      quickDrillCount: 2,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2"]);
    expect(result.warnings).toEqual([]);
  });

  it("warns when quick drill has fewer available questions than requested", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "quick_drill",
      categories,
      questions: questions.slice(0, 2),
      quickDrillCount: 4,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2"]);
    expect(result.warnings).toEqual(["Only 2 published questions are available for the requested count of 4."]);
  });

  it("selects category drill questions using category override count", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "category_drill",
      selectedCategoryIds: ["domain-1"],
      categories,
      questions,
      quickDrillCount: 10,
      categoryDrillCount: 2,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2", "q3"]);
  });

  it("warns when category drill has fewer selected questions than requested", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "category_drill",
      selectedCategoryIds: ["domain-2"],
      categories,
      questions,
      quickDrillCount: 10,
      categoryDrillCount: 3,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q4", "q5"]);
    expect(result.warnings).toEqual(["Only 2 published questions are available in selected categories for the requested count of 3."]);
  });

  it("selects exam form questions in stored order", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "exam_form",
      examFormQuestionIds: ["q5", "q1"],
      categories,
      questions,
      quickDrillCount: 10,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q5", "q1"]);
  });

  it("deduplicates exam form question ids while preserving stored order", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "exam_form",
      examFormQuestionIds: ["q5", "q1", "q5", "missing", "q1"],
      categories,
      questions,
      quickDrillCount: 10,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q5", "q1"]);
  });

  it("warns when exam form question ids are unavailable", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "exam_form",
      examFormQuestionIds: ["q5", "q1", "q5", "missing", "unpublished"],
      categories,
      questions,
      quickDrillCount: 10,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q5", "q1"]);
    expect(result.warnings).toEqual(["Exam form omitted 2 unavailable questions: missing, unpublished."]);
  });

  it("selects missed review questions from missed ids and limits to quick drill count", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "missed_review",
      missedQuestionIds: ["q4", "q1", "q4", "missing", "q2"],
      categories,
      questions,
      quickDrillCount: 2,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q4", "q1"]);
  });

  it("selects weak areas questions from weak category subtrees and limits to quick drill count", () => {
    const result = selectQuestionIdsForVariant({
      testVariant: "weak_areas",
      weakCategoryIds: ["domain-1"],
      categories,
      questions,
      quickDrillCount: 2,
      categoryDrillCount: 10,
      examSimulationCount: 5,
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2"]);
  });

  it("deduplicates all variant outputs", () => {
    const duplicatedQuestions = [
      ...questions,
      { id: "q1", categoryId: "domain-1" },
      { id: "q4", categoryId: "domain-2" },
    ];
    const variants = [
      selectQuestionIdsForVariant({ testVariant: "quick_drill", categories, questions: duplicatedQuestions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false }),
      selectQuestionIdsForVariant({ testVariant: "category_drill", selectedCategoryIds: ["domain-1"], categories, questions: duplicatedQuestions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false }),
      selectQuestionIdsForVariant({ testVariant: "exam_simulation", categories, questions: duplicatedQuestions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false }),
      selectQuestionIdsForVariant({ testVariant: "exam_form", examFormQuestionIds: ["q1", "q1", "q5"], categories, questions: duplicatedQuestions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false }),
      selectQuestionIdsForVariant({ testVariant: "missed_review", missedQuestionIds: ["q4", "q4", "q1"], categories, questions: duplicatedQuestions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false }),
      selectQuestionIdsForVariant({ testVariant: "weak_areas", weakCategoryIds: ["domain-1"], categories, questions: duplicatedQuestions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false }),
    ];

    for (const result of variants) {
      expect(new Set(result.questionIds).size).toBe(result.questionIds.length);
    }
  });
});
