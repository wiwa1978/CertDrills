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

function csvValues(formData: FormData, name: string) {
  return stringValue(formData, name)
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
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
  const correctOption = stringValue(formData, "correctOption");
  const options = [0, 1, 2, 3].map((index) => ({
    index,
    text: stringValue(formData, `option${index}Text`),
    explanation: stringValue(formData, `option${index}Explanation`),
    citationUrls: csvValues(formData, `option${index}CitationUrls`),
  }));
  const populatedOptions = options.filter((option) => option.text);

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

  for (const option of options) {
    const optionNumber = option.index + 1;
    const hasSupportingContent = Boolean(option.explanation || option.citationUrls.length > 0);

    if (!option.text && hasSupportingContent) {
      addError(fieldErrors, `option${option.index}Text`, `Add answer text for option ${optionNumber}.`);
    }

    option.citationUrls.forEach((url, citationIndex) => {
      if (!isSafeCitationUrl(url)) {
        addError(
          fieldErrors,
          `option${option.index}CitationUrls`,
          `Option ${optionNumber} citation URL ${citationIndex + 1} must use http, https, or mailto.`,
        );
      }
    });
  }

  if (populatedOptions.length < 2) {
    addError(fieldErrors, "options", "Add at least two answer options.");
  }

  if (status === "published") {
    const selectedCorrectOption = /^[0-3]$/.test(correctOption)
      ? options[Number(correctOption)]
      : undefined;
    if (!selectedCorrectOption?.text) {
      addError(fieldErrors, "correctOption", "Select a correct answer that has option text.");
    }

    for (const option of populatedOptions) {
      const optionNumber = option.index + 1;
      if (!option.explanation) {
        addError(
          fieldErrors,
          `option${option.index}Explanation`,
          `Add an explanation for option ${optionNumber}.`,
        );
      }
      if (option.citationUrls.length === 0) {
        addError(
          fieldErrors,
          `option${option.index}CitationUrls`,
          `Add at least one citation URL for option ${optionNumber}.`,
        );
      }
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
