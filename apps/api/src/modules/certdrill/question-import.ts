import { createHash } from "node:crypto";

import { z } from "zod";

import { isSafeCitationUrl } from "./validation";

export const QUESTION_IMPORT_DOCUMENT_VERSION = 1 as const;
export const QUESTION_IMPORT_MAX_ROWS = 500;
export const QUESTION_IMPORT_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type QuestionImportDifficulty = "easy" | "medium" | "hard";

export type QuestionImportFieldError = {
  field: string;
  message: string;
};

export type QuestionImportDuplicateInfo = {
  existingQuestionIds: string[];
  earlierSourceIndexes: number[];
};

export type QuestionImportPreviewRow = {
  sourceIndex: number;
  categoryCode: string;
  categoryId?: string;
  stem: string;
  difficulty: QuestionImportDifficulty;
  answerCount: number;
  valid: boolean;
  duplicate: QuestionImportDuplicateInfo;
  selectedByDefault: boolean;
  errors: QuestionImportFieldError[];
};

export type QuestionImportPreviewResult = {
  documentVersion: typeof QUESTION_IMPORT_DOCUMENT_VERSION;
  documentHash: string;
  totals: {
    submitted: number;
    valid: number;
    invalid: number;
    duplicateExisting: number;
    duplicateBatch: number;
    selectedByDefault: number;
  };
  rows: QuestionImportPreviewRow[];
};

export type QuestionImportCategoryReference = {
  id: string;
  code: string;
  archivedAt: string | Date | null;
};

export type QuestionImportExistingQuestionReference = {
  id: string;
  stem: string;
};

export type NormalizedImportedAnswer = {
  text: string;
  isCorrect: boolean;
  explanation: string;
  citationUrls: string[];
};

export type NormalizedImportedQuestion = {
  sourceIndex: number;
  categoryId: string;
  categoryCode: string;
  stem: string;
  normalizedStem: string;
  difficulty: QuestionImportDifficulty;
  answers: NormalizedImportedAnswer[];
};

export class QuestionImportDocumentError extends Error {
  constructor(public readonly issues: QuestionImportFieldError[]) {
    super("Question import document is invalid.");
    this.name = "QuestionImportDocumentError";
  }
}

const difficultySchema = z.union([z.literal("easy"), z.literal("medium"), z.literal("hard")], {
  error: () => "Difficulty must be easy, medium, or hard.",
});

const answerSchema = z.object({
  text: z.string().trim().min(1, "Answer text is required."),
  isCorrect: z.boolean(),
  explanation: z.string().trim().optional().default(""),
  citationUrls: z.array(
    z.string()
      .trim()
      .refine((value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      }, "Citation URLs must be valid URLs.")
      .refine(isSafeCitationUrl, "Citation URLs must use http, https, or mailto."),
  ).optional().default([]),
}).strict();

const questionSchema = z.object({
  categoryCode: z.string().trim().min(1, "Category code is required."),
  stem: z.string().trim().min(1, "Stem is required."),
  difficulty: difficultySchema.optional().default("medium"),
  answers: z.array(answerSchema)
    .min(2, "Must include at least 2 answers.")
    .max(10, "Must include at most 10 answers.")
    .superRefine((answers, ctx) => {
      const correctCount = answers.filter((answer) => answer.isCorrect).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: "custom",
          path: [],
          message: "Exactly one answer must be correct.",
        });
      }
    }),
}).strict();

const documentSchema = z.object({
  version: z.literal(QUESTION_IMPORT_DOCUMENT_VERSION, {
    error: () => "Document version must be 1.",
  }),
  questions: z.array(z.unknown())
    .min(1, "Must include at least 1 question.")
    .max(QUESTION_IMPORT_MAX_ROWS, `Must include at most ${QUESTION_IMPORT_MAX_ROWS} questions.`),
}).strict();

type ParsedQuestionRow = z.output<typeof questionSchema>;

type AnalyzeQuestionImportInput = {
  document: unknown;
  categories: QuestionImportCategoryReference[];
  existingQuestions: QuestionImportExistingQuestionReference[];
};

