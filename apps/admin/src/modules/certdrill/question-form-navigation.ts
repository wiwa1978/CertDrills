import type { QuestionFormFieldErrors } from "./question-form-validation";

export type QuestionAnswerTab = "overview" | "answer-0" | "answer-1" | "answer-2" | "answer-3";

export function questionFieldId(idPrefix: string, fieldName: string) {
  if (fieldName === "categoryId") return `${idPrefix}-category-id`;
  if (fieldName === "stem") return `${idPrefix}-stem`;
  if (fieldName === "sourceResourceId") return `${idPrefix}-source-resource-id`;
  if (fieldName === "correctOption") return `${idPrefix}-correct-option-0`;
  if (fieldName === "options") return `${idPrefix}-answers`;

  const optionField = fieldName.match(/^option([0-3])(Text|Explanation|CitationUrls)$/);
  if (!optionField) return `${idPrefix}-form`;

  const [, index, suffix] = optionField;
  const fieldSuffix = suffix === "Text"
    ? "text"
    : suffix === "Explanation"
      ? "explanation"
      : "citations";
  return `${idPrefix}-option-${index}-${fieldSuffix}`;
}

export function questionTabForField(fieldName: string): QuestionAnswerTab | undefined {
  if (fieldName === "correctOption" || fieldName === "options") return "overview";

  const optionField = fieldName.match(/^option([0-3])(Text|Explanation|CitationUrls)$/);
  if (!optionField) return undefined;

  return `answer-${optionField[1]}` as QuestionAnswerTab;
}

export function firstQuestionFieldError(fieldErrors: QuestionFormFieldErrors) {
  return Object.keys(fieldErrors)[0];
}
