import { describe, expect, it } from "vitest";

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

describe("question form validation", () => {
  it("returns visible field errors for an empty question", () => {
    const result = validateQuestionForm(questionFormData({ status: "draft" }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toMatchObject({
      categoryId: ["Select a category."],
      stem: ["Enter a question stem."],
    });
  });

  it("requires at least two answer texts when saving a draft", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      option0Text: "Only answer",
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.options).toEqual(["Add at least two answer options."]);
  });

  it("allows a draft with two answer texts and no correct answer", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      option0Text: "First answer",
      option1Text: "Second answer",
    }));

    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });

  it("requires answer text when draft supporting content is present", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      status: "draft",
      option0Text: "First answer",
      option1Text: "Second answer",
      option2Explanation: "Needs matching answer text",
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.option2Text).toEqual(["Add answer text for option 3."]);
  });

  it("requires publishable answer content when status is published", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      correctOption: "0",
      option0Text: "Correct answer",
      option0Explanation: "",
      option0CitationUrls: "",
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toMatchObject({
      options: ["Add at least two answer options."],
      option0Explanation: ["Add an explanation for option 1."],
      option0CitationUrls: ["Add at least one citation URL for option 1."],
    });
  });

  it("rejects a correct-answer selection whose option has no text", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      correctOption: "2",
      option0Text: "First",
      option0Explanation: "First explanation",
      option0CitationUrls: "https://example.com/first",
      option1Text: "Second",
      option1Explanation: "Second explanation",
      option1CitationUrls: "https://example.com/second",
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.correctOption).toEqual(["Select a correct answer that has option text."]);
  });

  it("requires an explicit correct-answer selection when publishing", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      option0Text: "First",
      option0Explanation: "First explanation",
      option0CitationUrls: "https://example.com/first",
      option1Text: "Second",
      option1Explanation: "Second explanation",
      option1CitationUrls: "https://example.com/second",
    }));

    expect(result.fieldErrors.correctOption).toEqual(["Select a correct answer that has option text."]);
  });

  it("rejects invalid source and citation URLs with field-specific messages", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      sourceResourceId: "not-a-uuid",
      correctOption: "0",
      option0Text: "First",
      option0Explanation: "First explanation",
      option0CitationUrls: "javascript:alert(1)",
      option1Text: "Second",
      option1Explanation: "Second explanation",
      option1CitationUrls: "https://example.com/second",
    }));

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.sourceResourceId).toEqual(["Enter a valid source resource UUID."]);
    expect(result.fieldErrors.option0CitationUrls).toEqual([
      "Option 1 citation URL 1 must use http, https, or mailto.",
    ]);
  });

  it("allows the clear-source sentinel when editing", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Draft question",
      sourceResourceId: "__none__",
    }));

    expect(result.fieldErrors.sourceResourceId).toBeUndefined();
  });

  it("accepts a complete published question", () => {
    const result = validateQuestionForm(questionFormData({
      categoryId,
      stem: "Published question",
      status: "published",
      correctOption: "0",
      option0Text: "First",
      option0Explanation: "First explanation",
      option0CitationUrls: "https://example.com/first",
      option1Text: "Second",
      option1Explanation: "Second explanation",
      option1CitationUrls: "mailto:owner@example.com",
    }));

    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });
});
