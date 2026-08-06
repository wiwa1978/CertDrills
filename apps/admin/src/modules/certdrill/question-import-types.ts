// Serializable admin mirrors of the API's question import preview/result shapes
// (apps/api/src/modules/certdrill/question-import.ts and question-import-service.ts).
// Keep these in sync with the API types whenever the import contract changes.

export const MAX_QUESTION_IMPORT_BYTES = 5 * 1024 * 1024;

// Mirrors the API transport cap (QUESTION_IMPORT_MAX_RAW_BODY_BYTES): the document limit plus
// envelope headroom for the certification id, preview hash, and selection index arrays.
export const MAX_QUESTION_IMPORT_ENVELOPE_BYTES = 64 * 1024;
export const MAX_QUESTION_IMPORT_TRANSPORT_BYTES = MAX_QUESTION_IMPORT_BYTES + MAX_QUESTION_IMPORT_ENVELOPE_BYTES;

export const QUESTION_IMPORT_DOCUMENT_VERSION = 1 as const;

export type CertDrillQuestionImportDifficulty = "easy" | "medium" | "hard";

export type CertDrillQuestionImportFieldError = {
  field: string;
  message: string;
};

export type CertDrillQuestionImportDuplicateInfo = {
  existingQuestionIds: string[];
  earlierSourceIndexes: number[];
};

export type CertDrillQuestionImportPreviewRow = {
  sourceIndex: number;
  categoryCode: string;
  categoryId?: string;
  stem: string;
  difficulty: CertDrillQuestionImportDifficulty;
  answerCount: number;
  valid: boolean;
  duplicate: CertDrillQuestionImportDuplicateInfo;
  selectedByDefault: boolean;
  errors: CertDrillQuestionImportFieldError[];
};

export type CertDrillQuestionImportPreviewTotals = {
  submitted: number;
  valid: number;
  invalid: number;
  duplicateExisting: number;
  duplicateBatch: number;
  selectedByDefault: number;
};

export type CertDrillQuestionImportPreviewResult = {
  documentVersion: typeof QUESTION_IMPORT_DOCUMENT_VERSION;
  documentHash: string;
  totals: CertDrillQuestionImportPreviewTotals;
  rows: CertDrillQuestionImportPreviewRow[];
};

export type CertDrillQuestionImportResult = {
  importedCount: number;
  questionIds: string[];
};

export type CertDrillQuestionImportPreviewActionResult =
  | { status: "preview"; preview: CertDrillQuestionImportPreviewResult }
  | { status: "error"; message: string; documentErrors?: CertDrillQuestionImportFieldError[] };

export type CertDrillQuestionImportConfirmActionResult =
  | { status: "success"; importedCount: number; questionIds: string[] }
  | { status: "conflict"; message: string; preview: CertDrillQuestionImportPreviewResult }
  | { status: "error"; message: string; documentErrors?: CertDrillQuestionImportFieldError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isInteger(entry));
}

function isDifficulty(value: unknown): value is CertDrillQuestionImportDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isQuestionImportFieldError(value: unknown): value is CertDrillQuestionImportFieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

function isQuestionImportDuplicateInfo(value: unknown): value is CertDrillQuestionImportDuplicateInfo {
  return isRecord(value)
    && isStringArray(value.existingQuestionIds)
    && isNumberArray(value.earlierSourceIndexes);
}

function isQuestionImportPreviewRow(value: unknown): value is CertDrillQuestionImportPreviewRow {
  if (!isRecord(value)) return false;

  return typeof value.sourceIndex === "number" && Number.isInteger(value.sourceIndex)
    && typeof value.categoryCode === "string"
    && (value.categoryId === undefined || typeof value.categoryId === "string")
    && typeof value.stem === "string"
    && isDifficulty(value.difficulty)
    && typeof value.answerCount === "number"
    && typeof value.valid === "boolean"
    && isQuestionImportDuplicateInfo(value.duplicate)
    && typeof value.selectedByDefault === "boolean"
    && Array.isArray(value.errors) && value.errors.every(isQuestionImportFieldError);
}

function isQuestionImportPreviewTotals(value: unknown): value is CertDrillQuestionImportPreviewTotals {
  if (!isRecord(value)) return false;

  return (["submitted", "valid", "invalid", "duplicateExisting", "duplicateBatch", "selectedByDefault"] as const)
    .every((key) => typeof value[key] === "number");
}

/**
 * Runtime guard validating that untrusted `details` payloads (e.g. from an API error response)
 * carry a usable list of document-level field errors before the UI renders them.
 */
export function isQuestionImportFieldErrorList(value: unknown): value is CertDrillQuestionImportFieldError[] {
  return Array.isArray(value) && value.length > 0 && value.every(isQuestionImportFieldError);
}

/**
 * Runtime guard validating that untrusted `details` payloads (e.g. from an API error response)
 * conform to the CertDrillQuestionImportPreviewResult shape before they are trusted by the UI.
 */
export function isQuestionImportPreviewResult(value: unknown): value is CertDrillQuestionImportPreviewResult {
  if (!isRecord(value)) return false;

  return value.documentVersion === QUESTION_IMPORT_DOCUMENT_VERSION
    && typeof value.documentHash === "string" && value.documentHash.length > 0
    && isQuestionImportPreviewTotals(value.totals)
    && Array.isArray(value.rows) && value.rows.every(isQuestionImportPreviewRow);
}
