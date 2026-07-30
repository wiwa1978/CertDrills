import { describe, expect, it } from "vitest";

import { allocateWeightedQuestionCounts, expandCategoryIds, selectQuestionIds } from "../../../src/modules/certdrill/selection";

const categories = [
  { id: "domain-1", parentCategoryId: null, weightPct: "30.00" },
  { id: "task-1-1", parentCategoryId: "domain-1", weightPct: null },
  { id: "task-1-1-a", parentCategoryId: "task-1-1", weightPct: null },
  { id: "domain-2", parentCategoryId: null, weightPct: "70.00" },
];

describe("CertDrill selection", () => {
  it("expands selected categories to include descendants", () => {
    expect(expandCategoryIds(["domain-1"], categories)).toEqual(new Set(["domain-1", "task-1-1", "task-1-1-a"]));
  });

  it("allocates weighted counts with largest remainder", () => {
    expect(allocateWeightedQuestionCounts([
      { id: "a", weightPct: "33.33" },
      { id: "b", weightPct: "33.33" },
      { id: "c", weightPct: "33.34" },
    ], 10)).toEqual(new Map([["a", 3], ["b", 3], ["c", 4]]));
  });

  it("breaks allocation remainder ties deterministically by category id", () => {
    expect(allocateWeightedQuestionCounts([
      { id: "b", weightPct: "50.00" },
      { id: "a", weightPct: "50.00" },
    ], 1)).toEqual(new Map([["a", 1], ["b", 0]]));
  });

  it("selects category-focus questions from selected category descendants", () => {
    const result = selectQuestionIds({
      mode: "category_focus",
      targetCount: 10,
      selectedCategoryIds: ["domain-1"],
      categories,
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "task-1-1" },
        { id: "q3", categoryId: "task-1-1-a" },
        { id: "q4", categoryId: "domain-2" },
      ],
      shuffle: false,
    });

    expect(result).toEqual({ questionIds: ["q1", "q2", "q3"], warnings: [] });
  });

  it("selects weighted questions and warns when pool is short", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 5,
      categories,
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "task-1-1" },
        { id: "q3", categoryId: "domain-2" },
      ],
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(result.warnings).toEqual(["Only 3 published questions are available for the requested count of 5."]);
  });

  it("backfills weighted selection from other categories when an allocated subtree is short", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 5,
      categories,
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "domain-2" },
        { id: "q3", categoryId: "domain-2" },
        { id: "q4", categoryId: "domain-2" },
        { id: "q5", categoryId: "domain-2" },
      ],
      shuffle: false,
    });

    expect(result).toEqual({
      questionIds: ["q1", "q2", "q3", "q4", "q5"],
      warnings: ["Backfilled 1 question from categories with surplus because domain-1 only had 1 available for 2 allocated questions."],
    });
  });

  it("uses injectable randomness to choose weighted membership within category subtrees", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 2,
      categories: [
        { id: "domain-1", parentCategoryId: null, weightPct: "100.00" },
      ],
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "domain-1" },
        { id: "q3", categoryId: "domain-1" },
      ],
      rng: () => 0,
    });

    expect(new Set(result.questionIds)).toEqual(new Set(["q2", "q3"]));
    expect(result.warnings).toEqual([]);
  });

  it("backfills only from weighted top-level category surplus", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 4,
      categories: [
        { id: "domain-1", parentCategoryId: null, weightPct: "75.00" },
        { id: "domain-2", parentCategoryId: null, weightPct: "25.00" },
        { id: "unweighted", parentCategoryId: null, weightPct: null },
      ],
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "domain-2" },
        { id: "q3", categoryId: "unweighted" },
        { id: "q4", categoryId: "unknown" },
      ],
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2"]);
    expect(result.warnings).toEqual([
      "Ignored 1 top-level category without usable weights: unweighted.",
      "Only 2 published questions are available in weighted categories for the requested count of 4.",
    ]);
  });

  it("warns when weighted mode has no usable top-level weights", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 2,
      categories: [
        { id: "domain-1", parentCategoryId: null, weightPct: null },
        { id: "task-1-1", parentCategoryId: "domain-1", weightPct: null },
      ],
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "task-1-1" },
      ],
      shuffle: false,
    });

    expect(result).toEqual({
      questionIds: [],
      warnings: ["Weighted selection requires at least one top-level category with a weight."],
    });
  });

  it("warns when some top-level categories have missing or invalid weights", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 2,
      categories: [
        { id: "domain-1", parentCategoryId: null, weightPct: "100.00" },
        { id: "domain-2", parentCategoryId: null, weightPct: null },
        { id: "domain-3", parentCategoryId: null, weightPct: "not-a-number" },
        { id: "task-1-1", parentCategoryId: "domain-1", weightPct: null },
      ],
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "task-1-1" },
        { id: "q3", categoryId: "domain-2" },
        { id: "q4", categoryId: "domain-3" },
      ],
      shuffle: false,
    });

    expect(result).toEqual({
      questionIds: ["q1", "q2"],
      warnings: ["Ignored 2 top-level categories without usable weights: domain-2, domain-3."],
    });
  });

  it("backfills from the largest surplus category before smaller surplus categories", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 6,
      categories: [
        { id: "domain-1", parentCategoryId: null, weightPct: "60.00" },
        { id: "domain-2", parentCategoryId: null, weightPct: "20.00" },
        { id: "domain-3", parentCategoryId: null, weightPct: "20.00" },
      ],
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "domain-2" },
        { id: "q3", categoryId: "domain-2" },
        { id: "q4", categoryId: "domain-2" },
        { id: "q5", categoryId: "domain-2" },
        { id: "q6", categoryId: "domain-3" },
        { id: "q7", categoryId: "domain-3" },
        { id: "q8", categoryId: "domain-3" },
      ],
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2", "q6", "q3", "q4", "q5"]);
    expect(result.warnings).toEqual([
      "Backfilled 3 questions from categories with surplus because domain-1 only had 1 available for 4 allocated questions.",
    ]);
  });

  it("returns no questions or warnings for weighted zero target count", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 0,
      categories,
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "domain-2" },
      ],
      shuffle: false,
    });

    expect(result).toEqual({ questionIds: [], warnings: [] });
  });

  it("prevents duplicate question ids across weighted selection and backfill", () => {
    const result = selectQuestionIds({
      mode: "weighted_random",
      targetCount: 3,
      categories: [
        { id: "domain-1", parentCategoryId: null, weightPct: "50.00" },
        { id: "domain-2", parentCategoryId: null, weightPct: "50.00" },
      ],
      questions: [
        { id: "q1", categoryId: "domain-1" },
        { id: "q1", categoryId: "domain-1" },
        { id: "q2", categoryId: "domain-2" },
        { id: "q3", categoryId: "domain-2" },
      ],
      shuffle: false,
    });

    expect(result.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(new Set(result.questionIds).size).toBe(result.questionIds.length);
  });
});
