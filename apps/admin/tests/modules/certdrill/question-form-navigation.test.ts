import { describe, expect, it } from "vitest";

import {
  firstQuestionFieldError,
  questionFieldId,
  questionTabForField,
} from "../../../src/modules/certdrill/question-form-navigation";

describe("question form navigation", () => {
  it("maps keyed answer fields to answer tabs", () => {
    expect(questionTabForField("answer.answer-a.explanation")).toBe("answer:answer-a");
    expect(questionTabForField("answer.answer-z.citationUrls")).toBe("answer:answer-z");
  });

  it("maps aggregate answer errors to the overview tab", () => {
    expect(questionTabForField("correctAnswerKey")).toBe("overview");
    expect(questionTabForField("options")).toBe("overview");
  });

  it("returns undefined for fields without a tab mapping", () => {
    expect(questionTabForField("stem")).toBeUndefined();
    expect(questionTabForField("mysteryField")).toBeUndefined();
  });

  it("builds stable field ids for question fields", () => {
    expect(questionFieldId("question-create", "answer.answer-a.text")).toBe("question-create-answer-a-text");
    expect(questionFieldId("question-create", "answer.answer-a.citationUrls")).toBe("question-create-answer-a-citations");
    expect(questionFieldId("question-create", "correctAnswerKey")).toBe("question-create-correct-answer");
    expect(questionFieldId("question-create", "options")).toBe("question-create-answers");
    expect(questionFieldId("question-create", "mysteryField")).toBe("question-create-form");
  });

  it("returns the first field error key in insertion order", () => {
    const fieldErrors: Record<string, string[]> = {};
    fieldErrors["answer.answer-z.explanation"] = ["Add an explanation."];
    fieldErrors["options"] = ["Add at least two answer options."];
    fieldErrors["answer.answer-a.text"] = ["Add answer text."];

    expect(firstQuestionFieldError(fieldErrors)).toBe("answer.answer-z.explanation");
  });

  it("returns undefined when there are no field errors", () => {
    expect(firstQuestionFieldError({})).toBeUndefined();
  });
});
