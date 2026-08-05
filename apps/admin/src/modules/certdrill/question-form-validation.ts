import {
  answerFieldName,
  parseQuestionAnswerFields,
} from "./question-answer-fields";

export type QuestionFormFieldErrors = Record<string, string[]>;

export type QuestionFormValidationResult = {
  valid: boolean;
  fieldErrors: QuestionFormFieldErrors;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isSafeCitationUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function addError(fieldErrors: QuestionFormFieldErrors, name: string, message: string) {
  fieldErrors[name] = [...(fieldErrors[name] ?? []), message];
}

export function validateQuestionForm(formData: FormData): QuestionFormValidationResult {
  const fieldErrors: QuestionFormFieldErrors = {};
  const certificationId = stringValue(formData, "certificationId");
  const categoryId = stringValue(formData, "categoryId");
  const stem = stringValue(formData, "stem");
  const sourceResourceId = stringValue(formData, "sourceResourceId");
  const status = stringValue(formData, "status") || "draft";
  const parsedAnswers = parseQuestionAnswerFields(formData);

  if (!certificationId || !uuidPattern.test(certificationId)) {
    addError(fieldErrors, "certificationId", "The selected certification is invalid.");
  }
  if (!categoryId) {
    addError(fieldErrors, "categoryId", "Select a category.");
  } else if (!uuidPattern.test(categoryId)) {
    addError(fieldErrors, "categoryId", "The selected category is invalid.");
  }
  if (!stem) {
    addError(fieldErrors, "stem", "Enter a question stem.");
  }
  if (sourceResourceId && sourceResourceId !== "__none__" && !uuidPattern.test(sourceResourceId)) {
    addError(fieldErrors, "sourceResourceId", "Enter a valid source resource UUID.");
  }

  for (const [name, messages] of Object.entries(parsedAnswers.fieldErrors)) {
    for (const message of messages) {
      addError(fieldErrors, name, message);
    }
  }

  for (const [index, answer] of parsedAnswers.answers.entries()) {
    const answerNumber = index + 1;
    if (!answer.text) {
      addError(
        fieldErrors,
        answerFieldName(answer.key, "text"),
        `Add answer text for answer ${answerNumber}.`,
      );
    }

    answer.citationUrls.forEach((url, citationIndex) => {
      if (!isSafeCitationUrl(url)) {
        addError(
          fieldErrors,
          answerFieldName(answer.key, "citationUrls"),
          `Answer ${answerNumber} citation URL ${citationIndex + 1} must use http, https, or mailto.`,
        );
      }
    });

    if (status === "published") {
      if (!answer.explanation) {
        addError(
          fieldErrors,
          answerFieldName(answer.key, "explanation"),
          `Add an explanation for answer ${answerNumber}.`,
        );
      }
      if (answer.citationUrls.length === 0) {
        addError(
          fieldErrors,
          answerFieldName(answer.key, "citationUrls"),
          `Add at least one citation URL for answer ${answerNumber}.`,
        );
      }
    }
  }

  if (status === "published") {
    const selectedCorrectAnswer = parsedAnswers.answers.find(
      (answer) => answer.key === parsedAnswers.correctAnswerKey,
    );
    if (!selectedCorrectAnswer?.text) {
      addError(
        fieldErrors,
        "correctAnswerKey",
        "Select a correct answer that has answer text.",
      );
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
