type CategoryInput = { id: string; parentCategoryId: string | null; weightPct: string | number | null };
type QuestionInput = { id: string; categoryId: string; selectionPriority?: number };
type CategoryDrillInput = CategoryInput & { drillQuestionCount?: number | null };

type SelectionInput = {
  mode: "category_focus" | "weighted_random";
  targetCount?: number;
  selectedCategoryIds?: string[];
  categories: CategoryInput[];
  questions: QuestionInput[];
  shuffle?: boolean;
  rng?: () => number;
};

type VariantSelectionInput = {
  testVariant: "quick_drill" | "category_drill" | "exam_simulation" | "exam_form" | "missed_review" | "weak_areas";
  selectedCategoryIds?: string[];
  examFormQuestionIds?: string[];
  missedQuestionIds?: string[];
  weakCategoryIds?: string[];
  categories: CategoryDrillInput[];
  questions: QuestionInput[];
  quickDrillCount: number;
  categoryDrillCount: number;
  examSimulationCount: number;
  shuffle?: boolean;
  rng?: () => number;
};

function fisherYates<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

export function expandCategoryIds(selectedIds: string[], categories: CategoryInput[]): Set<string> {
  const expanded = new Set(selectedIds);
  let changed = true;

  while (changed) {
    changed = false;

    for (const category of categories) {
      if (category.parentCategoryId && expanded.has(category.parentCategoryId) && !expanded.has(category.id)) {
        expanded.add(category.id);
        changed = true;
      }
    }
  }

  return expanded;
}

export function allocateWeightedQuestionCounts(
  categories: Array<{ id: string; weightPct: string | number | null }>,
  targetCount: number,
): Map<string, number> {
  const weighted = categories.filter((category): category is { id: string; weightPct: string | number } => category.weightPct !== null);
  const requestedCount = Math.max(0, Math.floor(targetCount));
  const totalWeight = weighted.reduce((sum, category) => sum + Number(category.weightPct), 0);

  if (requestedCount === 0 || totalWeight <= 0) {
    return new Map(weighted.sort((a, b) => a.id.localeCompare(b.id)).map((category) => [category.id, 0]));
  }

  const allocations = weighted.map((category) => {
    const exact = (requestedCount * Number(category.weightPct)) / totalWeight;
    const base = Math.floor(exact);
    return { id: category.id, base, remainder: exact - base };
  });

  let assigned = allocations.reduce((sum, item) => sum + item.base, 0);
  const sortedByRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));

  for (const item of sortedByRemainder) {
    if (assigned >= requestedCount) break;
    item.base += 1;
    assigned += 1;
  }

  return new Map(sortedByRemainder.sort((a, b) => a.id.localeCompare(b.id)).map((item) => [item.id, item.base]));
}

