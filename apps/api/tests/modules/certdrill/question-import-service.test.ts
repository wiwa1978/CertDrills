import { getTableName, type Table } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  certdrillAnswerOptions,
  certdrillQuestions,
} from "@platform/platform-db";

import {
  QUESTION_IMPORT_DOCUMENT_VERSION,
  QUESTION_IMPORT_MAX_ROWS,
} from "../../../src/modules/certdrill/question-import";
import { createQuestionImportService } from "../../../src/modules/certdrill/question-import-service";

const ids = {
  certification: "10000000-0000-4100-8100-000000000001",
  otherCertification: "10000000-0000-4100-8100-000000000002",
  category: "20000000-0000-4200-8200-000000000001",
  otherCertCategory: "20000000-0000-4200-8200-000000000002",
  otherCategoryInSameCert: "20000000-0000-4200-8200-000000000003",
  existingQuestion: "30000000-0000-4300-8300-000000000001",
  otherCertQuestion: "30000000-0000-4300-8300-000000000002",
};

type FakeCategoryRow = {
  id: string;
  certificationId: string;
  code: string;
  archivedAt: Date | string | null;
};

type FakeQuestionRow = {
  id: string;
  certificationId: string;
  categoryId: string;
  sourceResourceId: string | null;
  generationJobId: string | null;
  stem: string;
  mediaAssets: unknown[];
  difficulty: string;
  status: string;
  createdBy: string;
};

type FakeAnswerRow = {
  questionId: string;
  text: string;
  mediaAssets: unknown[];
  isCorrect: boolean;
  explanation: string;
  citationUrls: string[];
  sortOrder: number;
};

type FakeState = {
  categories: FakeCategoryRow[];
  questions: FakeQuestionRow[];
  answers: FakeAnswerRow[];
};

type FakeDbOptions = {
  failQuestionInsert?: boolean;
  failAnswerInsert?: boolean;
};

type QueryTracking = {
  categoryCalls: number;
  questionCalls: number;
  insertCalls: Array<{ table: string; rows: unknown[] }>;
};

function baseState(): FakeState {
  return {
    categories: [
      { id: ids.category, certificationId: ids.certification, code: "SEC-01", archivedAt: null },
      { id: ids.otherCertCategory, certificationId: ids.otherCertification, code: "SEC-01", archivedAt: null },
      { id: ids.otherCategoryInSameCert, certificationId: ids.certification, code: "OTHER", archivedAt: null },
    ],
    questions: [
      {
        id: ids.existingQuestion,
        certificationId: ids.certification,
        categoryId: ids.otherCategoryInSameCert,
        sourceResourceId: null,
        generationJobId: null,
        stem: "What does the control provide?",
        mediaAssets: [],
        difficulty: "medium",
        status: "published",
        createdBy: "admin",
      },
      {
        id: ids.otherCertQuestion,
        certificationId: ids.otherCertification,
        categoryId: ids.otherCertCategory,
        sourceResourceId: null,
        generationJobId: null,
        stem: "What does the control provide?",
        mediaAssets: [],
        difficulty: "medium",
        status: "draft",
        createdBy: "ai",
      },
    ],
    answers: [],
  };
}

