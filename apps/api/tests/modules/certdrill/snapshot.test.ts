import { describe, expect, it } from "vitest";

import {
  buildAttemptSnapshot,
  buildCategoryBreakdown,
  buildPracticeFeedback,
  buildReview,
  scoreAttempt,
  toExamQuestionPayload,
} from "../../../src/modules/certdrill/snapshot";

const mediaAsset = {
  url: "https://docs.example.com/diagram.png",
  mimeType: "image/png" as const,
  altText: "Diagram",
  sortOrder: 0,
};

const question = {
  id: "11111111-1111-4111-8111-111111111111",
  stem: "Original stem",
  mediaAssets: [mediaAsset],
  difficulty: "medium" as const,
  category: { id: "22222222-2222-4222-8222-222222222222", code: "D1", name: "Domain 1" },
  options: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      text: "Correct",
      mediaAssets: [],
      isCorrect: true,
      explanation: "Because",
      citationUrls: ["https://docs.example.com/a"],
      sortOrder: 0,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      text: "Wrong",
      mediaAssets: [],
      isCorrect: false,
      explanation: "No",
      citationUrls: ["https://docs.example.com/b"],
      sortOrder: 1,
    },
  ],
};

const secondQuestion = {
  ...question,
  id: "55555555-5555-4555-8555-555555555555",
  stem: "Second stem",
  category: { id: "66666666-6666-4666-8666-666666666666", code: "D2", name: "Domain 2" },
  options: question.options.map((option, index) => ({
    ...option,
    id: index === 0 ? "77777777-7777-4777-8777-777777777777" : "88888888-8888-4888-8888-888888888888",
  })),
};

