import { createHash } from "node:crypto";

import { z } from "zod";

import { isSafeCitationUrl } from "./validation";

export const QUESTION_IMPORT_DOCUMENT_VERSION = 1 as const;
export const QUESTION_IMPORT_MAX_ROWS = 500;
export const QUESTION_IMPORT_MIN_ANSWERS = 2;
export const QUESTION_IMPORT_MAX_ANSWERS = 10;
export const QUESTION_IMPORT_MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
// Valid import documents are shallow; this leaves ample headroom while rejecting hostile inputs
// before engine-specific JSON serialization limits can turn them into 500s.
export const QUESTION_IMPORT_MAX_DOCUMENT_NESTING = 256;
// Validation error budgets. A hostile document can hold millions of malformed entries (an
// oversized `answers` array, a huge `citationUrls` array, or thousands of unknown keys), so every
// error list is capped and a deterministic marker is appended when issues were dropped. This keeps
// validation memory and the preview response bounded: at most
// QUESTION_IMPORT_MAX_ROWS * (QUESTION_IMPORT_MAX_ROW_ERRORS + 1) row errors are ever returned.
export const QUESTION_IMPORT_MAX_ROW_ERRORS = 25;
export const QUESTION_IMPORT_MAX_DOCUMENT_ERRORS = 50;
export const QUESTION_IMPORT_TRUNCATED_ERRORS_MESSAGE = "Additional validation errors were omitted.";
// Headroom for the request envelope around the document (certification id, preview hash, and the
// selected/override index arrays). Exported so the global request guardrails and the import routes
// share one transport cap instead of drifting apart.
export const QUESTION_IMPORT_MAX_ENVELOPE_BYTES = 64 * 1024;
export const QUESTION_IMPORT_MAX_RAW_BODY_BYTES = QUESTION_IMPORT_MAX_DOCUMENT_BYTES + QUESTION_IMPORT_MAX_ENVELOPE_BYTES;

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
  // Citation URLs pass through the schema untouched and are checked by `normalizeCitationUrls`
  // instead. A per-element Zod schema would emit one issue per malformed entry, so a single answer
  // carrying millions of bad citations could produce millions of issues.
  citationUrls: z.unknown().optional(),
}).strict();

// Answer-count rules (min, max, and exactly one correct answer) live in `validateQuestionRow`
// rather than in the schema, so an over-long `answers` array is rejected on its length without
// schema-validating every extra element.
const questionSchema = z.object({
  categoryCode: z.string().trim().min(1, "Category code is required."),
  stem: z.string().trim().min(1, "Stem is required."),
  difficulty: difficultySchema.optional().default("medium"),
  answers: z.array(answerSchema),
}).strict();

