import { describe, expect, it } from "vitest";

import {
  ExamFormAssignmentError,
  planExamFormAssignment,
  topLevelCategoryId,
  validateExamFormAssignment,
  type ExamFormAllocationSnapshotItem,
  type ExamFormAssignmentCategory,
} from "../../../src/modules/certdrill/exam-form-assignment";

function category(
  id: string,
  parentCategoryId: string | null,
  weightPct: string | number | null,
  sortOrder: number,
  overrides: Partial<ExamFormAssignmentCategory> = {},
): ExamFormAssignmentCategory {
  return { id, name: id.toUpperCase(), parentCategoryId, weightPct, sortOrder, ...overrides };
}

function expectAssignmentError(
  action: () => unknown,
  code: ExamFormAssignmentError["code"],
  message?: string,
) {
  try {
    action();
    throw new Error("Expected assignment error");
  } catch (error) {
    expect(error).toBeInstanceOf(ExamFormAssignmentError);
    expect(error).toMatchObject({ code });
    if (message !== undefined) {
      expect((error as Error).message).toBe(message);
    }
  }
}

function trackedCategoryIterations(categories: ExamFormAssignmentCategory[]) {
  let iterationCount = 0;
  const tracked = [...categories];
  const originalIterator = tracked[Symbol.iterator].bind(tracked);
  Object.defineProperty(tracked, Symbol.iterator, {
    value() {
      iterationCount += 1;
      return originalIterator();
    },
  });
  return { categories: tracked, iterationCount: () => iterationCount };
}

