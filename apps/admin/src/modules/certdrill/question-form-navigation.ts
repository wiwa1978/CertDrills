import type { QuestionFormFieldErrors } from "./question-form-validation";

export type QuestionAnswerTab = "overview" | `answer:${string}`;

const answerFieldPattern = /^answer\.([A-Za-z0-9_-]+)\.(text|explanation|citationUrls)$/;

export function questionFieldId(idPrefix: string, fieldName: string) {
  if (fieldName === "categoryId") return `${idPrefix}-category-id`;
  if (fieldName === "stem") return `${idPrefix}-stem`;
  if (fieldName === "sourceResourceId") return `${idPrefix}-source-resource-id`;
  if (fieldName === "correctAnswerKey") return `${idPrefix}-correct-answer`;
  if (fieldName === "options") return `${idPrefix}-answers`;

  const match = fieldName.match(answerFieldPattern);
  if (!match) return `${idPrefix}-form`;

  const [, answerKey, field] = match;
  const suffix = field === "citationUrls" ? "citations" : field;
  return `${idPrefix}-${answerKey}-${suffix}`;
}

export function questionTabForField(fieldName: string): QuestionAnswerTab | undefined {
  if (fieldName === "correctAnswerKey" || fieldName === "options") return "overview";

  const match = fieldName.match(answerFieldPattern);
  return match ? (`answer:${match[1]}` as QuestionAnswerTab) : undefined;
}

export function firstQuestionFieldError(fieldErrors: QuestionFormFieldErrors) {
  return Object.keys(fieldErrors)[0];
}
