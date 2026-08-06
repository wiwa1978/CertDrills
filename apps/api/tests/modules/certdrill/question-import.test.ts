import { describe, expect, it } from "vitest";

import {
  QUESTION_IMPORT_DOCUMENT_VERSION,
  QUESTION_IMPORT_MAX_ANSWERS,
  QUESTION_IMPORT_MAX_DOCUMENT_BYTES,
  QUESTION_IMPORT_MAX_DOCUMENT_ERRORS,
  QUESTION_IMPORT_MAX_ROW_ERRORS,
  QUESTION_IMPORT_MAX_ROWS,
  QUESTION_IMPORT_MIN_ANSWERS,
  QUESTION_IMPORT_TRUNCATED_ERRORS_MESSAGE,
  QuestionImportDocumentError,
  analyzeQuestionImport,
  hashQuestionImportDocument,
  normalizeImportedStem,
  type QuestionImportCategoryReference,
  type QuestionImportExistingQuestionReference,
} from "../../../src/modules/certdrill/question-import";

function createAnswer(overrides: Partial<{
  text: string;
  isCorrect: boolean;
  explanation: string;
  citationUrls: string[];
}> = {}) {
  return {
    text: "Use Route 53.",
    isCorrect: false,
    explanation: "Route 53 is AWS DNS.",
    citationUrls: ["https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html"],
    ...overrides,
  };
}

function createQuestion(overrides: Partial<{
  categoryCode: string;
  stem: string;
  difficulty: "easy" | "medium" | "hard";
  answers: unknown[];
}> = {}) {
  return {
    categoryCode: "Networking",
    stem: "  What is DNS?  ",
    difficulty: "hard" as const,
    answers: [
      createAnswer({ text: "Use Route 53.", isCorrect: true }),
      createAnswer({ text: "Use S3.", explanation: "S3 is object storage." }),
    ],
    ...overrides,
  };
}

function createDocument(questions: unknown[]) {
  return {
    version: QUESTION_IMPORT_DOCUMENT_VERSION,
    questions,
  };
}

function createCategories(overrides: QuestionImportCategoryReference[] = []): QuestionImportCategoryReference[] {
  return [
    { id: "cat-networking", code: "NETWORKING", archivedAt: null },
    { id: "cat-security", code: "Security", archivedAt: null },
    ...overrides,
  ];
}

function analyze(
  document: unknown,
  categories: QuestionImportCategoryReference[] = createCategories(),
  existingQuestions: QuestionImportExistingQuestionReference[] = [],
) {
  return analyzeQuestionImport({ document, categories, existingQuestions });
}

function expectDocumentError(document: unknown) {
  try {
    analyze(document);
    throw new Error("Expected QuestionImportDocumentError");
  } catch (error) {
    expect(error).toBeInstanceOf(QuestionImportDocumentError);
    return error as QuestionImportDocumentError;
  }
}

function fieldMessages(errors: Array<{ field: string; message: string }>) {
  return errors.map((error) => `${error.field}: ${error.message}`);
}

