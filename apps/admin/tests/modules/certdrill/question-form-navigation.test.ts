import { describe, expect, it } from "vitest";

import {
  firstQuestionFieldError,
  questionFieldId,
  questionTabForField,
} from "../../../src/modules/certdrill/question-form-navigation";

describe("question form navigation", () => {
  it("maps option explanation and citation fields to answer tabs", () => {
    expect(questionTabForField("option2Explanation")).toBe("answer-2");
    expect(questionTabForField("option0CitationUrls")).toBe("answer-0");
  });

  it("maps aggregate answer errors to the overview tab", () => {
    expect(questionTabForField("correctOption")).toBe("overview");
    expect(questionTabForField("options")).toBe("overview");
  });

  it("returns undefined for fields without a tab mapping", () => {
    expect(questionTabForField("stem")).toBeUndefined();
  });

  it("builds stable field ids for question fields", () => {
    expect(questionFieldId("question-create", "option3Text")).toBe("question-create-option-3-text");
    expect(questionFieldId("question-create", "correctOption")).toBe("question-create-correct-option-0");
    expect(questionFieldId("question-create", "options")).toBe("question-create-answers");
  });

  it("returns the first field error key when present", () => {
    expect(firstQuestionFieldError({
      options: ["Add at least two answer options."],
      option0Text: ["Add answer text for option 1."],
    })).toBe("options");
  });

  it("returns undefined when there are no field errors", () => {
    expect(firstQuestionFieldError({})).toBeUndefined();
  });
});