export function selectQuestionIds(input: SelectionInput): { questionIds: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const shouldShuffle = input.shuffle !== false;
  const rng = input.rng ?? Math.random;

  if (input.mode === "category_focus") {
    const expanded = expandCategoryIds(input.selectedCategoryIds ?? [], input.categories);
    const ids = input.questions.filter((question) => expanded.has(question.categoryId)).map((question) => question.id);
    return { questionIds: maybeShuffle(uniqueOrderedIds(ids), shouldShuffle, rng), warnings };
  }

  const targetCount = Math.max(0, Math.floor(input.targetCount ?? input.questions.length));
  if (targetCount === 0) {
    return { questionIds: [], warnings };
  }

  const allTopLevelCategories = input.categories.filter((category) => category.parentCategoryId === null);
  const topLevelCategories = allTopLevelCategories.filter((category) => isPositiveWeight(category.weightPct));
  const ignoredTopLevelCategories = allTopLevelCategories.filter((category) => !isPositiveWeight(category.weightPct));

  if (topLevelCategories.length === 0) {
    return { questionIds: [], warnings: ["Weighted selection requires at least one top-level category with a weight."] };
  }

  if (ignoredTopLevelCategories.length > 0) {
    warnings.push(`Ignored ${ignoredTopLevelCategories.length} top-level ${pluralize("category", ignoredTopLevelCategories.length)} without usable weights: ${ignoredTopLevelCategories.map((category) => category.id).join(", ")}.`);
  }

  const allocation = allocateWeightedQuestionCounts(topLevelCategories, targetCount);
  const uniqueQuestions = uniqueById(input.questions);
  const selected = new Set<string>();
  const shortfalls: Array<{ categoryId: string; requested: number; available: number }> = [];
  const surplusPools: Array<{ categoryId: string; questions: QuestionInput[] }> = [];

  for (const category of topLevelCategories) {
    const subtree = expandCategoryIds([category.id], input.categories);
    const categoryQuestions = maybeShuffle(uniqueQuestions.filter((question) => subtree.has(question.categoryId)), shouldShuffle, rng);
    const requested = allocation.get(category.id) ?? 0;
    const available = categoryQuestions.length;

    categoryQuestions.slice(0, requested).forEach((question) => selected.add(question.id));

    if (available > requested) {
      surplusPools.push({ categoryId: category.id, questions: categoryQuestions.slice(requested) });
    }

    if (available < requested) {
      shortfalls.push({ categoryId: category.id, requested, available });
    }
  }

  const selectedBeforeBackfill = selected.size;

  if (selected.size < targetCount) {
    const sortedSurplusPools = surplusPools.sort((a, b) => b.questions.length - a.questions.length || a.categoryId.localeCompare(b.categoryId));

    for (const pool of sortedSurplusPools) {
      while (selected.size < targetCount && pool.questions.length > 0) {
        if (selected.size >= targetCount) break;

        const question = pool.questions.shift();
        if (question) {
          selected.add(question.id);
        }
      }
    }
  }

  const backfilledCount = selected.size - selectedBeforeBackfill;
  if (backfilledCount > 0 && shortfalls.length > 0) {
    warnings.push(`Backfilled ${backfilledCount} ${pluralize("question", backfilledCount)} from categories with surplus because ${formatShortfalls(shortfalls)}.`);
  }

  if (selected.size < targetCount) {
    const weightedPoolSize = countWeightedPoolQuestions(uniqueQuestions, topLevelCategories, input.categories);
    const weightedOnly = weightedPoolSize < uniqueQuestions.length;
    const availableScope = weightedOnly ? "published questions are available in weighted categories" : "published questions are available";
    warnings.push(`Only ${selected.size} ${availableScope} for the requested count of ${targetCount}.`);
  }

  return { questionIds: maybeShuffle([...selected], shouldShuffle, rng), warnings };
}

export function selectQuestionIdsForVariant(input: VariantSelectionInput): { questionIds: string[]; warnings: string[] } {
  const shouldShuffle = input.shuffle !== false;
  const rng = input.rng ?? Math.random;

  if (input.testVariant === "quick_drill") {
    const targetCount = normalizeCount(input.quickDrillCount);
    const questionIds = takeQuestionIds(input.questions, targetCount, shouldShuffle, rng);
    return { questionIds, warnings: shortfallWarnings(questionIds.length, targetCount, "published questions are available") };
  }

  if (input.testVariant === "category_drill") {
    const targetCount = getCategoryDrillCount(input.selectedCategoryIds ?? [], input.categories, input.categoryDrillCount);
    const questionIds = takeQuestionIds(
      filterQuestionsByCategories(input.questions, input.selectedCategoryIds ?? [], input.categories),
      targetCount,
      shouldShuffle,
      rng,
    );

    return {
      questionIds,
      warnings: shortfallWarnings(questionIds.length, normalizeCount(targetCount), "published questions are available in selected categories"),
    };
  }

  if (input.testVariant === "exam_simulation") {
    return selectQuestionIds({
      mode: "weighted_random",
      targetCount: input.examSimulationCount,
      categories: input.categories,
      questions: input.questions,
      shuffle: input.shuffle,
      rng: input.rng,
    });
  }

  if (input.testVariant === "exam_form") {
    const selection = orderedAvailableQuestionIds(input.examFormQuestionIds ?? [], input.questions);
    return { questionIds: selection.questionIds, warnings: missingQuestionWarnings(selection.missingQuestionIds) };
  }

  if (input.testVariant === "missed_review") {
    return { questionIds: orderedAvailableQuestionIds(input.missedQuestionIds ?? [], input.questions).questionIds.slice(0, normalizeCount(input.quickDrillCount)), warnings: [] };
  }

  return {
    questionIds: takeQuestionIds(
      filterQuestionsByCategories(input.questions, input.weakCategoryIds ?? [], input.categories),
      input.quickDrillCount,
      shouldShuffle,
      rng,
    ),
    warnings: [],
  };
}