const documentSchema = z.object({
  version: z.literal(QUESTION_IMPORT_DOCUMENT_VERSION, {
    error: () => "Document version must be 1.",
  }),
  questions: z.array(z.unknown())
    .min(1, "Must include at least 1 question.")
    .max(QUESTION_IMPORT_MAX_ROWS, `Must include at most ${QUESTION_IMPORT_MAX_ROWS} questions.`),
}).strict();

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
  const parsedDocument = parseImportDocument(document);

  const documentHash = hashQuestionImportDocument(parsedDocument);
  const categoryIndex = indexCategories(categories);
  const existingQuestionIndex = indexExistingQuestions(existingQuestions);
  const batchStemIndex = new Map<string, number[]>();
  const normalizedRows = new Map<number, NormalizedImportedQuestion>();

  const rows = parsedDocument.questions.map((row, sourceIndex) => {
    const previewBase = buildPreviewBase(row, sourceIndex);
    const rowErrors = new BoundedFieldErrors({ limit: QUESTION_IMPORT_MAX_ROW_ERRORS, markerField: "row", sort: true });
    const parsedRow = validateQuestionRow(row, rowErrors);
    const categoryResolution = resolveCategory(previewBase.categoryCode, categoryIndex);

    if (categoryResolution.status === "resolved") {
      previewBase.categoryId = categoryResolution.category.id;
    } else if (categoryResolution.status !== "skipped") {
      rowErrors.add(categoryResolution.error.field, categoryResolution.error.message);
    }

    const duplicateStem = parsedRow ? parsedRow.stem : previewBase.stem;
    const valid = parsedRow !== null && categoryResolution.status === "resolved" && !rowErrors.hasErrors;
    // Invalid rows can still surface their own existing-question matches, but they are never
    // indexed for later rows: an unimportable row must not turn a later valid row into a
    // within-batch duplicate.
    const duplicate = buildDuplicateInfo(sourceIndex, duplicateStem, existingQuestionIndex, batchStemIndex, valid);
    const selectedByDefault = valid && duplicate.existingQuestionIds.length === 0 && duplicate.earlierSourceIndexes.length === 0;

    const previewRow: QuestionImportPreviewRow = {
      sourceIndex,
      categoryCode: parsedRow ? parsedRow.categoryCode : previewBase.categoryCode,
      categoryId: previewBase.categoryId,
      stem: parsedRow ? parsedRow.stem : previewBase.stem,
      difficulty: parsedRow ? parsedRow.difficulty : previewBase.difficulty,
      // Always the submitted answer count, so an over-limit row still reports how many answers it
      // actually carried even though only the first allowed answers were schema-validated.
      answerCount: previewBase.answerCount,
      valid,
      duplicate,
      selectedByDefault,
      errors: rowErrors.toFieldErrors(),
    };

    if (valid && parsedRow && categoryResolution.status === "resolved") {
      normalizedRows.set(sourceIndex, {
        sourceIndex,
        categoryId: categoryResolution.category.id,
        categoryCode: parsedRow.categoryCode,
        stem: parsedRow.stem,
        normalizedStem: normalizeImportedStem(parsedRow.stem),
        difficulty: parsedRow.difficulty,
        answers: parsedRow.answers,
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

// Bounded, sortable field-error accumulator. Once the limit is reached the collector stops
// retaining errors and records that issues were dropped, so callers can also stop scanning
// hostile input instead of walking millions of entries that can never be reported.
class BoundedFieldErrors {
  private readonly errors: QuestionImportFieldError[] = [];
  private truncated = false;

  constructor(private readonly options: { limit: number; markerField: string; sort: boolean }) {}

  get isFull() {
    return this.errors.length >= this.options.limit;
  }

  get hasErrors() {
    return this.errors.length > 0 || this.truncated;
  }

  /** Returns false when the error was dropped because the budget is exhausted. */
  add(field: string, message: string) {
    if (this.isFull) {
      this.truncated = true;
      return false;
    }

    this.errors.push({ field, message });
    return true;
  }

  addZodIssues(issues: ReadonlyArray<z.ZodIssue>) {
    for (const issue of issues) {
      if (issue.code === "unrecognized_keys") {
        const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
        for (const key of keys) {
          if (!this.add(pathToField([...issue.path, key], this.options.markerField), "Unknown field.")) return;
        }
        continue;
      }

      if (!this.add(pathToField(issue.path, this.options.markerField), issue.message)) return;
    }
  }

  toFieldErrors(): QuestionImportFieldError[] {
    const errors = this.options.sort ? sortFieldErrors(this.errors) : [...this.errors];
    if (this.truncated) {
      errors.push({ field: this.options.markerField, message: QUESTION_IMPORT_TRUNCATED_ERRORS_MESSAGE });
    }

    return errors;
  }
}

function parseImportDocument(document: unknown) {
  const parsed = documentSchema.safeParse(capDocumentQuestions(document));
  if (parsed.success) {
    return parsed.data;
  }

  const documentErrors = new BoundedFieldErrors({
    limit: QUESTION_IMPORT_MAX_DOCUMENT_ERRORS,
    markerField: "document",
    sort: false,
  });
  documentErrors.addZodIssues(parsed.error.issues);
  throw new QuestionImportDocumentError(documentErrors.toFieldErrors());
}

// Zod validates (and copies) every element of `questions` before the max-rows check reports the
// problem, so an over-long array is capped just past the limit first. The document is rejected
// either way and the work stays bounded by the row limit instead of the submitted row count.
function capDocumentQuestions(document: unknown): unknown {
  if (!isRecord(document) || !Array.isArray(document.questions) || document.questions.length <= QUESTION_IMPORT_MAX_ROWS) {
    return document;
  }

  return { ...document, questions: document.questions.slice(0, QUESTION_IMPORT_MAX_ROWS + 1) };
}

type ValidatedQuestionRow = {
  categoryCode: string;
  stem: string;
  difficulty: QuestionImportDifficulty;
  answers: NormalizedImportedAnswer[];
};

function validateQuestionRow(row: unknown, errors: BoundedFieldErrors): ValidatedQuestionRow | null {
  const rawAnswers = isRecord(row) && Array.isArray(row.answers) ? row.answers : null;
  const answersOverLimit = rawAnswers !== null && rawAnswers.length > QUESTION_IMPORT_MAX_ANSWERS;
  // Only the first allowed answers are schema-validated. An `answers` array with millions of
  // entries is rejected on its length alone, and validating every extra element would let one
  // hostile row emit millions of issues.
  const cappedAnswers = answersOverLimit ? rawAnswers.slice(0, QUESTION_IMPORT_MAX_ANSWERS) : rawAnswers;
  const candidate = answersOverLimit ? { ...(row as Record<string, unknown>), answers: cappedAnswers } : row;

  const parsed = questionSchema.safeParse(candidate);
  if (!parsed.success) {
    errors.addZodIssues(parsed.error.issues);
  }

  if (rawAnswers) {
    if (rawAnswers.length < QUESTION_IMPORT_MIN_ANSWERS) {
      errors.add("answers", `Must include at least ${QUESTION_IMPORT_MIN_ANSWERS} answers.`);
    }

    if (answersOverLimit) {
      errors.add("answers", `Must include at most ${QUESTION_IMPORT_MAX_ANSWERS} answers.`);
    } else if (countCorrectAnswers(rawAnswers) !== 1) {
      errors.add("answers", "Exactly one answer must be correct.");
    }
  }

  const citationUrls = normalizeAnswerCitations(cappedAnswers ?? [], errors);
  if (!parsed.success || citationUrls === null) {
    return null;
  }

  return {
    categoryCode: parsed.data.categoryCode,
    stem: parsed.data.stem,
    difficulty: parsed.data.difficulty,
    answers: parsed.data.answers.map((answer, index) => ({
      text: answer.text,
      isCorrect: answer.isCorrect,
      explanation: answer.explanation,
      citationUrls: citationUrls[index] ?? [],
    })),
  };
}

function countCorrectAnswers(answers: ReadonlyArray<unknown>) {
  return answers.filter((answer) => isRecord(answer) && answer.isCorrect === true).length;
}

function normalizeAnswerCitations(answers: ReadonlyArray<unknown>, errors: BoundedFieldErrors): string[][] | null {
  const normalized: string[][] = [];
  let valid = true;

  for (const [index, answer] of answers.entries()) {
    const citationUrls = normalizeCitationUrls(
      isRecord(answer) ? answer.citationUrls : undefined,
      `answers.${index}.citationUrls`,
      errors,
    );

    if (citationUrls === null) {
      valid = false;
      // Remaining answers are still checked so every answer reports its own citation problems,
      // unless the row error budget is already exhausted and nothing more can be reported.
      if (errors.isFull) return null;
      continue;
    }

    if (valid) {
      normalized.push(citationUrls);
    }
  }

  return valid ? normalized : null;
}

// Deliberately hand-rolled instead of a per-element Zod schema: a hostile array can hold millions
// of malformed entries, so entries are checked linearly and scanning stops as soon as the row
// error budget is exhausted. The row stays invalid either way.
function normalizeCitationUrls(value: unknown, field: string, errors: BoundedFieldErrors): string[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.add(field, "Citation URLs must be provided as an array.");
    return null;
  }

  const normalized: string[] = [];
  let valid = true;

  for (const [index, entry] of value.entries()) {
    const entryField = `${field}.${index}`;

    if (typeof entry !== "string") {
      valid = false;
      if (!errors.add(entryField, "Citation URLs must be strings.")) return null;
      continue;
    }

    const citationUrl = entry.trim();
    if (!isSafeCitationUrl(citationUrl)) {
      valid = false;
      const message = isParsableUrl(citationUrl)
        ? "Citation URLs must use http, https, or mailto."
        : "Citation URLs must be valid URLs.";
      if (!errors.add(entryField, message)) return null;
      continue;
    }

    if (valid) {
      normalized.push(citationUrl);
    }
  }

  return valid ? normalized : null;
}

function isParsableUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
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
  indexStem: boolean,
) {
  if (!stem.trim()) {
    return { existingQuestionIds: [], earlierSourceIndexes: [] };
  }

  const normalizedStem = normalizeImportedStem(stem);
  const existingQuestionIds = [...(existingQuestionIndex.get(normalizedStem) ?? [])];
  const earlierSourceIndexes = [...(batchStemIndex.get(normalizedStem) ?? [])];

  if (indexStem) {
    batchStemIndex.set(normalizedStem, [...earlierSourceIndexes, sourceIndex]);
  }

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

export function hashQuestionImportDocument(value: unknown) {
  return createHash("sha256").update(serializeWithSortedKeys(value)).digest("hex");
}

type SerializationFrame =
  | { kind: "value"; value: unknown; depth: number }
  | { kind: "literal"; text: string };

type QuestionImportDocumentBytesResult =
  | { kind: "ok"; bytes: number }
  | { kind: "invalid" };

class QuestionImportDocumentShapeError extends Error {}

export function measureQuestionImportDocumentBytes(value: unknown): QuestionImportDocumentBytesResult {
  try {
    const serialized = serializeWithSortedKeys(value, QUESTION_IMPORT_MAX_DOCUMENT_NESTING);
    return { kind: "ok", bytes: Buffer.byteLength(serialized, "utf8") };
  } catch (error) {
    if (error instanceof QuestionImportDocumentShapeError) {
      return { kind: "invalid" };
    }

    throw error;
  }
}

// Canonical JSON serialization with recursively key-sorted objects, written with an explicit stack.
// Both a recursive walk and `JSON.stringify` with a replacer recurse per nesting level, so a deeply
// nested (but small) hostile document could overflow the stack before validation ever rejected it.
function serializeWithSortedKeys(value: unknown, maxDepth = Number.POSITIVE_INFINITY) {
  const output: string[] = [];
  const stack: SerializationFrame[] = [{ kind: "value", value, depth: 0 }];

  while (stack.length > 0) {
    const frame = stack.pop() as SerializationFrame;

    if (frame.kind === "literal") {
      output.push(frame.text);
      continue;
    }

    const entry = frame.value;

    if (Array.isArray(entry)) {
      if (frame.depth >= maxDepth) {
        throw new QuestionImportDocumentShapeError();
      }

      output.push("[");
      stack.push({ kind: "literal", text: "]" });
      for (let index = entry.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: "value", value: entry[index], depth: frame.depth + 1 });
        if (index > 0) {
          stack.push({ kind: "literal", text: "," });
        }
      }
      continue;
    }

    if (isRecord(entry)) {
      if (frame.depth >= maxDepth) {
        throw new QuestionImportDocumentShapeError();
      }

      const keys = Object.keys(entry)
        .filter((key) => entry[key] !== undefined)
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);

      output.push("{");
      stack.push({ kind: "literal", text: "}" });
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        stack.push({ kind: "value", value: entry[keys[index]], depth: frame.depth + 1 });
        stack.push({ kind: "literal", text: `${JSON.stringify(keys[index])}:` });
        if (index > 0) {
          stack.push({ kind: "literal", text: "," });
        }
      }
      continue;
    }

    // `JSON.stringify` returns undefined for values it cannot represent (undefined, functions,
    // symbols); inside an array those serialize as null, which is what JSON.stringify would emit.
    output.push(JSON.stringify(entry) ?? "null");
  }

  return output.join("");
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