function paramValue(where: unknown): unknown {
  const chunks = (where as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  for (const chunk of chunks) {
    if (chunk && typeof chunk === "object" && chunk.constructor?.name === "Param" && "value" in chunk) {
      return (chunk as { value: unknown }).value;
    }
  }
  return undefined;
}

function createFakeDb(state: FakeState, tracking: QueryTracking, options: FakeDbOptions = {}): any {
  return {
    query: {
      certdrillExamCategories: {
        findMany: async ({ where }: { where: unknown }) => {
          tracking.categoryCalls += 1;
          const certificationId = paramValue(where);
          return state.categories
            .filter((category) => category.certificationId === certificationId)
            .map((category) => ({ ...category }));
        },
      },
      certdrillQuestions: {
        findMany: async ({ where, columns }: { where: unknown; columns?: Record<string, boolean> }) => {
          tracking.questionCalls += 1;
          const certificationId = paramValue(where);
          const rows = state.questions.filter((question) => question.certificationId === certificationId);
          if (columns) {
            return rows.map((row) => ({ id: row.id, stem: row.stem }));
          }
          return rows.map((row) => ({ ...row }));
        },
      },
    },
    insert(table: Table) {
      const tableName = getTableName(table);
      return {
        values: async (values: Record<string, unknown> | Record<string, unknown>[]) => {
          const rows = Array.isArray(values) ? values : [values];
          tracking.insertCalls.push({ table: tableName, rows });

          if (tableName === getTableName(certdrillQuestions)) {
            if (options.failQuestionInsert) {
              throw new Error("question insert failed");
            }
            state.questions.push(...(rows as unknown as FakeQuestionRow[]).map((row) => ({ ...row })));
          } else if (tableName === getTableName(certdrillAnswerOptions)) {
            if (options.failAnswerInsert) {
              throw new Error("answer insert failed");
            }
            state.answers.push(...(rows as unknown as FakeAnswerRow[]).map((row) => ({ ...row })));
          } else {
            throw new Error(`Unexpected insert into ${tableName}`);
          }

          return rows;
        },
      };
    },
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const clone: FakeState = {
        categories: state.categories.map((category) => ({ ...category })),
        questions: state.questions.map((question) => ({ ...question })),
        answers: state.answers.map((answer) => ({ ...answer })),
      };
      const tx = createFakeDb(clone, tracking, options);
      const result = await callback(tx);
      state.categories.splice(0, state.categories.length, ...clone.categories);
      state.questions.splice(0, state.questions.length, ...clone.questions);
      state.answers.splice(0, state.answers.length, ...clone.answers);
      return result;
    },
  };
}

function createHarness(initial: FakeState, options: FakeDbOptions = {}) {
  const state: FakeState = {
    categories: initial.categories.map((category) => ({ ...category })),
    questions: initial.questions.map((question) => ({ ...question })),
    answers: initial.answers.map((answer) => ({ ...answer })),
  };
  const tracking: QueryTracking = { categoryCalls: 0, questionCalls: 0, insertCalls: [] };
  const db = createFakeDb(state, tracking, options);
  return { db, state, tracking };
}

function buildQuestion(overrides: Record<string, unknown> = {}) {
  return {
    categoryCode: "SEC-01",
    stem: "Question stem",
    difficulty: "medium",
    answers: [
      { text: "Correct answer", isCorrect: true, explanation: "", citationUrls: [] },
      { text: "Wrong answer", isCorrect: false, explanation: "", citationUrls: [] },
    ],
    ...overrides,
  };
}

function buildDocument(questions: unknown[]) {
  return { version: QUESTION_IMPORT_DOCUMENT_VERSION, questions };
}

const duplicateQuestion = buildQuestion({ stem: "What does the control provide?" });
const freshQuestion = buildQuestion({
  stem: "What is the difference between IAM roles and IAM users?",
  difficulty: "hard",
  answers: [
    { text: "Roles are assumed; users are identities.", isCorrect: true, explanation: "Roles provide temporary credentials.", citationUrls: [] },
    { text: "There is no difference.", isCorrect: false, explanation: "", citationUrls: [] },
  ],
});

function baseDocument() {
  return buildDocument([duplicateQuestion, freshQuestion]);
}

