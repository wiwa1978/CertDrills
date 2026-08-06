export type ExamFormAssignmentCategory = {
  id: string;
  name: string;
  parentCategoryId: string | null;
  weightPct: string | number | null;
  sortOrder: number;
  archivedAt?: Date | string | null;
};

export type ExamFormAssignmentQuestion = { id: string; categoryId: string };

export type ExamFormAllocationSnapshotItem = {
  categoryId: string;
  categoryName: string;
  weightPct: string;
  allocatedCount: number;
  assignedCount: number;
};

export type ExamFormAssignmentPlan = {
  questionIds: string[];
  allocations: ExamFormAllocationSnapshotItem[];
};

export class ExamFormAssignmentError extends Error {
  constructor(
    public readonly code: "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS" | "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ExamFormAssignmentError";
  }
}

type Allocation = {
  category: ExamFormAssignmentCategory;
  weightBasisPoints: number;
  allocatedCount: number;
};

export function planExamFormAssignment(input: {
  categories: ExamFormAssignmentCategory[];
  questions: ExamFormAssignmentQuestion[];
  targetQuestionCount: number;
  rng?: () => number;
}): ExamFormAssignmentPlan {
  const allocations = calculateAllocations(input.categories, input.targetQuestionCount);
  const activeTopLevelIds = new Set(allocations.map(({ category }) => category.id));
  const pools = questionPools(input.questions, input.categories, activeTopLevelIds);
  const shortages = allocations.flatMap(({ category, allocatedCount }) => {
    const availableCount = pools.get(category.id)?.length ?? 0;
    return availableCount < allocatedCount
      ? [{ categoryId: category.id, categoryName: category.name, requiredCount: allocatedCount, availableCount }]
      : [];
  });

  if (shortages.length > 0) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      "Insufficient question capacity for the exam form allocation.",
      shortages,
    );
  }

  const rng = input.rng ?? Math.random;
  const questionIds: string[] = [];
  const snapshot: ExamFormAllocationSnapshotItem[] = [];

  for (const allocation of allocations) {
    const selected = fisherYates(pools.get(allocation.category.id) ?? [], rng).slice(0, allocation.allocatedCount);
    questionIds.push(...selected.map((question) => question.id));
    snapshot.push({
      categoryId: allocation.category.id,
      categoryName: allocation.category.name,
      weightPct: formatWeight(allocation.weightBasisPoints),
      allocatedCount: allocation.allocatedCount,
      assignedCount: selected.length,
    });
  }

  return { questionIds, allocations: snapshot };
}

export function topLevelCategoryId(
  categoryId: string,
  categories: ExamFormAssignmentCategory[],
): string | null {
  const categoriesById = new Map<string, ExamFormAssignmentCategory>();
  for (const category of categories) {
    if (!categoriesById.has(category.id)) {
      categoriesById.set(category.id, category);
    }
  }

  const visited = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return null;
    }
    visited.add(currentId);

    const category = categoriesById.get(currentId);
    if (!category) {
      return null;
    }
    if (category.parentCategoryId === null) {
      return category.id;
    }
    currentId = category.parentCategoryId;
  }

  return null;
}

export function validateExamFormAssignment(input: {
  categories: ExamFormAssignmentCategory[];
  questions: ExamFormAssignmentQuestion[];
  targetQuestionCount: number;
  questionIds: string[];
  allocationSnapshot: ExamFormAllocationSnapshotItem[];
}): void {
  const allocations = calculateAllocations(input.categories, input.targetQuestionCount);
  validateSnapshot(input.allocationSnapshot, allocations);

  if (input.questionIds.length !== input.targetQuestionCount) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      `Exam form has ${input.questionIds.length} questions; ${input.targetQuestionCount} are required.`,
    );
  }

  if (new Set(input.questionIds).size !== input.questionIds.length) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      "Exam form question IDs must be unique.",
    );
  }

  const questionsById = new Map<string, ExamFormAssignmentQuestion>();
  for (const question of input.questions) {
    if (!questionsById.has(question.id)) {
      questionsById.set(question.id, question);
    }
  }

  const actualCounts = new Map(allocations.map(({ category }) => [category.id, 0]));
  for (const questionId of input.questionIds) {
    const question = questionsById.get(questionId);
    if (!question) {
      throw new ExamFormAssignmentError(
        "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
        `Exam form question ${questionId} is unavailable.`,
      );
    }

    const rootId = topLevelCategoryId(question.categoryId, input.categories);
    if (rootId === null || !actualCounts.has(rootId)) {
      throw new ExamFormAssignmentError(
        "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
        `Exam form question ${questionId} has unknown, cyclic, archived, or unallocated category ancestry.`,
      );
    }
    actualCounts.set(rootId, (actualCounts.get(rootId) ?? 0) + 1);
  }

  const mismatches = allocations.flatMap(({ category, allocatedCount }) => {
    const assignedCount = actualCounts.get(category.id) ?? 0;
    return assignedCount === allocatedCount
      ? []
      : [{ categoryId: category.id, categoryName: category.name, requiredCount: allocatedCount, assignedCount }];
  });

  if (mismatches.length > 0) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      "Exam form question counts do not match the current allocation.",
      mismatches,
    );
  }
}

