import { describe, expect, it } from "vitest";

import {
  ADMIN_QUESTION_INDEX_PAGE_SIZE,
  createCertDrillAdminQuestionIndex,
  escapeAdminQuestionIndexLikePattern,
  normalizeAdminQuestionIndexQuery,
  type AdminQuestionIndexAnswerOptionRecord,
  type AdminQuestionIndexCategoryFilterOption,
  type AdminQuestionIndexCertificationFilterOption,
  type AdminQuestionIndexQuestionRecord,
  type AdminQuestionIndexRepository,
} from "../../../src/product/certdrill/admin-question-index";

const ids = {
  certA: "11111111-1111-4111-8111-111111111111",
  certB: "22222222-2222-4222-8222-222222222222",
  catA: "33333333-3333-4333-8333-333333333333",
  catB: "44444444-4444-4444-8444-444444444444",
  questionA: "55555555-5555-4555-8555-555555555555",
  questionB: "66666666-6666-4666-8666-666666666666",
  optionA1: "77777777-7777-4777-8777-777777777777",
  optionA2: "88888888-8888-4888-8888-888888888888",
  optionB1: "99999999-9999-4999-8999-999999999999",
  optionB2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

describe("admin question index", () => {
  it("escapes percent signs in free-text search patterns", () => {
    expect(escapeAdminQuestionIndexLikePattern("50%")).toBe("%50\\%%");
  });

  it("escapes underscores in free-text search patterns", () => {
    expect(escapeAdminQuestionIndexLikePattern("test_case")).toBe("%test\\_case%");
  });

  it("escapes backslashes in free-text search patterns", () => {
    expect(escapeAdminQuestionIndexLikePattern("path\\segment")).toBe("%path\\\\segment%");
  });

  it("normalizes invalid and trimmed query values", () => {
    expect(normalizeAdminQuestionIndexQuery({
      search: "  zero trust  ",
      certificationId: "invalid",
      categoryId: "also-invalid",
      status: "review",
      difficulty: "expert",
      sort: "newest",
      page: "0",
    })).toEqual({
      search: "zero trust",
      certificationId: undefined,
      categoryId: undefined,
      status: undefined,
      difficulty: undefined,
      sort: "stem-asc",
      page: 1,
    });
  });

  it("propagates all supported normalized filters to the repository", async () => {
    const repository = createRepositoryStub({
      questions: [questionRecord()],
      answerOptions: [answerOptionRecord()],
    });
    const index = createCertDrillAdminQuestionIndex({ repository });

    await index.query({
      search: "  dns  ",
      certificationId: ids.certA,
      categoryId: ids.catA,
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: "3",
    });

    expect(repository.calls.countQuestions).toEqual([{
      search: "dns",
      certificationId: ids.certA,
      categoryId: ids.catA,
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: 3,
    }]);
    expect(repository.calls.listQuestions).toEqual([{
      search: "dns",
      certificationId: ids.certA,
      categoryId: ids.catA,
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: 3,
    }]);
  });

  it("ignores an incompatible category filter for the selected certification", async () => {
    const repository = createRepositoryStub({
      categories: [
        categoryFilterOption({ id: ids.catA, certificationId: ids.certA }),
        categoryFilterOption({ id: ids.catB, certificationId: ids.certB }),
      ],
      questions: [questionRecord()],
      answerOptions: [answerOptionRecord()],
    });
    const index = createCertDrillAdminQuestionIndex({ repository });

    const result = await index.query({
      certificationId: ids.certA,
      categoryId: ids.catB,
    });

    expect(repository.calls.countQuestions[0]?.categoryId).toBeUndefined();
    expect(repository.calls.listQuestions[0]?.categoryId).toBeUndefined();
    expect(result.query.categoryId).toBeUndefined();
  });

  it("returns 50-item pagination metadata", async () => {
    const repository = createRepositoryStub({
      total: 51,
      questions: [questionRecord()],
      answerOptions: [answerOptionRecord()],
    });
    const index = createCertDrillAdminQuestionIndex({ repository });

    const result = await index.query({ page: 2 });

    expect(ADMIN_QUESTION_INDEX_PAGE_SIZE).toBe(50);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 50,
      pageCount: 2,
      totalItems: 51,
    });
  });

  it("retries the final page and clamps pagination when the requested page is out of range", async () => {
    const repository = createRepositoryStub({
      total: 51,
      questionsByPage: new Map([
        [2, [questionRecord()]],
        [3, []],
      ]),
      answerOptions: [answerOptionRecord()],
    });
    const index = createCertDrillAdminQuestionIndex({ repository });

    const result = await index.query({ page: 3 });

    expect(repository.calls.listQuestions.map((query) => query.page)).toEqual([3, 2]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 50,
      pageCount: 2,
      totalItems: 51,
    });
    expect(result.items).toHaveLength(1);
  });

  it("groups answer options per question in stable order", async () => {
    const repository = createRepositoryStub({
      questions: [
        questionRecord({ questionId: ids.questionB, stem: "B stem" }),
        questionRecord({ questionId: ids.questionA, stem: "A stem" }),
      ],
      answerOptions: [
        answerOptionRecord({ id: ids.optionA1, questionId: ids.questionA, text: "A-1", sortOrder: 2 }),
        answerOptionRecord({ id: ids.optionA2, questionId: ids.questionA, text: "A-2", sortOrder: 3 }),
        answerOptionRecord({ id: ids.optionB1, questionId: ids.questionB, text: "B-1", sortOrder: 0 }),
        answerOptionRecord({ id: ids.optionB2, questionId: ids.questionB, text: "B-2", sortOrder: 1 }),
      ],
    });
    const index = createCertDrillAdminQuestionIndex({ repository });

    const result = await index.query();

    expect(result.items.map((item) => item.questionId)).toEqual([ids.questionB, ids.questionA]);
    expect(result.items[0]?.answerOptions.map((option) => option.id)).toEqual([ids.optionB1, ids.optionB2]);
    expect(result.items[1]?.answerOptions.map((option) => option.id)).toEqual([ids.optionA1, ids.optionA2]);
  });

  it("returns empty results with a minimum page count of one", async () => {
    const repository = createRepositoryStub({
      total: 0,
      questions: [],
      answerOptions: [],
    });
    const index = createCertDrillAdminQuestionIndex({ repository });

    const result = await index.query({ search: "  ", page: 9 });

    expect(result.items).toEqual([]);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 50,
      pageCount: 1,
      totalItems: 0,
    });
    expect(result.query).toEqual({
      search: undefined,
      certificationId: undefined,
      categoryId: undefined,
      status: undefined,
      difficulty: undefined,
      sort: "stem-asc",
      page: 1,
    });
    expect(repository.calls.listQuestionAnswerOptions).toEqual([]);
  });
});