type ResolvedCategory =
  | { status: "resolved"; category: QuestionImportCategoryReference }
  | { status: "missing"; error: QuestionImportFieldError }
  | { status: "archived"; error: QuestionImportFieldError }
  | { status: "ambiguous"; error: QuestionImportFieldError }
  | { status: "skipped" };

export function normalizeImportedStem(stem: string) {
  return stem.trim().replace(/\s+/g, " ").toLowerCase();
}

export function analyzeQuestionImport({ document, categories, existingQuestions }: AnalyzeQuestionImportInput) {
  const parsedDocument = documentSchema.safeParse(document);
  if (!parsedDocument.success) {
    throw new QuestionImportDocumentError(formatZodIssues(parsedDocument.error.issues, { rootField: "document" }));
  }

  const documentHash = hashStableJson(parsedDocument.data);
  const categoryIndex = indexCategories(categories);
  const existingQuestionIndex = indexExistingQuestions(existingQuestions);
  const batchStemIndex = new Map<string, number[]>();
  const normalizedRows = new Map<number, NormalizedImportedQuestion>();

  const rows = parsedDocument.data.questions.map((row, sourceIndex) => {
    const previewBase = buildPreviewBase(row, sourceIndex);
    const parsedRow = questionSchema.safeParse(row);
    const rowErrors = parsedRow.success ? [] : formatZodIssues(parsedRow.error.issues, { rootField: "row" });
    const categoryResolution = resolveCategory(previewBase.categoryCode, categoryIndex);

    if (categoryResolution.status === "resolved") {
      previewBase.categoryId = categoryResolution.category.id;
    } else if (categoryResolution.status !== "skipped") {
      rowErrors.push(categoryResolution.error);
    }

    const duplicateStem = parsedRow.success ? parsedRow.data.stem : previewBase.stem;
    const duplicate = buildDuplicateInfo(sourceIndex, duplicateStem, existingQuestionIndex, batchStemIndex);
    const valid = parsedRow.success && categoryResolution.status === "resolved" && rowErrors.length === 0;
    const selectedByDefault = valid && duplicate.existingQuestionIds.length === 0 && duplicate.earlierSourceIndexes.length === 0;

    const previewRow: QuestionImportPreviewRow = {
      sourceIndex,
      categoryCode: parsedRow.success ? parsedRow.data.categoryCode : previewBase.categoryCode,
      categoryId: previewBase.categoryId,
      stem: parsedRow.success ? parsedRow.data.stem : previewBase.stem,
      difficulty: parsedRow.success ? parsedRow.data.difficulty : previewBase.difficulty,
      answerCount: parsedRow.success ? parsedRow.data.answers.length : previewBase.answerCount,
      valid,
      duplicate,
      selectedByDefault,
      errors: sortFieldErrors(rowErrors),
    };

    if (valid && parsedRow.success && categoryResolution.status === "resolved") {
      const normalizedStem = normalizeImportedStem(parsedRow.data.stem);
      normalizedRows.set(sourceIndex, {
        sourceIndex,
        categoryId: categoryResolution.category.id,
        categoryCode: parsedRow.data.categoryCode,
        stem: parsedRow.data.stem,
        normalizedStem,
        difficulty: parsedRow.data.difficulty,
        answers: parsedRow.data.answers.map((answer) => ({
          text: answer.text,
          isCorrect: answer.isCorrect,
          explanation: answer.explanation,
          citationUrls: answer.citationUrls,
        })),
      });
    }

    return previewRow;
  });

  return {
    preview: {
      documentVersion: QUESTION_IMPORT_DOCUMENT_VERSION,
      documentHash,
      totals: {
        submitted: rows.length,
        valid: rows.filter((row) => row.valid).length,
        invalid: rows.filter((row) => !row.valid).length,
        duplicateExisting: rows.filter((row) => row.duplicate.existingQuestionIds.length > 0).length,
        duplicateBatch: rows.filter((row) => row.duplicate.earlierSourceIndexes.length > 0).length,
        selectedByDefault: rows.filter((row) => row.selectedByDefault).length,
      },
      rows,
    } satisfies QuestionImportPreviewResult,
    normalizedRows,
  };
}

