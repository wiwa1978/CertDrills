"use server";

import { ApiRequestError } from "@platform/frontend-shared";

import {
  confirmCertDrillAdminQuestionImportServer,
  previewCertDrillAdminQuestionImportServer,
} from "@/lib/api/certdrill.server";

import { questionImportErrorMessage, stripApiErrorStatusPrefix } from "./question-import-error";
import {
  isQuestionImportFieldErrorList,
  isQuestionImportPreviewResult,
  MAX_QUESTION_IMPORT_BYTES,
  type CertDrillQuestionImportConfirmActionResult,
  type CertDrillQuestionImportPreviewActionResult,
} from "./question-import-types";

const QUESTION_IMPORT_CONFLICT_ERROR_CODE = "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT";
const QUESTION_IMPORT_INVALID_DOCUMENT_ERROR_CODE = "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT";

type QuestionImportRawParseResult =
  | { valid: true; document: unknown }
  | { valid: false; message: string };

// Shared by preview and confirm actions so both reject the same malformed raw input the same
// way. The original `rawJson` string is never mutated or cleared here - callers keep whatever
// they had if parsing fails, so the user's typed/pasted input is preserved for correction.
function parseQuestionImportRawJson(rawJson: string): QuestionImportRawParseResult {
  if (rawJson.trim().length === 0) {
    return { valid: false, message: "Add question import JSON first." };
  }

  const byteLength = Buffer.byteLength(rawJson, "utf8");
  if (byteLength > MAX_QUESTION_IMPORT_BYTES) {
    return { valid: false, message: "Question import JSON must not exceed 5 MB." };
  }

  try {
    return { valid: true, document: JSON.parse(rawJson) };
  } catch {
    return { valid: false, message: "Question import JSON is invalid." };
  }
}

// Invalid-document responses carry structured `field`/`message` issues; they are only surfaced
// after runtime validation so a malformed payload degrades to the plain error message.
function questionImportDocumentErrors(error: unknown) {
  if (
    error instanceof ApiRequestError
    && error.errorCode === QUESTION_IMPORT_INVALID_DOCUMENT_ERROR_CODE
    && isQuestionImportFieldErrorList(error.details)
  ) {
    return error.details;
  }

  return undefined;
}

function questionImportActionError(error: unknown) {
  const documentErrors = questionImportDocumentErrors(error);

  return {
    status: "error" as const,
    message: questionImportErrorMessage(error),
    ...(documentErrors ? { documentErrors } : {}),
  };
}

export type CertDrillQuestionImportPreviewActionInput = {
  certificationId: string;
  rawJson: string;
};

export type CertDrillQuestionImportConfirmActionInput = CertDrillQuestionImportPreviewActionInput & {
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
};

export async function previewCertDrillQuestionImportAction(
  input: CertDrillQuestionImportPreviewActionInput,
): Promise<CertDrillQuestionImportPreviewActionResult> {
  const parsedRaw = parseQuestionImportRawJson(input.rawJson);
  if (!parsedRaw.valid) {
    return { status: "error", message: parsedRaw.message };
  }

  try {
    const preview = await previewCertDrillAdminQuestionImportServer({
      certificationId: input.certificationId,
      document: parsedRaw.document,
    });
    return { status: "preview", preview };
  } catch (error) {
    return questionImportActionError(error);
  }
}

export async function confirmCertDrillQuestionImportAction(
  input: CertDrillQuestionImportConfirmActionInput,
): Promise<CertDrillQuestionImportConfirmActionResult> {
  const parsedRaw = parseQuestionImportRawJson(input.rawJson);
  if (!parsedRaw.valid) {
    return { status: "error", message: parsedRaw.message };
  }

  try {
    const result = await confirmCertDrillAdminQuestionImportServer({
      certificationId: input.certificationId,
      document: parsedRaw.document,
      previewDocumentHash: input.previewDocumentHash,
      selectedSourceIndexes: input.selectedSourceIndexes,
      duplicateOverrideSourceIndexes: input.duplicateOverrideSourceIndexes,
    });
    return { status: "success", importedCount: result.importedCount, questionIds: result.questionIds };
  } catch (error) {
    if (
      error instanceof ApiRequestError
      && error.errorCode === QUESTION_IMPORT_CONFLICT_ERROR_CODE
      && isQuestionImportPreviewResult(error.details)
    ) {
      return {
        status: "conflict",
        message: stripApiErrorStatusPrefix(error.message),
        preview: error.details,
      };
    }

    return questionImportActionError(error);
  }
}
