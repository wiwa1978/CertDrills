import type {
  CertDrillAdminCategory,
  CertDrillAdminExamForm,
  CertDrillAdminQuestion,
  CertDrillAdminQuestionType,
} from "@/lib/api/certdrill.server";

export type ExamFormDrillCounts = {
  normal: number;
  matching: number;
  fillBlank: number;
  total: number;
};

export type ExamFormCategoryDistribution = {
  categoryId: string;
  categoryName: string;
  weightPct: string | null;
  counts: ExamFormDrillCounts;
};

export type ExamFormQuestionDistribution = {
  totals: ExamFormDrillCounts;
  categories: ExamFormCategoryDistribution[];
};

export function activeRootCategoryId(
  categoryId: string,
  categoriesById: ReadonlyMap<string, CertDrillAdminCategory>,
) {
  let current = categoriesById.get(categoryId);
  const seen = new Set<string>();

  while (current) {
    if (current.archivedAt || seen.has(current.id)) return null;
    seen.add(current.id);
    if (!current.parentCategoryId) return current.id;
    current = categoriesById.get(current.parentCategoryId);
  }

  return null;
}

export function buildExamFormQuestionDistributions(
  examForms: CertDrillAdminExamForm[],
  questions: CertDrillAdminQuestion[],
  categories: CertDrillAdminCategory[],
) {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const result = new Map<string, ExamFormQuestionDistribution>();

  for (const form of examForms) {
    const totals = emptyCounts();
    const categoryRows = new Map<string, ExamFormCategoryDistribution>();

    for (const allocation of form.allocationSnapshot) {
      categoryRows.set(allocation.categoryId, {
        categoryId: allocation.categoryId,
        categoryName: allocation.categoryName,
        weightPct: allocation.weightPct,
        counts: emptyCounts(),
      });
    }

    for (const questionId of form.questionIds) {
      const question = questionsById.get(questionId);
      if (!question) continue;
      const rootCategoryId = activeRootCategoryId(question.categoryId, categoriesById);
      if (!rootCategoryId) continue;

      let row = categoryRows.get(rootCategoryId);
      if (!row) {
        row = {
          categoryId: rootCategoryId,
          categoryName: categoriesById.get(rootCategoryId)?.name ?? rootCategoryId,
          weightPct: null,
          counts: emptyCounts(),
        };
        categoryRows.set(rootCategoryId, row);
      }

      incrementCounts(totals, question.questionType);
      incrementCounts(row.counts, question.questionType);
    }

    result.set(form.id, { totals, categories: [...categoryRows.values()] });
  }

  return result;
}

function emptyCounts(): ExamFormDrillCounts {
  return { normal: 0, matching: 0, fillBlank: 0, total: 0 };
}

function incrementCounts(counts: ExamFormDrillCounts, questionType?: CertDrillAdminQuestionType) {
  if (questionType === "matching") counts.matching += 1;
  else if (questionType === "fill_blank") counts.fillBlank += 1;
  else counts.normal += 1;
  counts.total += 1;
}