describe("CertDrill question import analysis", () => {
  it("exports the exact document contract limits", () => {
    expect(QUESTION_IMPORT_DOCUMENT_VERSION).toBe(1);
    expect(QUESTION_IMPORT_MAX_ROWS).toBe(500);
    expect(QUESTION_IMPORT_MAX_DOCUMENT_BYTES).toBe(5 * 1024 * 1024);
  });

  it("analyzes canonical valid input into preview rows and normalized rows", () => {
    const result = analyze(createDocument([
      createQuestion(),
    ]));

    expect(result.preview).toEqual({
      documentVersion: 1,
      documentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      totals: {
        submitted: 1,
        valid: 1,
        invalid: 0,
        duplicateExisting: 0,
        duplicateBatch: 0,
        selectedByDefault: 1,
      },
      rows: [
        {
          sourceIndex: 0,
          categoryCode: "Networking",
          categoryId: "cat-networking",
          stem: "What is DNS?",
          difficulty: "hard",
          answerCount: 2,
          valid: true,
          duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
          selectedByDefault: true,
          errors: [],
        },
      ],
    });

    expect(result.normalizedRows.get(0)).toEqual({
      sourceIndex: 0,
      categoryId: "cat-networking",
      categoryCode: "Networking",
      stem: "What is DNS?",
      normalizedStem: "what is dns?",
      difficulty: "hard",
      answers: [
        {
          text: "Use Route 53.",
          isCorrect: true,
          explanation: "Route 53 is AWS DNS.",
          citationUrls: ["https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html"],
        },
        {
          text: "Use S3.",
          isCorrect: false,
          explanation: "S3 is object storage.",
          citationUrls: ["https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html"],
        },
      ],
    });
  });

  it("throws top-level document errors for extra keys, invalid versions, and invalid row counts", () => {
    expect(fieldMessages(expectDocumentError({
      version: 1,
      questions: [],
      extra: true,
    }).issues)).toEqual([
      "questions: Must include at least 1 question.",
      "extra: Unknown field.",
    ]);

    expect(fieldMessages(expectDocumentError({
      version: 2,
      questions: [createQuestion()],
    }).issues)).toEqual([
      "version: Document version must be 1.",
    ]);

    expect(fieldMessages(expectDocumentError(createDocument([])).issues)).toEqual([
      "questions: Must include at least 1 question.",
    ]);

    expect(() => analyze(createDocument(Array.from({ length: 500 }, () => createQuestion())))).not.toThrow();

    expect(fieldMessages(expectDocumentError(
      createDocument(Array.from({ length: 501 }, () => createQuestion())),
    ).issues)).toEqual([
      "questions: Must include at most 500 questions.",
    ]);
  });

  it("defaults difficulty, explanation, and citationUrls when they are omitted", () => {
    const result = analyze(createDocument([
      createQuestion({
        difficulty: undefined,
        answers: [
          { text: " Use Route 53. ", isCorrect: true },
          { text: " Use S3. ", isCorrect: false, explanation: "  " },
        ],
      }),
    ]));

    expect(result.preview.rows[0]).toMatchObject({
      difficulty: "medium",
      valid: true,
      selectedByDefault: true,
      errors: [],
    });
    expect(result.normalizedRows.get(0)).toEqual({
      sourceIndex: 0,
      categoryId: "cat-networking",
      categoryCode: "Networking",
      stem: "What is DNS?",
      normalizedStem: "what is dns?",
      difficulty: "medium",
      answers: [
        {
          text: "Use Route 53.",
          isCorrect: true,
          explanation: "",
          citationUrls: [],
        },
        {
          text: "Use S3.",
          isCorrect: false,
          explanation: "",
          citationUrls: [],
        },
      ],
    });
  });

  it("accepts question rows with two or ten answers and rejects one or eleven", () => {
    const accepted = analyze(createDocument([
      createQuestion({ answers: Array.from({ length: 2 }, (_, index) => createAnswer({ text: `A${index}`, isCorrect: index === 0 })) }),
      createQuestion({ answers: Array.from({ length: 10 }, (_, index) => createAnswer({ text: `B${index}`, isCorrect: index === 0 })) }),
    ]));
    expect(accepted.preview.rows.map((row) => row.valid)).toEqual([true, true]);

    const rejected = analyze(createDocument([
      createQuestion({ answers: [createAnswer({ isCorrect: true })] }),
      createQuestion({ answers: Array.from({ length: 11 }, (_, index) => createAnswer({ text: `C${index}`, isCorrect: index === 0 })) }),
    ]));
    expect(fieldMessages(rejected.preview.rows[0].errors)).toEqual([
      "answers: Must include at least 2 answers.",
    ]);
    expect(fieldMessages(rejected.preview.rows[1].errors)).toEqual([
      "answers: Must include at most 10 answers.",
    ]);
  });

  it("requires exactly one correct answer", () => {
    const result = analyze(createDocument([
      createQuestion({
        answers: [
          createAnswer({ isCorrect: false }),
          createAnswer({ text: "Wrong 2", isCorrect: false }),
        ],
      }),
      createQuestion({
        stem: "Another question?",
        answers: [
          createAnswer({ isCorrect: true }),
          createAnswer({ text: "Wrong 2", isCorrect: true }),
        ],
      }),
    ]));

    expect(fieldMessages(result.preview.rows[0].errors)).toEqual([
      "answers: Exactly one answer must be correct.",
    ]);
    expect(fieldMessages(result.preview.rows[1].errors)).toEqual([
      "answers: Exactly one answer must be correct.",
    ]);
  });

  it("rejects unsafe citation protocols", () => {
    const result = analyze(createDocument([
      createQuestion({
        answers: [
          createAnswer({ isCorrect: true, citationUrls: ["javascript:alert(1)"] }),
          createAnswer({ text: "Safe wrong", citationUrls: ["data:text/plain,hello"] }),
        ],
      }),
    ]));

    expect(fieldMessages(result.preview.rows[0].errors)).toEqual([
      "answers.0.citationUrls.0: Citation URLs must use http, https, or mailto.",
      "answers.1.citationUrls.0: Citation URLs must use http, https, or mailto.",
    ]);
  });

  it("expands unknown question and answer keys to exact field paths", () => {
    const result = analyze(createDocument([
      {
        ...createQuestion(),
        id: "import-controlled-question-id",
        answers: [
          {
            ...createAnswer({ isCorrect: true }),
            sortOrder: 0,
          },
          createAnswer({ text: "Wrong" }),
        ],
      },
    ]));

    expect(fieldMessages(result.preview.rows[0].errors)).toEqual([
      "answers.0.sortOrder: Unknown field.",
      "id: Unknown field.",
    ]);
  });

  it("normalizes stems and hashes recursively key-sorted JSON", () => {
    expect(normalizeImportedStem("  Hello,\n**WORLD**?  ")).toBe("hello, **world**?");

    const documentA = JSON.parse(`{
      "version": 1,
      "questions": [
        {
          "categoryCode": "Networking",
          "stem": "What is DNS?",
          "difficulty": "medium",
          "answers": [
            { "text": "Use Route 53.", "isCorrect": true, "citationUrls": ["https://docs.example.com/a"] },
            { "text": "Use S3.", "isCorrect": false, "citationUrls": ["https://docs.example.com/b"] }
          ]
        }
      ]
    }`);
    const documentB = {
      questions: [
        {
          answers: [
            { citationUrls: ["https://docs.example.com/a"], isCorrect: true, text: "Use Route 53." },
            { text: "Use S3.", citationUrls: ["https://docs.example.com/b"], isCorrect: false },
          ],
          stem: "What is DNS?",
          categoryCode: "Networking",
          difficulty: "medium",
        },
      ],
      version: 1,
    };

    expect(analyze(documentA).preview.documentHash).toBe(analyze(documentB).preview.documentHash);
  });

  it("hashes object keys with deterministic code-unit ordering", () => {
    const original = {
      _: "underscore",
      a: "lowercase",
      A: "uppercase",
      é: "accented",
      "!": "punctuation",
    };
    const reordered = {
      é: "accented",
      A: "uppercase",
      "!": "punctuation",
      a: "lowercase",
      _: "underscore",
    };

    expect(hashQuestionImportDocument(reordered)).toBe(hashQuestionImportDocument(original));
    expect(hashQuestionImportDocument(original)).toBe(
      "ec16636f2cd0e823735e3f523e381bc043f6eeb0037b15f98a53f9717ec777cc",
    );
  });

  it("resolves categories case-insensitively after trimming import codes", () => {
    const result = analyze(createDocument([
      createQuestion({ categoryCode: "  networking  " }),
    ]), [
      { id: "cat-networking", code: "Networking", archivedAt: null },
    ]);

    expect(result.preview.rows[0]).toMatchObject({
      categoryCode: "networking",
      categoryId: "cat-networking",
      valid: true,
    });
    expect(result.normalizedRows.get(0)?.categoryId).toBe("cat-networking");
  });

  it("rejects unknown, archived, and ambiguous category codes including active plus archived duplicates", () => {
    const unknown = analyze(createDocument([createQuestion({ categoryCode: "Missing" })]));
    expect(fieldMessages(unknown.preview.rows[0].errors)).toEqual([
      "categoryCode: Category code does not exist.",
    ]);

    const archived = analyze(createDocument([createQuestion({ categoryCode: "Legacy" })]), [
      { id: "cat-legacy", code: "Legacy", archivedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(fieldMessages(archived.preview.rows[0].errors)).toEqual([
      "categoryCode: Category code is archived.",
    ]);

    const ambiguous = analyze(createDocument([createQuestion({ categoryCode: "Cloud" })]), [
      { id: "cat-cloud-active", code: "Cloud", archivedAt: null },
      { id: "cat-cloud-archived", code: " cloud ", archivedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(fieldMessages(ambiguous.preview.rows[0].errors)).toEqual([
      "categoryCode: Category code is ambiguous.",
    ]);
  });

  it("marks existing and batch duplicates as valid warnings and includes all earlier batch indexes", () => {
    const result = analyze(
      createDocument([
        createQuestion({ stem: "  What is DNS?  " }),
        createQuestion({ stem: "what   is dns?" }),
        createQuestion({ stem: "WHAT IS DNS?" }),
      ]),
      createCategories(),
      [
        { id: "existing-1", stem: "What is DNS?" },
        { id: "existing-2", stem: "  what is dns?  " },
      ],
    );

    expect(result.preview.totals).toEqual({
      submitted: 3,
      valid: 3,
      invalid: 0,
      duplicateExisting: 3,
      duplicateBatch: 2,
      selectedByDefault: 0,
    });
    expect(result.preview.rows.map((row) => row.duplicate)).toEqual([
      { existingQuestionIds: ["existing-1", "existing-2"], earlierSourceIndexes: [] },
      { existingQuestionIds: ["existing-1", "existing-2"], earlierSourceIndexes: [0] },
      { existingQuestionIds: ["existing-1", "existing-2"], earlierSourceIndexes: [0, 1] },
    ]);
    expect(result.preview.rows.every((row) => row.valid && !row.selectedByDefault)).toBe(true);
    expect(Array.from(result.normalizedRows.keys())).toEqual([0, 1, 2]);
  });

  it("treats markdown and punctuation as significant during duplicate detection", () => {
    const result = analyze(createDocument([
      createQuestion({ stem: "What is **DNS**?" }),
      createQuestion({ stem: "What is DNS?" }),
      createQuestion({ stem: "What is DNS" }),
    ]));

    expect(result.preview.rows.map((row) => row.selectedByDefault)).toEqual([true, true, true]);
    expect(result.preview.totals.duplicateBatch).toBe(0);
  });

  it("retains invalid rows in preview but excludes them from normalized rows and selected totals", () => {
    const result = analyze(createDocument([
      createQuestion(),
      {
        categoryCode: "Missing",
        stem: "   ",
        answers: [
          { text: "", isCorrect: true, citationUrls: ["https://docs.example.com/a"] },
        ],
      },
    ]));

    expect(result.preview.totals).toEqual({
      submitted: 2,
      valid: 1,
      invalid: 1,
      duplicateExisting: 0,
      duplicateBatch: 0,
      selectedByDefault: 1,
    });
    expect(result.preview.rows[1]).toMatchObject({
      sourceIndex: 1,
      categoryCode: "Missing",
      categoryId: undefined,
      stem: "",
      difficulty: "medium",
      answerCount: 1,
      valid: false,
      selectedByDefault: false,
    });
    expect(fieldMessages(result.preview.rows[1].errors)).toEqual([
      "answers: Must include at least 2 answers.",
      "answers.0.text: Answer text is required.",
      "categoryCode: Category code does not exist.",
      "stem: Stem is required.",
    ]);
    expect(Array.from(result.normalizedRows.keys())).toEqual([0]);
  });

  it("never lets an invalid row poison within-batch duplicate detection for later rows", () => {
    const result = analyze(createDocument([
      {
        ...createQuestion(),
        stem: "  What is DNS?  ",
        answers: [
          { text: "", isCorrect: true, citationUrls: ["https://docs.example.com/a"] },
          createAnswer({ text: "Wrong answer" }),
        ],
      },
      createQuestion({ stem: "what   is dns?" }),
      createQuestion({ categoryCode: "Unknown", stem: "What is BGP?" }),
      createQuestion({ stem: "WHAT IS BGP?" }),
    ]));

    expect(result.preview.rows[0]).toMatchObject({
      valid: false,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: false,
    });
    expect(result.preview.rows[1]).toMatchObject({
      valid: true,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: true,
    });
    expect(result.preview.rows[2]).toMatchObject({
      valid: false,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: false,
    });
    expect(result.preview.rows[3]).toMatchObject({
      valid: true,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: true,
    });
    expect(result.preview.totals).toEqual({
      submitted: 4,
      valid: 2,
      invalid: 2,
      duplicateExisting: 0,
      duplicateBatch: 0,
      selectedByDefault: 2,
    });
    expect(Array.from(result.normalizedRows.keys())).toEqual([1, 3]);
  });

  it("still flags later rows that duplicate an earlier valid row and existing questions", () => {
    const result = analyze(
      createDocument([
        {
          ...createQuestion(),
          stem: "What is DNS?",
          answers: [{ text: "Only one answer", isCorrect: true }],
        },
        createQuestion({ stem: "What is DNS?" }),
        createQuestion({ stem: "what is dns?" }),
      ]),
      createCategories(),
      [{ id: "existing-1", stem: "What is DNS?" }],
    );

    expect(result.preview.rows.map((row) => row.duplicate)).toEqual([
      { existingQuestionIds: ["existing-1"], earlierSourceIndexes: [] },
      { existingQuestionIds: ["existing-1"], earlierSourceIndexes: [] },
      { existingQuestionIds: ["existing-1"], earlierSourceIndexes: [1] },
    ]);
    expect(result.preview.rows.map((row) => row.valid)).toEqual([false, true, true]);
    expect(result.preview.totals).toEqual({
      submitted: 3,
      valid: 2,
      invalid: 1,
      duplicateExisting: 3,
      duplicateBatch: 1,
      selectedByDefault: 0,
    });
  });
});

// Adversarial inputs use arrays that are large enough to prove the bounds hold (a naive
// implementation would emit one issue per element) while staying small enough to keep CI fast.
const HOSTILE_ELEMENT_COUNT = 200_000;

function hostileAnswers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    text: index % 2 === 0 ? "" : `Answer ${index}`,
    isCorrect: false,
    unknownAnswerKey: index,
  }));
}

function hostileCitationUrls(count: number) {
  return Array.from({ length: count }, (_, index) => `not a url ${index}`);
}

function unknownKeyRecord(count: number, prefix: string) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`${prefix}${index}`, index]));
}

