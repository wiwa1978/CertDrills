import { eq } from "drizzle-orm";

import {
  certdrillAnswerOptions,
  certdrillExamCategories,
  certdrillQuestions,
} from "@platform/platform-db";

import {
  QUESTION_IMPORT_MAX_ROWS,
  QuestionImportDocumentError,
  analyzeQuestionImport,
  type NormalizedImportedQuestion,
  type QuestionImportCategoryReference,
  type QuestionImportExistingQuestionReference,
  type QuestionImportPreviewResult,
} from "./question-import";

export type QuestionImportPreviewInput = {
  certificationId: string;
  document: unknown;
};

export type QuestionImportConfirmInput = QuestionImportPreviewInput & {
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
};

export type QuestionImportResult = {
  importedCount: number;
  questionIds: string[];
};

export type QuestionImportServiceErrorCode =
  | "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT"
  | "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT";

export class QuestionImportServiceError extends Error {
  constructor(
    public readonly code: QuestionImportServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "QuestionImportServiceError";
  }
}

type QuestionImportReferences = {
  categories: QuestionImportCategoryReference[];
  existingQuestions: QuestionImportExistingQuestionReference[];
};

type SelectedImportRow = {
  sourceIndex: number;
  normalized: NormalizedImportedQuestion;
};

export function createQuestionImportService({
  db,
  generateId = () => crypto.randomUUID(),
}: {
  db: any;
  generateId?: () => string;
}) {
  async function loadReferences(database: any, certificationId: string): Promise<QuestionImportReferences> {
    const [categories, existingQuestions] = await Promise.all([
      database.query.certdrillExamCategories.findMany({
        where: eq(certdrillExamCategories.certificationId, certificationId),
      }),
      database.query.certdrillQuestions.findMany({
        where: eq(certdrillQuestions.certificationId, certificationId),
        columns: { id: true, stem: true },
      }),
    ]);

    return { categories, existingQuestions };
  }

  function analyzeOrServiceError(document: unknown, references: QuestionImportReferences) {
    try {
      return analyzeQuestionImport({ document, ...references });
    } catch (error) {
      if (error instanceof QuestionImportDocumentError) {
        throw new QuestionImportServiceError(
          "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
          error.message,
          error.issues,
        );
      }
      throw error;
    }
  }

  async function preview(input: QuestionImportPreviewInput): Promise<QuestionImportPreviewResult> {
    const references = await loadReferences(db, input.certificationId);
    return analyzeOrServiceError(input.document, references).preview;
  }

  async function confirm(input: QuestionImportConfirmInput): Promise<QuestionImportResult> {
    return withTransaction(db, async (tx) => {
      const references = await loadReferences(tx, input.certificationId);
      const analysis = analyzeOrServiceError(input.document, references);
      const preview = analysis.preview;
      const rowCount = preview.rows.length;

      const selectedRaw = input.selectedSourceIndexes;
      const overrideRaw = input.duplicateOverrideSourceIndexes;

      const isKnownIndex = (index: number) => Number.isInteger(index) && index >= 0 && index < rowCount;
      const selectedHasUnknownIndex = selectedRaw.some((index) => !isKnownIndex(index));
      const overrideHasUnknownIndex = overrideRaw.some((index) => !isKnownIndex(index));

      const selectedUnique = new Set(selectedRaw);
      const overrideUnique = new Set(overrideRaw);
      const hasDuplicateSelected = selectedUnique.size !== selectedRaw.length;
      const hasDuplicateOverride = overrideUnique.size !== overrideRaw.length;
      const overrideNotSelected = overrideRaw.some((index) => !selectedUnique.has(index));

      const emptySelection = selectedRaw.length === 0;
      const tooManySelected = selectedRaw.length > QUESTION_IMPORT_MAX_ROWS;
      const hashMismatch = preview.documentHash !== input.previewDocumentHash;

      const selectedRows: SelectedImportRow[] = [];
      let invalidSelectedRow = false;
      let duplicateWithoutOverride = false;

      if (!selectedHasUnknownIndex) {
        for (const sourceIndex of selectedUnique) {
          const row = preview.rows[sourceIndex];
          const normalized = analysis.normalizedRows.get(sourceIndex);
          if (!row?.valid || !normalized) {
            invalidSelectedRow = true;
            continue;
          }

          const isDuplicate = row.duplicate.existingQuestionIds.length > 0 || row.duplicate.earlierSourceIndexes.length > 0;
          if (isDuplicate && !overrideUnique.has(sourceIndex)) {
            duplicateWithoutOverride = true;
            continue;
          }

          selectedRows.push({ sourceIndex, normalized });
        }
      }

      const conflict = hashMismatch
        || emptySelection
        || tooManySelected
        || hasDuplicateSelected
        || hasDuplicateOverride
        || selectedHasUnknownIndex
        || overrideHasUnknownIndex
        || overrideNotSelected
        || invalidSelectedRow
        || duplicateWithoutOverride;

      if (conflict) {
        throw new QuestionImportServiceError(
          "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
          "Question import selection no longer matches the current preview. Review the refreshed preview.",
          preview,
        );
      }

      const questionsToInsert = selectedRows.map((row) => ({ id: generateId(), ...row }));

      await tx.insert(certdrillQuestions).values(questionsToInsert.map(({ id, normalized }) => ({
        id,
        certificationId: input.certificationId,
        categoryId: normalized.categoryId,
        sourceResourceId: null,
        generationJobId: null,
        stem: normalized.stem,
        mediaAssets: [],
        difficulty: normalized.difficulty,
        status: "draft",
        createdBy: "ai",
      })));

      await tx.insert(certdrillAnswerOptions).values(questionsToInsert.flatMap(({ id, normalized }) =>
        normalized.answers.map((answer, sortOrder) => ({
          questionId: id,
          text: answer.text,
          mediaAssets: [],
          isCorrect: answer.isCorrect,
          explanation: answer.explanation,
          citationUrls: answer.citationUrls,
          sortOrder,
        })),
      ));

      return {
        importedCount: questionsToInsert.length,
        questionIds: questionsToInsert.map(({ id }) => id),
      };
    });
  }

  return { preview, confirm };
}

async function withTransaction<T>(database: any, operation: (tx: any) => Promise<T>): Promise<T> {
  if (typeof database.transaction === "function") {
    return database.transaction(operation);
  }

  return operation(database);
}