describe("CertDrill question import service", () => {
  it("previews using only the selected certification's categories and existing questions", async () => {
    const { db, tracking } = createHarness(baseState());
    const service = createQuestionImportService({ db });

    const preview = await service.preview({ certificationId: ids.certification, document: baseDocument() });

    expect(tracking.categoryCalls).toBe(1);
    expect(tracking.questionCalls).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      categoryId: ids.category,
      valid: true,
      duplicate: { existingQuestionIds: [ids.existingQuestion], earlierSourceIndexes: [] },
      selectedByDefault: false,
    });
    expect(preview.rows[1]).toMatchObject({
      categoryId: ids.category,
      valid: true,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: true,
    });
  });

  it("converts document schema errors into an invalid-import service error", async () => {
    const { db } = createHarness(baseState());
    const service = createQuestionImportService({ db });

    await expect(service.preview({
      certificationId: ids.certification,
      document: { version: 2, questions: [] },
    })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
      details: expect.arrayContaining([expect.objectContaining({ field: "version" })]),
    });
  });

  it("imports only the selected row with server-generated ids, forced draft/ai values, and one bulk insert per table", async () => {
    const { db, state, tracking } = createHarness(baseState());
    const generatedId = "40000000-0000-4400-8400-000000000001";
    const generateId = vi.fn().mockReturnValue(generatedId);
    const service = createQuestionImportService({ db, generateId });
    const document = baseDocument();

    const preview = await service.preview({ certificationId: ids.certification, document });
    const result = await service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [1],
      duplicateOverrideSourceIndexes: [],
    });

    expect(result).toEqual({ importedCount: 1, questionIds: [generatedId] });
    expect(state.questions).toHaveLength(3);

    const inserted = state.questions.find((question) => question.id === generatedId);
    expect(inserted).toMatchObject({
      certificationId: ids.certification,
      categoryId: ids.category,
      sourceResourceId: null,
      generationJobId: null,
      mediaAssets: [],
      status: "draft",
      createdBy: "ai",
      difficulty: "hard",
      stem: freshQuestion.stem,
    });

    const insertedAnswers = state.answers.filter((answer) => answer.questionId === generatedId);
    expect(insertedAnswers.map((answer) => answer.sortOrder)).toEqual([0, 1]);
    expect(insertedAnswers.every((answer) => Array.isArray(answer.mediaAssets) && answer.mediaAssets.length === 0)).toBe(true);

    const questionInserts = tracking.insertCalls.filter((call) => call.table === "certdrill_questions");
    const answerInserts = tracking.insertCalls.filter((call) => call.table === "certdrill_answer_options");
    expect(questionInserts).toHaveLength(1);
    expect(answerInserts).toHaveLength(1);
    expect(questionInserts[0].rows).toHaveLength(1);
    expect(answerInserts[0].rows).toHaveLength(2);
  });

  it("rejects a duplicate selected row without an explicit override", async () => {
    const { db, state } = createHarness(baseState());
    const service = createQuestionImportService({ db });
    const document = baseDocument();
    const preview = await service.preview({ certificationId: ids.certification, document });

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [0],
      duplicateOverrideSourceIndexes: [],
    })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
      details: expect.objectContaining({ rows: expect.any(Array) }),
    });
    expect(state.questions).toHaveLength(2);
  });

  it("imports a duplicate row when explicitly overridden", async () => {
    const { db, state } = createHarness(baseState());
    const service = createQuestionImportService({ db });
    const document = baseDocument();
    const preview = await service.preview({ certificationId: ids.certification, document });

    const result = await service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [0],
      duplicateOverrideSourceIndexes: [0],
    });

    expect(result.importedCount).toBe(1);
    expect(state.questions).toHaveLength(3);
  });

  it("rejects a selected row that is not valid", async () => {
    const { db, state } = createHarness(baseState());
    const service = createQuestionImportService({ db });
    const document = buildDocument([
      duplicateQuestion,
      freshQuestion,
      buildQuestion({ categoryCode: "UNKNOWN", stem: "Broken row" }),
    ]);
    const preview = await service.preview({ certificationId: ids.certification, document });
    expect(preview.rows[2].valid).toBe(false);

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [2],
      duplicateOverrideSourceIndexes: [],
    })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT" });
    expect(state.questions).toHaveLength(2);
  });

  it.each([
    {
      name: "a hash mismatch",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [1],
        duplicateOverrideSourceIndexes: [],
        previewDocumentHash: "f".repeat(64),
      }),
    },
    {
      name: "an empty selection",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [],
        duplicateOverrideSourceIndexes: [],
        previewDocumentHash: preview.documentHash,
      }),
    },
    {
      name: "duplicate selected indexes",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [1, 1],
        duplicateOverrideSourceIndexes: [],
        previewDocumentHash: preview.documentHash,
      }),
    },
    {
      name: "duplicate override indexes",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [0],
        duplicateOverrideSourceIndexes: [0, 0],
        previewDocumentHash: preview.documentHash,
      }),
    },
    {
      name: "a non-integer selected index",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [1.5],
        duplicateOverrideSourceIndexes: [],
        previewDocumentHash: preview.documentHash,
      }),
    },
    {
      name: "a negative selected index",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [-1],
        duplicateOverrideSourceIndexes: [],
        previewDocumentHash: preview.documentHash,
      }),
    },
    {
      name: "an unknown selected index",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [99],
        duplicateOverrideSourceIndexes: [],
        previewDocumentHash: preview.documentHash,
      }),
    },
    {
      name: "an override that was not selected",
      build: (preview: { documentHash: string }) => ({
        selectedSourceIndexes: [1],
        duplicateOverrideSourceIndexes: [0],
        previewDocumentHash: preview.documentHash,
      }),
    },
  ])("returns a conflict for $name", async ({ build }) => {
    const { db, state } = createHarness(baseState());
    const service = createQuestionImportService({ db });
    const document = baseDocument();
    const preview = await service.preview({ certificationId: ids.certification, document });
    const input = build(preview);

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      ...input,
    })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT" });
    expect(state.questions).toHaveLength(2);
  });

  it("rejects selections exceeding the 500-row cap", async () => {
    const { db, state } = createHarness(baseState());
    const service = createQuestionImportService({ db });
    const rows = Array.from({ length: QUESTION_IMPORT_MAX_ROWS }, (_, index) => buildQuestion({ stem: `Cap question ${index}` }));
    const document = buildDocument(rows);
    const preview = await service.preview({ certificationId: ids.certification, document });
    const selectedSourceIndexes = Array.from({ length: QUESTION_IMPORT_MAX_ROWS + 1 }, (_, index) => index % QUESTION_IMPORT_MAX_ROWS);

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes,
      duplicateOverrideSourceIndexes: [],
    })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT" });
    expect(state.questions).toHaveLength(2);
  });

  it("revalidates against database changes made after preview", async () => {
    const { db, state } = createHarness(baseState());
    const service = createQuestionImportService({ db });
    const document = baseDocument();
    const preview = await service.preview({ certificationId: ids.certification, document });

    state.questions.push({
      id: "50000000-0000-4500-8500-000000000001",
      certificationId: ids.certification,
      categoryId: ids.category,
      sourceResourceId: null,
      generationJobId: null,
      stem: freshQuestion.stem,
      mediaAssets: [],
      difficulty: "hard",
      status: "published",
      createdBy: "admin",
    });

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [1],
      duplicateOverrideSourceIndexes: [],
    })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT" });
    expect(state.questions).toHaveLength(3);
    expect(state.answers).toEqual([]);
  });

  it("rolls back everything when the question insert fails", async () => {
    const { db, state } = createHarness(baseState(), { failQuestionInsert: true });
    const service = createQuestionImportService({ db });
    const document = baseDocument();
    const preview = await service.preview({ certificationId: ids.certification, document });

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [1],
      duplicateOverrideSourceIndexes: [],
    })).rejects.toThrow("question insert failed");

    expect(state.questions).toHaveLength(2);
    expect(state.answers).toEqual([]);
  });

  it("rolls back everything when the answer insert fails", async () => {
    const { db, state } = createHarness(baseState(), { failAnswerInsert: true });
    const service = createQuestionImportService({ db });
    const document = baseDocument();
    const preview = await service.preview({ certificationId: ids.certification, document });

    await expect(service.confirm({
      certificationId: ids.certification,
      document,
      previewDocumentHash: preview.documentHash,
      selectedSourceIndexes: [1],
      duplicateOverrideSourceIndexes: [],
    })).rejects.toThrow("answer insert failed");

    expect(state.questions).toHaveLength(2);
    expect(state.answers).toEqual([]);
  });
});