describe("planExamFormAssignment", () => {
  it("allocates 33.33/66.67 across three questions and includes child questions", () => {
    const categories = [
      category("domain-a", null, 33.33, 1, { name: "Domain A" }),
      category("task-a", "domain-a", null, 1),
      category("domain-b", null, "66.67", 2, { name: "Domain B" }),
    ];

    const result = planExamFormAssignment({
      categories,
      questions: [
        { id: "a-child", categoryId: "task-a" },
        { id: "b-1", categoryId: "domain-b" },
        { id: "b-2", categoryId: "domain-b" },
      ],
      targetQuestionCount: 3,
      rng: () => 0.999,
    });

    expect(result).toEqual({
      questionIds: ["a-child", "b-1", "b-2"],
      allocations: [
        { categoryId: "domain-a", categoryName: "Domain A", weightPct: "33.33", allocatedCount: 1, assignedCount: 1 },
        { categoryId: "domain-b", categoryName: "Domain B", weightPct: "66.67", allocatedCount: 2, assignedCount: 2 },
      ],
    });
  });

  it("keeps large safe-integer quota products exact", () => {
    const targetQuestionCount = 8_630_051_048_750;

    try {
      planExamFormAssignment({
        categories: [
          category("a", null, "95.16", 1),
          category("b", null, "4.84", 2),
        ],
        questions: [],
        targetQuestionCount,
      });
      throw new Error("Expected assignment error");
    } catch (error) {
      expect(error).toBeInstanceOf(ExamFormAssignmentError);
      expect(error).toMatchObject({
        code: "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
        details: [
          { categoryId: "a", requiredCount: 8_212_356_577_991, availableCount: 0 },
          { categoryId: "b", requiredCount: 417_694_470_759, availableCount: 0 },
        ],
      });

      const details = (error as ExamFormAssignmentError).details as Array<{ requiredCount: number }>;
      expect(details.reduce((sum, item) => sum + item.requiredCount, 0)).toBe(targetQuestionCount);
    }
  });

  it("reports every category shortage without redistributing from surplus", () => {
    const categories = [
      category("a", null, "50.00", 1, { name: "Alpha" }),
      category("b", null, "25.00", 2, { name: "Beta" }),
      category("c", null, "25.00", 3, { name: "Gamma" }),
    ];

    try {
      planExamFormAssignment({
        categories,
        questions: [
          { id: "a-1", categoryId: "a" },
          { id: "b-1", categoryId: "b" },
          { id: "b-2", categoryId: "b" },
          { id: "b-3", categoryId: "b" },
        ],
        targetQuestionCount: 4,
        rng: () => {
          throw new Error("selection must not run before capacity checks");
        },
      });
      throw new Error("Expected assignment error");
    } catch (error) {
      expect(error).toBeInstanceOf(ExamFormAssignmentError);
      expect(error).toMatchObject({
        code: "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
        details: [
          { categoryId: "a", categoryName: "Alpha", requiredCount: 2, availableCount: 1 },
          { categoryId: "c", categoryName: "Gamma", requiredCount: 1, availableCount: 0 },
        ],
      });
    }
  });

  it.each([
    ["90.00", "Weights total 90.00%; exactly 100.00% is required."],
    ["110.00", "Weights total 110.00%; exactly 100.00% is required."],
  ])("rejects a %s percent total with the exact message", (weightPct, message) => {
    expectAssignmentError(
      () => planExamFormAssignment({ categories: [category("a", null, weightPct, 1)], questions: [], targetQuestionCount: 1 }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
      message,
    );
  });

  it.each([null, 0, -1, "invalid", "12.345", Number.NaN, Number.POSITIVE_INFINITY])("rejects the invalid top-level weight %s", (weightPct) => {
    expectAssignmentError(
      () => planExamFormAssignment({
        categories: [
          category("a", null, weightPct, 1),
          category("b", null, "100.00", 2),
        ],
        questions: [{ id: "b-1", categoryId: "b" }],
        targetQuestionCount: 1,
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
    );
  });

  it.each([50.000000000001, "50.000000000001"])("rejects the over-precision weight %s", (weightPct) => {
    expectAssignmentError(
      () => planExamFormAssignment({
        categories: [
          category("a", null, weightPct, 1),
          category("b", null, "50.00", 2),
        ],
        questions: [],
        targetQuestionCount: 1,
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects the invalid target count %s", (targetQuestionCount) => {
    expectAssignmentError(
      () => planExamFormAssignment({
        categories: [category("a", null, "100.00", 1)],
        questions: [],
        targetQuestionCount,
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
    );
  });

  it("breaks equal allocation remainders by sort order", () => {
    const result = planExamFormAssignment({
      categories: [
        category("z", null, "50", 1),
        category("a", null, 50, 2),
      ],
      questions: [
        { id: "z-1", categoryId: "z" },
        { id: "z-2", categoryId: "z" },
        { id: "a-1", categoryId: "a" },
        { id: "a-2", categoryId: "a" },
      ],
      targetQuestionCount: 3,
      rng: () => 0.999,
    });

    expect(result.allocations).toEqual([
      { categoryId: "z", categoryName: "Z", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
      { categoryId: "a", categoryName: "A", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
    ]);
    expect(result.questionIds).toEqual(["z-1", "z-2", "a-1"]);
  });

  it("uses category ID as the secondary allocation remainder tie-break", () => {
    const result = planExamFormAssignment({
      categories: [
        category("z", null, "50.00", 1),
        category("a", null, "50.00", 1),
      ],
      questions: [
        { id: "z-1", categoryId: "z" },
        { id: "a-1", categoryId: "a" },
        { id: "a-2", categoryId: "a" },
      ],
      targetQuestionCount: 1,
      rng: () => 0.999,
    });

    expect(result.allocations.map(({ categoryId, allocatedCount }) => ({ categoryId, allocatedCount }))).toEqual([
      { categoryId: "a", allocatedCount: 1 },
      { categoryId: "z", allocatedCount: 0 },
    ]);
  });

  it("de-duplicates question IDs before capacity checks and selection", () => {
    const result = planExamFormAssignment({
      categories: [category("a", null, "100.00", 1)],
      questions: [
        { id: "q-1", categoryId: "a" },
        { id: "q-1", categoryId: "a" },
        { id: "q-2", categoryId: "a" },
      ],
      targetQuestionCount: 2,
      rng: () => 0.999,
    });

    expect(result.questionIds).toEqual(["q-1", "q-2"]);
    expect(new Set(result.questionIds).size).toBe(result.questionIds.length);
  });

  it("uses arbitrary-depth descendant questions in planner pools", () => {
    const result = planExamFormAssignment({
      categories: [
        category("root", null, "100.00", 1),
        category("child", "root", null, 1),
        category("grandchild", "child", null, 1),
      ],
      questions: [{ id: "deep-question", categoryId: "grandchild" }],
      targetQuestionCount: 1,
      rng: () => 0.999,
    });

    expect(result.questionIds).toEqual(["deep-question"]);
  });

  it("moves question membership with deterministic Fisher-Yates randomness", () => {
    const result = planExamFormAssignment({
      categories: [category("a", null, "100.00", 1)],
      questions: [
        { id: "q-1", categoryId: "a" },
        { id: "q-2", categoryId: "a" },
        { id: "q-3", categoryId: "a" },
      ],
      targetQuestionCount: 2,
      rng: () => 0,
    });

    expect(result.questionIds).toEqual(["q-2", "q-3"]);
  });

  it("builds category ancestry lookup once for planner questions", () => {
    const tracked = trackedCategoryIterations([
      category("root", null, "100.00", 1),
      category("child", "root", null, 1),
    ]);
    const questions = Array.from({ length: 100 }, (_, index) => ({ id: `q-${index}`, categoryId: "child" }));

    planExamFormAssignment({
      categories: tracked.categories,
      questions,
      targetQuestionCount: 1,
      rng: () => 0.999,
    });

    expect(tracked.iterationCount()).toBe(1);
  });

  it("ignores archived top-level categories", () => {
    const result = planExamFormAssignment({
      categories: [
        category("active", null, "100.00", 1),
        category("archived", null, null, 2, { archivedAt: new Date() }),
      ],
      questions: [{ id: "q-1", categoryId: "active" }],
      targetQuestionCount: 1,
      rng: () => 0.999,
    });

    expect(result.questionIds).toEqual(["q-1"]);
    expect(result.allocations.map((allocation) => allocation.categoryId)).toEqual(["active"]);
  });
});

describe("topLevelCategoryId", () => {
  it("finds arbitrary-depth roots and returns null for missing ancestry and cycles", () => {
    const categories = [
      category("root", null, "100.00", 1),
      category("child", "root", null, 1),
      category("grandchild", "child", null, 1),
      category("orphan", "missing", null, 1),
      category("cycle-a", "cycle-b", null, 1),
      category("cycle-b", "cycle-a", null, 1),
    ];

    expect(topLevelCategoryId("grandchild", categories)).toBe("root");
    expect(topLevelCategoryId("root", categories)).toBe("root");
    expect(topLevelCategoryId("unknown", categories)).toBeNull();
    expect(topLevelCategoryId("orphan", categories)).toBeNull();
    expect(topLevelCategoryId("cycle-a", categories)).toBeNull();
  });
});

describe("validateExamFormAssignment", () => {
  const categories = [
    category("a", null, "50.00", 1, { name: "Alpha" }),
    category("a-child", "a", null, 1),
    category("b", null, "50.00", 2, { name: "Beta" }),
  ];
  const questions = [
    { id: "a-1", categoryId: "a-child" },
    { id: "a-2", categoryId: "a" },
    { id: "b-1", categoryId: "b" },
    { id: "b-2", categoryId: "b" },
  ];

  it("accepts a valid generated assignment", () => {
    const plan = planExamFormAssignment({ categories, questions, targetQuestionCount: 3, rng: () => 0.999 });

    expect(() => validateExamFormAssignment({
      categories,
      questions,
      targetQuestionCount: 3,
      questionIds: plan.questionIds,
      allocationSnapshot: plan.allocations,
    })).not.toThrow();
  });

  it("accepts renamed categories and changed weights when integer quotas stay equal", () => {
    const plan = planExamFormAssignment({ categories, questions, targetQuestionCount: 2, rng: () => 0.999 });
    const currentCategories = categories.map((item) => {
      if (item.id === "a") return { ...item, name: "Renamed Alpha", weightPct: "51.00" };
      if (item.id === "b") return { ...item, name: "Renamed Beta", weightPct: "49.00" };
      return item;
    });

    expect(() => validateExamFormAssignment({
      categories: currentCategories,
      questions,
      targetQuestionCount: 2,
      questionIds: plan.questionIds,
      allocationSnapshot: plan.allocations,
    })).not.toThrow();
  });

  it("rejects a stale quota after weights change", () => {
    const plan = planExamFormAssignment({ categories, questions, targetQuestionCount: 4, rng: () => 0.999 });
    const changedCategories = categories.map((item) => {
      if (item.id === "a") return { ...item, weightPct: "66.67" };
      if (item.id === "b") return { ...item, weightPct: "33.33" };
      return item;
    });

    expectAssignmentError(
      () => validateExamFormAssignment({
        categories: changedCategories,
        questions,
        targetQuestionCount: 4,
        questionIds: plan.questionIds,
        allocationSnapshot: plan.allocations,
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
    );
  });

  it("rejects duplicate assigned question IDs", () => {
    const allocationSnapshot = [
      { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
      { categoryId: "b", categoryName: "Beta", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
    ];

    expectAssignmentError(
      () => validateExamFormAssignment({
        categories,
        questions,
        targetQuestionCount: 3,
        questionIds: ["a-1", "a-1", "b-1"],
        allocationSnapshot,
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    );
  });

  it("rejects actual category counts that do not match recalculated quotas", () => {
    expectAssignmentError(
      () => validateExamFormAssignment({
        categories,
        questions,
        targetQuestionCount: 3,
        questionIds: ["a-1", "b-1", "b-2"],
        allocationSnapshot: [
          { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
          { categoryId: "b", categoryName: "Beta", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
        ],
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    );
  });

  it.each([
    {
      name: "a duplicate snapshot category",
      snapshot: [
        { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
        { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
      ],
    },
    {
      name: "a missing snapshot category",
      snapshot: [
        { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
      ],
    },
    {
      name: "malformed snapshot counts",
      snapshot: [
        { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 1 },
        { categoryId: "b", categoryName: "Beta", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
      ],
    },
  ])("rejects $name", ({ snapshot }) => {
    expectAssignmentError(
      () => validateExamFormAssignment({
        categories,
        questions,
        targetQuestionCount: 3,
        questionIds: ["a-1", "a-2", "b-1"],
        allocationSnapshot: snapshot,
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
    );
  });

  it.each([
    { name: "the wrong total", questionIds: ["a-1", "b-1"] },
    { name: "a missing question", questionIds: ["a-1", "a-2", "missing"] },
  ])("rejects $name", ({ questionIds }) => {
    expectAssignmentError(
      () => validateExamFormAssignment({
        categories,
        questions,
        targetQuestionCount: 3,
        questionIds,
        allocationSnapshot: [
          { categoryId: "a", categoryName: "Alpha", weightPct: "50.00", allocatedCount: 2, assignedCount: 2 },
          { categoryId: "b", categoryName: "Beta", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
        ],
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    );
  });

  it("rejects assigned questions with cyclic ancestry", () => {
    const cyclicCategories = [
      category("valid", null, "100.00", 1),
      category("cycle-a", "cycle-b", null, 1),
      category("cycle-b", "cycle-a", null, 1),
    ];

    expectAssignmentError(
      () => validateExamFormAssignment({
        categories: cyclicCategories,
        questions: [{ id: "q-1", categoryId: "cycle-a" }],
        targetQuestionCount: 1,
        questionIds: ["q-1"],
        allocationSnapshot: [
          { categoryId: "valid", categoryName: "VALID", weightPct: "100.00", allocatedCount: 1, assignedCount: 1 },
        ],
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    );
  });

  it("rejects assigned questions with missing ancestry", () => {
    expectAssignmentError(
      () => validateExamFormAssignment({
        categories: [
          category("valid", null, "100.00", 1),
          category("orphan", "missing", null, 1),
        ],
        questions: [{ id: "q-1", categoryId: "orphan" }],
        targetQuestionCount: 1,
        questionIds: ["q-1"],
        allocationSnapshot: [
          { categoryId: "valid", categoryName: "VALID", weightPct: "100.00", allocatedCount: 1, assignedCount: 1 },
        ],
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    );
  });

  it("rejects structurally malformed snapshot items", () => {
    expectAssignmentError(
      () => validateExamFormAssignment({
        categories: [category("a", null, "100.00", 1)],
        questions: [{ id: "q-1", categoryId: "a" }],
        targetQuestionCount: 1,
        questionIds: ["q-1"],
        allocationSnapshot: [null as unknown as ExamFormAllocationSnapshotItem],
      }),
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
    );
  });

  it("builds category ancestry lookup once for validation questions", () => {
    const tracked = trackedCategoryIterations([
      category("root", null, "100.00", 1),
      category("child", "root", null, 1),
    ]);
    const questions = Array.from({ length: 100 }, (_, index) => ({ id: `q-${index}`, categoryId: "child" }));

    validateExamFormAssignment({
      categories: tracked.categories,
      questions,
      targetQuestionCount: 100,
      questionIds: questions.map((question) => question.id),
      allocationSnapshot: [
        { categoryId: "root", categoryName: "ROOT", weightPct: "100.00", allocatedCount: 100, assignedCount: 100 },
      ],
    });

    expect(tracked.iterationCount()).toBe(1);
  });
});