function createRepositoryStub(input?: {
  total?: number;
  certifications?: AdminQuestionIndexCertificationFilterOption[];
  categories?: AdminQuestionIndexCategoryFilterOption[];
  questions?: AdminQuestionIndexQuestionRecord[];
  questionsByPage?: Map<number, AdminQuestionIndexQuestionRecord[]>;
  answerOptions?: AdminQuestionIndexAnswerOptionRecord[];
}): AdminQuestionIndexRepository & {
  calls: {
    countQuestions: Array<Parameters<AdminQuestionIndexRepository["countQuestions"]>[0]>;
    listQuestions: Array<Parameters<AdminQuestionIndexRepository["listQuestions"]>[0]>;
    listQuestionAnswerOptions: Array<string[]>;
  };
} {
  const calls = {
    countQuestions: [] as Array<Parameters<AdminQuestionIndexRepository["countQuestions"]>[0]>,
    listQuestions: [] as Array<Parameters<AdminQuestionIndexRepository["listQuestions"]>[0]>,
    listQuestionAnswerOptions: [] as string[][],
  };

  return {
    calls,
    async listFilterOptions() {
      return {
        certifications: input?.certifications ?? [certificationFilterOption()],
        categories: input?.categories ?? [categoryFilterOption()],
      };
    },
    async countQuestions(query) {
      calls.countQuestions.push(query);
      return input?.total ?? (input?.questions?.length ?? 0);
    },
    async listQuestions(query) {
      calls.listQuestions.push(query);
      return input?.questionsByPage?.get(query.page) ?? input?.questions ?? [];
    },
    async listQuestionAnswerOptions(questionIds) {
      calls.listQuestionAnswerOptions.push(questionIds);
      return input?.answerOptions ?? [];
    },
  };
}

function certificationFilterOption(
  overrides: Partial<AdminQuestionIndexCertificationFilterOption> = {},
): AdminQuestionIndexCertificationFilterOption {
  return {
    id: ids.certA,
    code: "AWS-SAA-C03",
    name: "AWS Solutions Architect",
    ...overrides,
  };
}

function categoryFilterOption(
  overrides: Partial<AdminQuestionIndexCategoryFilterOption> = {},
): AdminQuestionIndexCategoryFilterOption {
  return {
    id: ids.catA,
    certificationId: ids.certA,
    code: "SEC",
    name: "Security",
    ...overrides,
  };
}

function questionRecord(
  overrides: Partial<AdminQuestionIndexQuestionRecord> = {},
): AdminQuestionIndexQuestionRecord {
  return {
    questionId: ids.questionA,
    stem: "What is zero trust?",
    status: "published",
    difficulty: "medium",
    certificationId: ids.certA,
    certificationCode: "AWS-SAA-C03",
    certificationName: "AWS Solutions Architect",
    categoryId: ids.catA,
    categoryCode: "SEC",
    categoryName: "Security",
    ...overrides,
  };
}

function answerOptionRecord(
  overrides: Partial<AdminQuestionIndexAnswerOptionRecord> = {},
): AdminQuestionIndexAnswerOptionRecord {
  return {
    id: ids.optionA1,
    questionId: ids.questionA,
    text: "Use least privilege",
    isCorrect: true,
    explanation: "Limits permissions.",
    sortOrder: 0,
    ...overrides,
  };
}