export function uniqueOrderedIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    unique.push(id);
  }

  return unique;
}

function maybeShuffle<T>(items: T[], shouldShuffle: boolean, rng: () => number): T[] {
  return shouldShuffle ? fisherYates(items, rng) : items;
}

function takeQuestionIds(questions: QuestionInput[], targetCount: number, shouldShuffle: boolean, rng: () => number) {
  const byPriority = new Map<number, QuestionInput[]>();
  for (const question of uniqueById(questions)) {
    const priority = question.selectionPriority ?? 0;
    byPriority.set(priority, [...(byPriority.get(priority) ?? []), question]);
  }

  return [...byPriority.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, candidates]) => maybeShuffle(candidates, shouldShuffle, rng))
    .slice(0, normalizeCount(targetCount))
    .map((question) => question.id);
}

function normalizeCount(count: number) {
  return Math.max(0, Math.floor(count));
}

function shortfallWarnings(availableCount: number, requestedCount: number, availableScope: string) {
  if (availableCount >= requestedCount) {
    return [];
  }

  return [`Only ${availableCount} ${availableScope} for the requested count of ${requestedCount}.`];
}

function filterQuestionsByCategories(questions: QuestionInput[], categoryIds: string[], categories: CategoryInput[]) {
  const expanded = expandCategoryIds(categoryIds, categories);
  return questions.filter((question) => expanded.has(question.categoryId));
}

function getCategoryDrillCount(selectedCategoryIds: string[], categories: CategoryDrillInput[], defaultCount: number) {
  if (selectedCategoryIds.length !== 1) {
    return defaultCount;
  }

  const selectedCategory = categories.find((category) => category.id === selectedCategoryIds[0]);
  return selectedCategory?.drillQuestionCount ?? defaultCount;
}

function orderedAvailableQuestionIds(questionIds: string[], questions: QuestionInput[]) {
  const availableIds = new Set(questions.map((question) => question.id));
  const orderedIds: string[] = [];
  const missingIds: string[] = [];

  for (const questionId of uniqueOrderedIds(questionIds)) {
    if (!availableIds.has(questionId)) {
      missingIds.push(questionId);
      continue;
    }

    orderedIds.push(questionId);
  }

  return { questionIds: orderedIds, missingQuestionIds: missingIds };
}

function missingQuestionWarnings(missingQuestionIds: string[]) {
  if (missingQuestionIds.length === 0) {
    return [];
  }

  return [`Exam form omitted ${missingQuestionIds.length} unavailable ${pluralize("question", missingQuestionIds.length)}: ${missingQuestionIds.join(", ")}.`];
}

function formatShortfalls(shortfalls: Array<{ categoryId: string; requested: number; available: number }>) {
  return shortfalls
    .map((shortfall) => `${shortfall.categoryId} only had ${shortfall.available} available for ${shortfall.requested} allocated ${pluralize("question", shortfall.requested)}`)
    .join("; ");
}

function pluralize(word: string, count: number) {
  if (word === "category") {
    return count === 1 ? word : "categories";
  }

  return count === 1 ? word : `${word}s`;
}

function isPositiveWeight(weightPct: string | number | null) {
  return weightPct !== null && Number.isFinite(Number(weightPct)) && Number(weightPct) > 0;
}

function uniqueById(questions: QuestionInput[]) {
  const questionById = new Map<string, QuestionInput>();

  for (const question of questions) {
    if (!questionById.has(question.id)) {
      questionById.set(question.id, question);
    }
  }

  return uniqueOrderedIds(questions.map((question) => question.id)).map((id) => questionById.get(id)!);
}

function countWeightedPoolQuestions(questions: QuestionInput[], topLevelCategories: CategoryInput[], categories: CategoryInput[]) {
  const weightedCategoryIds = new Set<string>();

  for (const category of topLevelCategories) {
    expandCategoryIds([category.id], categories).forEach((categoryId) => weightedCategoryIds.add(categoryId));
  }

  return questions.filter((question) => weightedCategoryIds.has(question.categoryId)).length;
}
