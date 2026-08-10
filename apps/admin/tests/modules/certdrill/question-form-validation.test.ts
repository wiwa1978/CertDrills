import { describe, expect, it } from "vitest";

import { answerFieldName } from "../../../src/modules/certdrill/question-answer-fields";
import { validateQuestionForm } from "../../../src/modules/certdrill/question-form-validation";

const certificationId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";

function questionFormData(entries: Record<string, string>) {
  const formData = new FormData();
  formData.set("certificationId", certificationId);

  for (const [name, value] of Object.entries(entries)) {
    formData.set(name, value);
  }

  return formData;
}

function answerEntries(
  answers: Array<{
    key: string;
    text?: string;
    explanation?: string;
    citationUrls?: string;
  }>,
  correctAnswerKey = "",
) {
  return Object.fromEntries([
    ["answerKeys", answers.map((answer) => answer.key).join(",")],
    ["correctAnswerKey", correctAnswerKey],
    ...answers.flatMap((answer) => [
      [answerFieldName(answer.key, "text"), answer.text ?? ""],
      [answerFieldName(answer.key, "explanation"), answer.explanation ?? ""],
      [answerFieldName(answer.key, "citationUrls"), answer.citationUrls ?? ""],
    ]),
  ]);
}

describe("question form validation", () => {
  it("returns visible field errors for an empty question", () => {
    const result = validateQuestionForm(questionFormData({ status: "draft" }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toMatchObject({
      categoryId: ["Select a category."],
      stem: ["Enter a question stem."],
      options: ["Add between 2 and 10 answers."],
    });
  });

  it("requires at least two keyed answers when saving a draft", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      ...answerEntries([
        { key: "answer-a", text: "Only answer" },
      ]),
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.options).toEqual(["Add between 2 and 10 answers."]);
  });

  it("allows a draft with ten answer texts and no correct answer", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      ...answerEntries([
        { key: "answer-a", text: "Answer 1" },
        { key: "answer-b", text: "Answer 2" },
        { key: "answer-c", text: "Answer 3" },
        { key: "answer-d", text: "Answer 4" },
        { key: "answer-e", text: "Answer 5" },
        { key: "answer-f", text: "Answer 6" },
        { key: "answer-g", text: "Answer 7" },
        { key: "answer-h", text: "Answer 8" },
        { key: "answer-i", text: "Answer 9" },
        { key: "answer-j", text: "Answer 10" },
      ]),
    }));

    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });

  it("requires answer text for every visible draft answer", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      ...answerEntries([
        { key: "answer-a", text: "First answer" },
        { key: "answer-b" },
      ]),
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors[answerFieldName("answer-b", "text")]).toEqual([
      "Add answer text for answer 2.",
    ]);
  });

  it("keeps draft explanations and citations optional when texts are present", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      ...answerEntries([
        { key: "answer-a", text: "First answer", explanation: "Optional explanation" },
        { key: "answer-b", text: "Second answer", citationUrls: "https://example.com/second" },
      ]),
    }));

    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });

  it("requires publishable keyed answer content when status is published", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      ...answerEntries([
        { key: "answer-a", text: "Correct answer" },
        { key: "answer-b", text: "Second answer" },
      ], "answer-a"),
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toMatchObject({
      [answerFieldName("answer-a", "explanation")]: ["Add an explanation for answer 1."],
      [answerFieldName("answer-a", "citationUrls")]: ["Add at least one citation URL for answer 1."],
      [answerFieldName("answer-b", "explanation")]: ["Add an explanation for answer 2."],
      [answerFieldName("answer-b", "citationUrls")]: ["Add at least one citation URL for answer 2."],
    });
  });

  it("rejects a correct-answer selection whose keyed answer has no text", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      ...answerEntries([
        {
          key: "answer-a",
          text: "First",
          explanation: "First explanation",
          citationUrls: "https://example.com/first",
        },
        {
          key: "answer-b",
          text: "Second",
          explanation: "Second explanation",
          citationUrls: "https://example.com/second",
        },
        {
          key: "answer-c",
          explanation: "Third explanation",
          citationUrls: "https://example.com/third",
        },
      ], "answer-c"),
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.correctAnswerKey).toEqual([
      "Select a correct answer that has answer text.",
    ]);
  });

  it("requires an explicit correct-answer selection when publishing", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      ...answerEntries([
        {
          key: "answer-a",
          text: "First",
          explanation: "First explanation",
          citationUrls: "https://example.com/first",
        },
        {
          key: "answer-b",
          text: "Second",
          explanation: "Second explanation",
          citationUrls: "https://example.com/second",
        },
      ]),
    }));

    expect(result.fieldErrors.correctAnswerKey).toEqual([
      "Select a correct answer that has answer text.",
    ]);
  });

  it("rejects invalid source and citation URLs with field-specific messages", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      sourceResourceId: "not-a-uuid",
      ...answerEntries([
        {
          key: "answer-a",
          text: "First",
          explanation: "First explanation",
          citationUrls: "javascript:alert(1)",
        },
        {
          key: "answer-b",
          text: "Second",
          explanation: "Second explanation",
          citationUrls: "https://example.com/second",
        },
      ], "answer-a"),
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.sourceResourceId).toEqual(["Enter a valid source resource UUID."]);
    expect(result.fieldErrors[answerFieldName("answer-a", "citationUrls")]).toEqual([
      "Answer 1 citation URL 1 must use http, https, or mailto.",
    ]);
  });

  it("surfaces parser structural errors alongside validation errors", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      ...answerEntries([
        { key: "answer-a", text: "First" },
        { key: "answer-a", text: "Duplicate" },
      ], "answer-missing"),
      [answerFieldName("answer-c", "text")]: "Unexpected",
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.options).toEqual([
      "Answer keys must be unique.",
      'Answer fields reference unknown key "answer-c".',
    ]);
    expect(result.fieldErrors.correctAnswerKey).toEqual([
      "Select a correct answer from the submitted answers.",
    ]);
  });

  it("allows the clear-source sentinel when editing", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      sourceResourceId: "__none__",
      ...answerEntries([
        { key: "answer-a", text: "First answer" },
        { key: "answer-b", text: "Second answer" },
      ]),
    }));

    expect(result.fieldErrors.sourceResourceId).toBeUndefined();
  });

  it("accepts a complete published question", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      ...answerEntries([
        {
          key: "answer-a",
          text: "First",
          explanation: "First explanation",
          citationUrls: "https://example.com/first",
        },
        {
          key: "answer-b",
          text: "Second",
          explanation: "Second explanation",
          citationUrls: "mailto:owner@example.com",
        },
      ], "answer-a"),
    }));

    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });
  it("accepts published fill-in questions with normalized answer aliases", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Complete the service name: Azure ____",
      questionType: "fill_blank",
      status: "published",
      acceptedAnswers: "Role-Based Access Control\nRBAC",
      interactionExplanation: "RBAC scopes permissions through role assignments.",
      interactionCitationUrls: "https://example.com/rbac",
    }));

    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });

  it("rejects duplicate normalized fill-in aliases", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Complete the acronym",
      questionType: "fill_blank",
      status: "draft",
      acceptedAnswers: "RBAC\n rbac ",
    }));

    expect(result.fieldErrors.acceptedAnswers).toContain("Accepted answers must be unique after case and whitespace normalization.");
  });

  it("accepts a published matching question with two grounded pairs", () => {
    const formData = questionFormData({ categoryId, stem: "Match each control", questionType: "matching", status: "published" });
    for (const value of ["RBAC", "Policy"]) formData.append("matchingPrompts", value);
    for (const value of ["Role assignments", "Compliance evaluation"]) formData.append("matchingTargets", value);
    for (const value of ["RBAC uses roles.", "Policy evaluates resources."]) formData.append("matchingExplanations", value);
    for (const value of ["https://example.com/rbac", "https://example.com/policy"]) formData.append("matchingCitationUrls", value);

    expect(validateQuestionForm(formData)).toEqual({ valid: true, fieldErrors: {} });
  });
});