describe("CertDrill snapshots", () => {
  it("builds a durable attempt snapshot", () => {
    expect(buildAttemptSnapshot([question], { shuffleOptions: false })).toEqual({ version: 1, questions: [question] });
  });

  it("normalizes media assets to the contract shape before snapshot", () => {
    const snapshot = buildAttemptSnapshot([
      {
        ...question,
        mediaAssets: [
          { url: "https://docs.example.com/question.png", mime_type: "image/png", caption: "Question caption" },
        ],
        options: [
          {
            ...question.options[0],
            mediaAssets: [
              { url: "https://docs.example.com/option.jpg" },
            ],
          },
          question.options[1],
        ],
      },
    ], { shuffleOptions: false });

    expect(snapshot.questions[0]?.mediaAssets).toEqual([
      {
        url: "https://docs.example.com/question.png",
        mimeType: "image/png",
        altText: "Question image",
        caption: "Question caption",
        sortOrder: 0,
      },
    ]);
    expect(snapshot.questions[0]?.options[0]?.mediaAssets).toEqual([
      {
        url: "https://docs.example.com/option.jpg",
        mimeType: "image/jpeg",
        altText: "Answer option image",
        sortOrder: 0,
      },
    ]);
  });

  it("randomizes option order with an injectable rng and keeps snapshot payloads stable", () => {
    const snapshot = buildAttemptSnapshot([question], { rng: () => 0 });

    expect(snapshot.questions[0]?.options.map((option) => option.id)).toEqual([
      question.options[1].id,
      question.options[0].id,
    ]);
    expect(toExamQuestionPayload(snapshot)[0]?.options.map((option) => option.id)).toEqual([
      question.options[1].id,
      question.options[0].id,
    ]);
    expect(toExamQuestionPayload(snapshot)[0]?.options.map((option) => option.id)).toEqual([
      question.options[1].id,
      question.options[0].id,
    ]);
  });

  it("returns exam question payloads without correctness, explanations, or citations", () => {
    expect(toExamQuestionPayload(buildAttemptSnapshot([question], { shuffleOptions: false }))).toEqual([
      {
        id: question.id,
        stem: question.stem,
        mediaAssets: question.mediaAssets,
        category: question.category,
        options: [
          { id: question.options[0].id, text: question.options[0].text, mediaAssets: [] },
          { id: question.options[1].id, text: question.options[1].text, mediaAssets: [] },
        ],
      },
    ]);
  });

  it("returns practice feedback from snapshot", () => {
    expect(buildPracticeFeedback(buildAttemptSnapshot([question], { shuffleOptions: false }), question.id, question.options[1].id)).toMatchObject({
      isCorrect: false,
      selectedOptionFeedback: { id: question.options[1].id, explanation: "No" },
      correctOption: { id: question.options[0].id, explanation: "Because" },
    });
  });

  it("errors when practice feedback references an invalid question", () => {
    expect(() => buildPracticeFeedback(buildAttemptSnapshot([question], { shuffleOptions: false }), "missing-question", question.options[0].id)).toThrow("Question is not part of this attempt");
  });

  it("errors when practice feedback references an invalid option", () => {
    expect(() => buildPracticeFeedback(buildAttemptSnapshot([question], { shuffleOptions: false }), question.id, "missing-option")).toThrow("Selected option is not part of this question");
  });

  it("scores and reviews answers from snapshot", () => {
    const snapshot = buildAttemptSnapshot([question], { shuffleOptions: false });
    const answers = [{ questionId: question.id, selectedOptionId: question.options[0].id, isCorrect: true }];

    expect(scoreAttempt(snapshot, answers)).toEqual({ correct: 1, total: 1, scorePct: 100 });
    expect(buildReview(snapshot, answers).questions[0]?.stem).toBe("Original stem");
  });

  it("derives correct answers from snapshot when persisted answer says incorrect", () => {
    const snapshot = buildAttemptSnapshot([question], { shuffleOptions: false });
    const answers = [{ questionId: question.id, selectedOptionId: question.options[0].id, isCorrect: false }];

    expect(scoreAttempt(snapshot, answers)).toEqual({ correct: 1, total: 1, scorePct: 100 });
    expect(buildCategoryBreakdown(snapshot, answers)).toEqual([
      { categoryId: question.category.id, code: "D1", name: "Domain 1", correct: 1, total: 1, scorePct: 100 },
    ]);
    expect(buildReview(snapshot, answers).questions[0]).toMatchObject({
      yourOption: { id: question.options[0].id },
      isCorrect: true,
    });
  });

  it("derives incorrect answers from snapshot when persisted answer says correct", () => {
    const snapshot = buildAttemptSnapshot([question], { shuffleOptions: false });
    const answers = [{ questionId: question.id, selectedOptionId: question.options[1].id, isCorrect: true }];

    expect(scoreAttempt(snapshot, answers)).toEqual({ correct: 0, total: 1, scorePct: 0 });
    expect(buildCategoryBreakdown(snapshot, answers)).toEqual([
      { categoryId: question.category.id, code: "D1", name: "Domain 1", correct: 0, total: 1, scorePct: 0 },
    ]);
    expect(buildReview(snapshot, answers).questions[0]).toMatchObject({
      yourOption: { id: question.options[1].id },
      isCorrect: false,
    });
  });

  it("throws when scoring or reviewing an answer with an invalid selected option", () => {
    const snapshot = buildAttemptSnapshot([question], { shuffleOptions: false });
    const answers = [{ questionId: question.id, selectedOptionId: "missing-option", isCorrect: true }];

    expect(() => scoreAttempt(snapshot, answers)).toThrow("Selected option is not part of this question");
    expect(() => buildCategoryBreakdown(snapshot, answers)).toThrow("Selected option is not part of this question");
    expect(() => buildReview(snapshot, answers)).toThrow("Selected option is not part of this question");
  });

  it("builds category breakdowns from answered and unanswered questions", () => {
    const snapshot = buildAttemptSnapshot([question, secondQuestion], { shuffleOptions: false });
    const answers = [{ questionId: question.id, selectedOptionId: question.options[1].id, isCorrect: false }];

    expect(buildCategoryBreakdown(snapshot, answers)).toEqual([
      { categoryId: question.category.id, code: "D1", name: "Domain 1", correct: 0, total: 1, scorePct: 0 },
      { categoryId: secondQuestion.category.id, code: "D2", name: "Domain 2", correct: 0, total: 1, scorePct: 0 },
    ]);
  });

  it("keeps review content stable when source question objects change", () => {
    const mutableQuestion = structuredClone(question);
    const snapshot = buildAttemptSnapshot([mutableQuestion], { shuffleOptions: false });
    mutableQuestion.stem = "Updated stem";
    mutableQuestion.options[0].explanation = "Updated explanation";

    expect(buildReview(snapshot, []).questions[0]).toMatchObject({
      stem: "Original stem",
      correctOption: { explanation: "Because" },
    });
  });

  it("marks unanswered review questions as incorrect with no selected option", () => {
    expect(buildReview(buildAttemptSnapshot([question], { shuffleOptions: false }), []).questions[0]).toMatchObject({
      yourOption: null,
      correctOption: { id: question.options[0].id },
      isCorrect: false,
    });
  });
});
