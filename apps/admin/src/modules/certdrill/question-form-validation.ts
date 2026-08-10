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

function lines(formData: FormData, name: string) {
  return stringValue(formData, name).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function values(formData: FormData, name: string) {
  return formData.getAll(name).map((value) => typeof value === "string" ? value.trim() : "");
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
  const questionType = stringValue(formData, "questionType") || "single_choice";
  const parsedAnswers = questionType === "single_choice" ? parseQuestionAnswerFields(formData) : null;

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

  if (questionType === "single_choice" && parsedAnswers) {
    for (const [name, messages] of Object.entries(parsedAnswers.fieldErrors)) {
      for (const message of messages) addError(fieldErrors, name, message);
    }

    for (const [index, answer] of parsedAnswers.answers.entries()) {
      const answerNumber = index + 1;
      if (!answer.text) addError(fieldErrors, answerFieldName(answer.key, "text"), `Add answer text for answer ${answerNumber}.`);
      answer.citationUrls.forEach((url, citationIndex) => {
        if (!isSafeCitationUrl(url)) addError(fieldErrors, answerFieldName(answer.key, "citationUrls"), `Answer ${answerNumber} citation URL ${citationIndex + 1} must use http, https, or mailto.`);
      });
      if (status === "published") {
        if (!answer.explanation) addError(fieldErrors, answerFieldName(answer.key, "explanation"), `Add an explanation for answer ${answerNumber}.`);
        if (answer.citationUrls.length === 0) addError(fieldErrors, answerFieldName(answer.key, "citationUrls"), `Add at least one citation URL for answer ${answerNumber}.`);
      }
    }

    if (status === "published") {
      const selectedCorrectAnswer = parsedAnswers.answers.find((answer) => answer.key === parsedAnswers.correctAnswerKey);
      if (!selectedCorrectAnswer?.text) addError(fieldErrors, "correctAnswerKey", "Select a correct answer that has answer text.");
    }
  } else if (questionType === "fill_blank") {
    const acceptedAnswers = lines(formData, "acceptedAnswers");
    if (acceptedAnswers.length === 0) addError(fieldErrors, "acceptedAnswers", "Add at least one accepted answer.");
    const normalized = acceptedAnswers.map((answer) => answer.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " "));
    if (new Set(normalized).size !== normalized.length) addError(fieldErrors, "acceptedAnswers", "Accepted answers must be unique after case and whitespace normalization.");
    validateInteractionDetails(formData, "interactionExplanation", "interactionCitationUrls", "fill-in answer", status, fieldErrors);
  } else if (questionType === "matching") {
    const prompts = values(formData, "matchingPrompts");
    const targets = values(formData, "matchingTargets");
    if (prompts.length < 2) addError(fieldErrors, "matchingPairs", "Add at least two matching pairs.");
    prompts.forEach((prompt, index) => {
      if (!prompt || !targets[index]) addError(fieldErrors, "matchingPairs", `Matching pair ${index + 1} requires both prompt and target text.`);
      if (status === "published") {
        const explanations = values(formData, "matchingExplanations");
        const citations = values(formData, "matchingCitationUrls");
        if (!explanations[index]) addError(fieldErrors, "matchingPairs", `Matching pair ${index + 1} requires an explanation.`);
        const urls = (citations[index] ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        if (urls.length === 0) addError(fieldErrors, "matchingPairs", `Matching pair ${index + 1} requires a citation URL.`);
        urls.forEach((url) => { if (!isSafeCitationUrl(url)) addError(fieldErrors, "matchingPairs", `Matching pair ${index + 1} contains an invalid citation URL.`); });
      }
    });
  } else {
    addError(fieldErrors, "questionType", "Select a supported question type.");
  }

function validateInteractionDetails(formData: FormData, explanationName: string, citationsName: string, label: string, status: string, fieldErrors: QuestionFormFieldErrors) {
  const explanation = stringValue(formData, explanationName);
  const citations = lines(formData, citationsName);
  citations.forEach((url) => { if (!isSafeCitationUrl(url)) addError(fieldErrors, citationsName, `The ${label} citation URL must use http, https, or mailto.`); });
  if (status === "published" && !explanation) addError(fieldErrors, explanationName, `Add an explanation for the ${label}.`);
  if (status === "published" && citations.length === 0) addError(fieldErrors, citationsName, `Add at least one citation URL for the ${label}.`);
}

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
