import { describe, expect, it } from "vitest";

import {
  buildQuestionPageQuery,
  buildQuestionSortQuery,
  normalizeQuestionPage,
  paginateQuestions,
} from "../../../src/modules/certdrill/question-pagination";

describe("question pagination", () => {
  it("normalizes invalid and nonpositive requested pages to the first page", () => {
    expect(normalizeQuestionPage()).toBe(1);
    expect(normalizeQuestionPage("not-a-page")).toBe(1);
    expect(normalizeQuestionPage("0")).toBe(1);
    expect(normalizeQuestionPage("-3")).toBe(1);
  });

  it("clamps an out-of-range page to the final page", () => {
    const result = paginateQuestions(Array.from({ length: 123 }, (_, index) => `question-${index + 1}`), "99");

    expect(result.page).toBe(3);
    expect(result.pageCount).toBe(3);
    expect(result.items).toEqual(Array.from({ length: 23 }, (_, index) => `question-${index + 101}`));
  });

  it("returns a 50-item page from already sorted questions", () => {
    const sortedQuestions = Array.from({ length: 120 }, (_, index) => `question-${String(index + 1).padStart(3, "0")}`);

    const result = paginateQuestions(sortedQuestions, "2");

    expect(result.items).toHaveLength(50);
    expect(result.items[0]).toBe("question-051");
    expect(result.items.at(-1)).toBe("question-100");
  });

  it("preserves detail-page state while changing question table navigation", () => {
    const currentQuery = {
      categoryId: "category-1",
      examFormId: "form-1",
      resourceId: "resource-1",
      questionSearch: "network",
      questionStatus: "published",
      questionDifficulty: "hard",
      questionCategoryId: "category-2",
      questionSort: "stem-asc",
      questionPage: "3",
      feedbackStatus: "open",
      tab: "feedback",
    };

    expect(buildQuestionSortQuery(currentQuery, "stem-desc")).toEqual({
      ...currentQuery,
      questionSort: "stem-desc",
      questionPage: undefined,
      tab: "questions",
    });
    expect(buildQuestionPageQuery(currentQuery, 4)).toEqual({
      ...currentQuery,
      questionPage: "4",
      tab: "questions",
    });
  });
});
