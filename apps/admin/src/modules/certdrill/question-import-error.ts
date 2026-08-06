import type { CertDrillQuestionImportFieldError } from "./question-import-types";

export const QUESTION_IMPORT_GENERIC_ERROR_MESSAGE = "Question import request failed.";

const API_ERROR_STATUS_PREFIX_PATTERN = /^API request failed \(\d+\): /;
const MAX_DISPLAYABLE_ERROR_MESSAGE_LENGTH = 300;
// Next.js masks server-side errors in production builds, so the resulting message is a generic
// digest notice rather than anything actionable for an admin.
const MASKED_SERVER_ERROR_PATTERN = /omitted in production builds|An error occurred in the Server Components render/i;

export type QuestionImportErrorDisplay = {
  message: string;
  documentErrors: CertDrillQuestionImportFieldError[];
};

export function stripApiErrorStatusPrefix(message: string) {
  return message.replace(API_ERROR_STATUS_PREFIX_PATTERN, "");
}

function isDisplayableMessage(message: string) {
  return message.length > 0
    && message.length <= MAX_DISPLAYABLE_ERROR_MESSAGE_LENGTH
    && !MASKED_SERVER_ERROR_PATTERN.test(message);
}

/**
 * Maps a thrown value into a user-facing message. Used for both server-side API failures and
 * client-side server action transport rejections (network, serialization, auth redirects), so an
 * unusable or masked error never leaves the user without an explanation.
 */
export function questionImportErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return QUESTION_IMPORT_GENERIC_ERROR_MESSAGE;
  }

  const message = stripApiErrorStatusPrefix(error.message).trim();
  return isDisplayableMessage(message) ? message : QUESTION_IMPORT_GENERIC_ERROR_MESSAGE;
}
