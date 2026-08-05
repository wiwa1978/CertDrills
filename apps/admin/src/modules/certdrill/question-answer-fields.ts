export const MIN_QUESTION_ANSWERS = 2;
export const MAX_QUESTION_ANSWERS = 10;

export type QuestionAnswerField = "text" | "explanation" | "citationUrls";

export type ParsedQuestionAnswer = {
  key: string;
  text: string;
  explanation: string;
  citationUrls: string[];
};

export type ParsedQuestionAnswerFields = {
  answerKeys: string[];
  answers: ParsedQuestionAnswer[];
  correctAnswerKey: string;
  fieldErrors: Record<string, string[]>;
};

const answerKeyPattern = /^answer-[A-Za-z0-9_-]+$/;
const answerFieldPattern = /^answer\.([^.]+)\.(text|explanation|citationUrls)$/;

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function csvValues(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addError(fieldErrors: Record<string, string[]>, name: string, message: string) {
  fieldErrors[name] = [...(fieldErrors[name] ?? []), message];
}

function parseAnswerKeys(formData: FormData) {
  return csvValues(stringValue(formData, "answerKeys"));
}

function parseCitationUrls(formData: FormData, answerKey: string) {
  return csvValues(stringValue(formData, answerFieldName(answerKey, "citationUrls")));
}

export function answerFieldName(answerKey: string, field: QuestionAnswerField) {
  return `answer.${answerKey}.${field}`;
}

export function parseQuestionAnswerFields(formData: FormData): ParsedQuestionAnswerFields {
  const fieldErrors: Record<string, string[]> = {};
  const answerKeys = parseAnswerKeys(formData);
  const answerKeySet = new Set(answerKeys);

  if (answerKeys.length < MIN_QUESTION_ANSWERS || answerKeys.length > MAX_QUESTION_ANSWERS) {
    addError(fieldErrors, "options", "Add between 2 and 10 answers.");
  }

  if (new Set(answerKeys).size !== answerKeys.length) {
    addError(fieldErrors, "options", "Answer keys must be unique.");
  }

  for (const key of answerKeys) {
    if (!answerKeyPattern.test(key)) {
      addError(fieldErrors, "options", `Answer key "${key}" is invalid.`);
    }
  }

  const seenUnknownKeys = new Set<string>();
  for (const [name] of formData.entries()) {
    const match = answerFieldPattern.exec(name);
    if (!match) continue;

    const key = match[1];
    if (answerKeySet.has(key) || seenUnknownKeys.has(key)) continue;

    seenUnknownKeys.add(key);
    addError(fieldErrors, "options", `Answer fields reference unknown key "${key}".`);
  }

  const correctAnswerKey = stringValue(formData, "correctAnswerKey");
  if (correctAnswerKey && !answerKeySet.has(correctAnswerKey)) {
    addError(
      fieldErrors,
      "correctAnswerKey",
      "Select a correct answer from the submitted answers.",
    );
  }

  return {
    answerKeys,
    answers: answerKeys.map((key) => ({
      key,
      text: stringValue(formData, answerFieldName(key, "text")),
      explanation: stringValue(formData, answerFieldName(key, "explanation")),
      citationUrls: parseCitationUrls(formData, key),
    })),
    correctAnswerKey,
    fieldErrors,
  };
}