function calculateAllocations(
  categories: ExamFormAssignmentCategory[],
  targetQuestionCount: number,
): Allocation[] {
  if (!Number.isSafeInteger(targetQuestionCount) || targetQuestionCount <= 0) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
      "Target question count must be a positive integer.",
    );
  }

  const topLevelCategories = categories
    .filter((category) => category.parentCategoryId === null && category.archivedAt == null)
    .sort(compareCategories);
  const weightedCategories = topLevelCategories.map((category) => ({
    category,
    weightBasisPoints: parseWeight(category),
  }));
  const totalBasisPoints = weightedCategories.reduce((total, item) => total + item.weightBasisPoints, 0);

  if (totalBasisPoints !== 10_000) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
      `Weights total ${formatWeight(totalBasisPoints)}%; exactly 100.00% is required.`,
    );
  }

  const target = BigInt(targetQuestionCount);
  const allocations = weightedCategories.map(({ category, weightBasisPoints }) => {
    const numerator = target * BigInt(weightBasisPoints);
    return {
      category,
      weightBasisPoints,
      allocatedCount: numerator / 10_000n,
      remainder: numerator % 10_000n,
    };
  });
  let remaining = target - allocations.reduce((total, item) => total + item.allocatedCount, 0n);

  for (const allocation of [...allocations].sort((a, b) => compareRemainders(a, b))) {
    if (remaining === 0n) {
      break;
    }
    allocation.allocatedCount += 1n;
    remaining -= 1n;
  }

  return allocations.map(({ category, weightBasisPoints, allocatedCount }) => ({
    category,
    weightBasisPoints,
    allocatedCount: safeAllocationNumber(allocatedCount),
  }));
}

function compareRemainders(
  a: { category: ExamFormAssignmentCategory; remainder: bigint },
  b: { category: ExamFormAssignmentCategory; remainder: bigint },
) {
  if (a.remainder !== b.remainder) {
    return a.remainder > b.remainder ? -1 : 1;
  }
  return compareCategories(a.category, b.category);
}

function safeAllocationNumber(allocatedCount: bigint) {
  if (allocatedCount < 0n || allocatedCount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
      "Calculated question allocation exceeds the safe integer range.",
    );
  }
  return Number(allocatedCount);
}

function parseWeight(category: ExamFormAssignmentCategory): number {
  const value = category.weightPct;
  let basisPoints: number;

  if (typeof value === "string") {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    basisPoints = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : Number.NaN;
  } else {
    basisPoints = typeof value === "number" ? Math.round(value * 100) : Number.NaN;
    if (typeof value === "number" && Math.abs(value * 100 - basisPoints) > 1e-9) {
      basisPoints = Number.NaN;
    }
  }

  if (!Number.isSafeInteger(basisPoints) || basisPoints <= 0) {
    throw new ExamFormAssignmentError(
      "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS",
      `Top-level category ${category.id} must have a finite positive weight with at most two decimal places.`,
    );
  }

  return basisPoints;
}

function validateSnapshot(snapshot: ExamFormAllocationSnapshotItem[], allocations: Allocation[]) {
  if (!Array.isArray(snapshot)) {
    throw invalidSnapshot("Exam form allocation snapshot must be an array.");
  }

  const snapshotByCategoryId = new Map<string, ExamFormAllocationSnapshotItem>();
  for (const item of snapshot) {
    if (
      !item
      || typeof item.categoryId !== "string"
      || typeof item.categoryName !== "string"
      || typeof item.weightPct !== "string"
      || !Number.isInteger(item.allocatedCount)
      || item.allocatedCount < 0
      || !Number.isInteger(item.assignedCount)
      || item.assignedCount < 0
    ) {
      throw invalidSnapshot("Exam form allocation snapshot is malformed.");
    }
    if (snapshotByCategoryId.has(item.categoryId)) {
      throw invalidSnapshot(`Exam form allocation snapshot repeats category ${item.categoryId}.`);
    }
    snapshotByCategoryId.set(item.categoryId, item);
  }

  if (snapshotByCategoryId.size !== allocations.length) {
    throw invalidSnapshot("Exam form allocation snapshot categories do not match the current blueprint.");
  }

  for (const allocation of allocations) {
    const item = snapshotByCategoryId.get(allocation.category.id);
    if (!item) {
      throw invalidSnapshot(`Exam form allocation snapshot is missing category ${allocation.category.id}.`);
    }
    if (
      item.categoryName !== allocation.category.name
      || item.weightPct !== formatWeight(allocation.weightBasisPoints)
      || item.allocatedCount !== allocation.allocatedCount
      || item.assignedCount !== allocation.allocatedCount
    ) {
      throw invalidSnapshot(`Exam form allocation snapshot does not match category ${allocation.category.id}.`);
    }
  }
}

function invalidSnapshot(message: string) {
  return new ExamFormAssignmentError("CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS", message);
}

function questionPools(
  questions: ExamFormAssignmentQuestion[],
  categories: ExamFormAssignmentCategory[],
  activeTopLevelIds: Set<string>,
) {
  const pools = new Map<string, ExamFormAssignmentQuestion[]>();
  const seenQuestionIds = new Set<string>();

  for (const question of questions) {
    if (seenQuestionIds.has(question.id)) {
      continue;
    }
    seenQuestionIds.add(question.id);

    const rootId = topLevelCategoryId(question.categoryId, categories);
    if (rootId !== null && activeTopLevelIds.has(rootId)) {
      const pool = pools.get(rootId) ?? [];
      pool.push(question);
      pools.set(rootId, pool);
    }
  }

  return pools;
}

function fisherYates<T>(items: T[], rng: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function compareCategories(a: ExamFormAssignmentCategory, b: ExamFormAssignmentCategory) {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

function formatWeight(basisPoints: number) {
  return (basisPoints / 100).toFixed(2);
}