function buildPreviewBase(row: unknown, sourceIndex: number) {
  const input = isRecord(row) ? row : {};
  const categoryCode = typeof input.categoryCode === "string" ? input.categoryCode.trim() : "";
  const stem = typeof input.stem === "string" ? input.stem.trim() : "";
  const difficulty: QuestionImportDifficulty = input.difficulty === "easy" || input.difficulty === "medium" || input.difficulty === "hard"
    ? input.difficulty
    : "medium";
  const answerCount = Array.isArray(input.answers) ? input.answers.length : 0;

  return {
    sourceIndex,
    categoryCode,
    categoryId: undefined as string | undefined,
    stem,
    difficulty,
    answerCount,
  };
}

function buildDuplicateInfo(
  sourceIndex: number,
  stem: string,
  existingQuestionIndex: Map<string, string[]>,
  batchStemIndex: Map<string, number[]>,
) {
  if (!stem.trim()) {
    return { existingQuestionIds: [], earlierSourceIndexes: [] };
  }

  const normalizedStem = normalizeImportedStem(stem);
  const existingQuestionIds = [...(existingQuestionIndex.get(normalizedStem) ?? [])];
  const earlierSourceIndexes = [...(batchStemIndex.get(normalizedStem) ?? [])];

  batchStemIndex.set(normalizedStem, [...earlierSourceIndexes, sourceIndex]);

  return { existingQuestionIds, earlierSourceIndexes };
}

function resolveCategory(categoryCode: string, categoryIndex: Map<string, QuestionImportCategoryReference[]>): ResolvedCategory {
  if (!categoryCode) {
    return { status: "skipped" };
  }

  const matches = categoryIndex.get(normalizeCategoryCode(categoryCode)) ?? [];
  if (matches.length === 0) {
    return { status: "missing", error: { field: "categoryCode", message: "Category code does not exist." } };
  }

  if (matches.length > 1) {
    return { status: "ambiguous", error: { field: "categoryCode", message: "Category code is ambiguous." } };
  }

  const [category] = matches;
  if (category.archivedAt) {
    return { status: "archived", error: { field: "categoryCode", message: "Category code is archived." } };
  }

  return { status: "resolved", category };
}

function indexCategories(categories: QuestionImportCategoryReference[]) {
  const index = new Map<string, QuestionImportCategoryReference[]>();

  for (const category of categories) {
    const key = normalizeCategoryCode(category.code);
    const existing = index.get(key) ?? [];
    existing.push(category);
    index.set(key, existing);
  }

  return index;
}

function indexExistingQuestions(existingQuestions: QuestionImportExistingQuestionReference[]) {
  const index = new Map<string, string[]>();

  for (const question of existingQuestions) {
    const key = normalizeImportedStem(question.stem);
    const existing = index.get(key) ?? [];
    existing.push(question.id);
    index.set(key, existing);
  }

  return index;
}

function normalizeCategoryCode(categoryCode: string) {
  return categoryCode.trim().toLowerCase();
}

function hashStableJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sortJsonValue(value))).digest("hex");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((sorted, key) => {
      const entry = value[key];
      if (entry !== undefined) {
        sorted[key] = sortJsonValue(entry);
      }
      return sorted;
    }, {});
}

function formatZodIssues(issues: z.ZodIssue[], options: { rootField: string }) {
  return issues.flatMap<QuestionImportFieldError>((issue) => {
    if (issue.code === "unrecognized_keys") {
      const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
      return keys.map((key) => ({
        field: pathToField([...issue.path, key], options.rootField),
        message: "Unknown field.",
      }));
    }

    return [{
      field: pathToField(issue.path, options.rootField),
      message: issue.message,
    }];
  });
}

function pathToField(path: ReadonlyArray<PropertyKey>, rootField: string) {
  if (path.length === 0) {
    return rootField;
  }

  return path.map(String).join(".");
}

function sortFieldErrors(errors: QuestionImportFieldError[]) {
  return [...errors].sort((left, right) => {
    const fieldComparison = left.field.localeCompare(right.field);
    return fieldComparison !== 0 ? fieldComparison : left.message.localeCompare(right.message);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