function truncationMarker() {
  return { field: "row", message: QUESTION_IMPORT_TRUNCATED_ERRORS_MESSAGE };
}

describe("CertDrill question import validation bounds", () => {
  it("exports the documented validation error budgets", () => {
    expect(QUESTION_IMPORT_MAX_ROW_ERRORS).toBe(25);
    expect(QUESTION_IMPORT_MAX_DOCUMENT_ERRORS).toBe(50);
    expect(QUESTION_IMPORT_MIN_ANSWERS).toBe(2);
    expect(QUESTION_IMPORT_MAX_ANSWERS).toBe(10);
  });

  it("rejects an over-long answers array on its length without validating every extra element", () => {
    const result = analyze(createDocument([
      createQuestion({ answers: hostileAnswers(HOSTILE_ELEMENT_COUNT) }),
      createQuestion({ stem: "Still importable?" }),
    ]));

    const row = result.preview.rows[0];
    expect(row.valid).toBe(false);
    expect(row.selectedByDefault).toBe(false);
    // The submitted answer count is still reported even though only the first 10 were validated.
    expect(row.answerCount).toBe(HOSTILE_ELEMENT_COUNT);
    expect(row.errors).toContainEqual({ field: "answers", message: "Must include at most 10 answers." });
    expect(row.errors.length).toBeLessThanOrEqual(QUESTION_IMPORT_MAX_ROW_ERRORS + 1);
    // Only the first 10 answers can contribute element errors, so no index above 9 appears.
    expect(row.errors.every((error) => !/^answers\.(?:[1-9]\d+|\d{3,})\./.test(error.field))).toBe(true);

    const laterRow = result.preview.rows[1];
    expect(laterRow.valid).toBe(true);
    expect(laterRow.selectedByDefault).toBe(true);
    expect(Array.from(result.normalizedRows.keys())).toEqual([1]);
  });

  it("caps row errors and appends a deterministic truncation marker", () => {
    const result = analyze(createDocument([
      createQuestion({
        answers: [
          { text: "Correct", isCorrect: true, citationUrls: hostileCitationUrls(HOSTILE_ELEMENT_COUNT) },
          createAnswer({ text: "Wrong" }),
        ],
      }),
    ]));

    const errors = result.preview.rows[0].errors;
    expect(result.preview.rows[0].valid).toBe(false);
    expect(errors).toHaveLength(QUESTION_IMPORT_MAX_ROW_ERRORS + 1);
    expect(errors.at(-1)).toEqual(truncationMarker());
    expect(errors.slice(0, QUESTION_IMPORT_MAX_ROW_ERRORS).every((error) => error.field.startsWith("answers.0.citationUrls."))).toBe(true);
    expect(errors.filter((error) => error.message === QUESTION_IMPORT_TRUNCATED_ERRORS_MESSAGE)).toHaveLength(1);
  });

  it("bounds unknown-key expansion for a row carrying thousands of unknown fields", () => {
    const result = analyze(createDocument([
      { ...createQuestion(), ...unknownKeyRecord(HOSTILE_ELEMENT_COUNT, "unknownKey") },
    ]));

    const errors = result.preview.rows[0].errors;
    expect(result.preview.rows[0].valid).toBe(false);
    expect(errors).toHaveLength(QUESTION_IMPORT_MAX_ROW_ERRORS + 1);
    expect(errors.at(-1)).toEqual(truncationMarker());
    expect(errors[0].message).toBe("Unknown field.");
  });

  it("keeps every row bounded and the preview small for a full document of hostile rows", () => {
    const result = analyze(createDocument(Array.from({ length: QUESTION_IMPORT_MAX_ROWS - 1 }, (_, index) => ({
      ...createQuestion({ stem: `Hostile row ${index}` }),
      ...unknownKeyRecord(200, "unknownKey"),
      answers: [
        { text: "Correct", isCorrect: true, citationUrls: hostileCitationUrls(2_000) },
        { text: "Wrong", isCorrect: false, citationUrls: hostileCitationUrls(2_000) },
      ],
    })).concat([createQuestion({ stem: "Final valid row" })] as never[])));

    const totalErrors = result.preview.rows.reduce((sum, row) => sum + row.errors.length, 0);
    expect(totalErrors).toBeLessThanOrEqual(QUESTION_IMPORT_MAX_ROWS * (QUESTION_IMPORT_MAX_ROW_ERRORS + 1));
    expect(result.preview.rows.every((row) => row.errors.length <= QUESTION_IMPORT_MAX_ROW_ERRORS + 1)).toBe(true);
    // A single hostile document must never serialize into a multi-megabyte preview response.
    expect(JSON.stringify(result.preview).length).toBeLessThan(2 * 1024 * 1024);

    const finalRow = result.preview.rows.at(-1);
    expect(finalRow).toMatchObject({ valid: true, selectedByDefault: true });
    expect(result.preview.totals).toMatchObject({
      submitted: QUESTION_IMPORT_MAX_ROWS,
      valid: 1,
      invalid: QUESTION_IMPORT_MAX_ROWS - 1,
      selectedByDefault: 1,
    });
    expect(Array.from(result.normalizedRows.keys())).toEqual([QUESTION_IMPORT_MAX_ROWS - 1]);
  });

  it("bounds document-level issue details including expanded unknown keys", () => {
    const issues = expectDocumentError({
      version: 1,
      questions: [createQuestion()],
      ...unknownKeyRecord(HOSTILE_ELEMENT_COUNT, "unknownDocumentKey"),
    }).issues;

    expect(issues).toHaveLength(QUESTION_IMPORT_MAX_DOCUMENT_ERRORS + 1);
    expect(issues.at(-1)).toEqual({ field: "document", message: QUESTION_IMPORT_TRUNCATED_ERRORS_MESSAGE });
    expect(issues.slice(0, QUESTION_IMPORT_MAX_DOCUMENT_ERRORS).every((issue) => issue.message === "Unknown field.")).toBe(true);
  });

  it("rejects a hugely over-long questions array without validating every row", () => {
    const issues = expectDocumentError({
      version: 1,
      questions: Array.from({ length: HOSTILE_ELEMENT_COUNT }, () => ({ garbage: true })),
    }).issues;

    expect(fieldMessages(issues)).toEqual([
      "questions: Must include at most 500 questions.",
    ]);
  });

  it("rejects malformed citation arrays and non-string citation entries without exploding", () => {
    const result = analyze(createDocument([
      createQuestion({
        answers: [
          { text: "Correct", isCorrect: true, citationUrls: "https://docs.example.com/a" },
          { text: "Wrong", isCorrect: false, citationUrls: [1, 2, 3] },
        ],
      }),
    ]));

    expect(fieldMessages(result.preview.rows[0].errors)).toEqual([
      "answers.0.citationUrls: Citation URLs must be provided as an array.",
      "answers.1.citationUrls.0: Citation URLs must be strings.",
      "answers.1.citationUrls.1: Citation URLs must be strings.",
      "answers.1.citationUrls.2: Citation URLs must be strings.",
    ]);
    expect(result.preview.rows[0].valid).toBe(false);
  });

  it("hashes and rejects a deeply nested row without overflowing the stack", () => {
    const deeplyNestedRow: unknown[] = [];
    let cursor = deeplyNestedRow;
    for (let depth = 0; depth < 100_000; depth += 1) {
      const nested: unknown[] = [];
      (cursor as unknown[]).push(nested);
      cursor = nested;
    }

    const result = analyze(createDocument([deeplyNestedRow, createQuestion({ stem: "Still importable?" })]));

    expect(result.preview.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.preview.rows[0]).toMatchObject({ valid: false, selectedByDefault: false });
    expect(result.preview.rows[0].errors.length).toBeLessThanOrEqual(QUESTION_IMPORT_MAX_ROW_ERRORS + 1);
    expect(result.preview.rows[1]).toMatchObject({ valid: true, selectedByDefault: true });
  });

  it("still accepts a valid row carrying many optional citation URLs", () => {
    const citationUrls = Array.from({ length: 5_000 }, (_, index) => `https://docs.example.com/${index}`);
    const result = analyze(createDocument([
      createQuestion({
        answers: [
          { text: "Correct", isCorrect: true, citationUrls },
          { text: "Wrong", isCorrect: false },
        ],
      }),
    ]));

    expect(result.preview.rows[0]).toMatchObject({ valid: true, selectedByDefault: true, errors: [] });
    expect(result.normalizedRows.get(0)?.answers[0].citationUrls).toHaveLength(5_000);
    expect(result.normalizedRows.get(0)?.answers[1].citationUrls).toEqual([]);
  });
});
