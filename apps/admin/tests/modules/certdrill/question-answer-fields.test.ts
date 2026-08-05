import { describe, expect, it } from "vitest";

import {
  answerFieldName,
  parseQuestionAnswerFields,
} from "@/modules/certdrill/question-answer-fields";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

describe("question answer fields", () => {
  it("parses ordered keyed answers with correct answer and citations", () => {
    const result = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-b",
      "answer.answer-a.text": "First",
      "answer.answer-a.explanation": "First explanation",
      "answer.answer-a.citationUrls": "https://example.com/a",
      "answer.answer-b.text": "Second",
      correctAnswerKey: "answer-b",
    }));

    expect(result).toEqual({
      answerKeys: ["answer-a", "answer-b"],
      answers: [
        {
          key: "answer-a",
          text: "First",
          explanation: "First explanation",
          citationUrls: ["https://example.com/a"],
        },
        {
          key: "answer-b",
          text: "Second",
          explanation: "",
          citationUrls: [],
        },
      ],
      correctAnswerKey: "answer-b",
      fieldErrors: {},
    });
  });

  it("rejects one and eleven keys with the exact answer count error", () => {
    const tooFew = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a",
      "answer.answer-a.text": "Only",
    }));
    const tooMany = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-b,answer-c,answer-d,answer-e,answer-f,answer-g,answer-h,answer-i,answer-j,answer-k",
    }));

    expect(tooFew.fieldErrors.options).toEqual(["Add between 2 and 10 answers."]);
    expect(tooMany.fieldErrors.options).toEqual(["Add between 2 and 10 answers."]);
  });

  it("rejects duplicate and malformed keys with both exact errors", () => {
    const result = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-a,bad-key",
    }));

    expect(result.fieldErrors.options).toEqual([
      "Answer keys must be unique.",
      'Answer key "bad-key" is invalid.',
    ]);
  });

  it("rejects unknown answer fields and an unknown correct key", () => {
    const result = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-b",
      "answer.answer-a.text": "First",
      "answer.answer-c.text": "Unexpected",
      correctAnswerKey: "answer-c",
    }));

    expect(result.fieldErrors.options).toEqual([
      'Answer fields reference unknown key "answer-c".',
    ]);
    expect(result.fieldErrors.correctAnswerKey).toEqual([
      "Select a correct answer from the submitted answers.",
    ]);
  });

  it("builds answer field names for text and citation urls", () => {
    expect(answerFieldName("answer-a", "text")).toBe("answer.answer-a.text");
    expect(answerFieldName("answer-a", "citationUrls")).toBe("answer.answer-a.citationUrls");
  });

  it("rejects a missing answer keys list", () => {
    const result = parseQuestionAnswerFields(formData({}));

    expect(result.answerKeys).toEqual([]);
    expect(result.fieldErrors.options).toEqual(["Add between 2 and 10 answers."]);
  });
});
