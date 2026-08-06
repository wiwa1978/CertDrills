# CertDrill Question Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a certification-scoped, server-validated JSON import workflow that previews up to 500 AI-generated questions and atomically saves selected rows as Draft.

**Architecture:** A pure API import-analysis module owns strict schemas, normalization, hashing, row validation, and duplicate detection. A focused import service loads database references and performs confirm-time revalidation plus two bulk inserts in one transaction; the admin app calls preview/confirm server actions from a client review table without persistent import-job storage.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Hono, Zod, Drizzle ORM, PostgreSQL, Vitest, Bun workspaces.

---

## File Structure

### Create

- `apps/api/src/modules/certdrill/question-import.ts`
  - Owns canonical import schemas, public result types, normalization, stable hashing, and pure preview analysis.
- `apps/api/src/modules/certdrill/question-import-service.ts`
  - Loads categories/questions, revalidates confirm requests, and atomically inserts questions and answers.
- `apps/api/tests/modules/certdrill/question-import.test.ts`
  - Covers schemas, normalization, hashing, category resolution, duplicate analysis, and preview totals.
- `apps/api/tests/modules/certdrill/question-import-service.test.ts`
  - Covers confirm selection, duplicate overrides, forced Draft/AI values, bulk insertion, conflicts, and rollback.
- `apps/admin/src/modules/certdrill/question-import-types.ts`
  - Defines serializable admin preview/confirm types shared by the API client, actions, and client UI.
- `apps/admin/src/modules/certdrill/question-import-actions.ts`
  - Parses raw JSON, applies size checks, calls preview/confirm API functions, and returns explicit action results.
- `apps/admin/src/modules/certdrill/question-import-selection.ts`
  - Owns pure default selection, row toggling, and duplicate batch-toggle behavior.
- `apps/admin/src/modules/certdrill/question-import-page.tsx`
  - Server-side import page shell and certification heading.
- `apps/admin/src/modules/certdrill/question-import-form.tsx`
  - Starts as a working upload/paste preview form, then gains the review table,
    row selection, duplicate override, conflict, and confirm UI.
- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/import/page.tsx`
  - Certification-scoped import route.
- `apps/admin/public/question-import-example.json`
  - Downloadable canonical version-1 example.
- `apps/admin/tests/modules/certdrill/question-import-actions.test.ts`
  - Covers JSON parsing, size limits, API errors, conflicts, and successful action results.
- `apps/admin/tests/modules/certdrill/question-import-selection.test.ts`
  - Covers default and duplicate selection state.
- `apps/admin/tests/modules/certdrill/question-import-page.test.ts`
  - Covers entry button, route shell, success banner, example link, and import form markup/source contracts.

### Modify

- `packages/frontend-shared/src/api-client.ts`
  - Preserves structured API error `details` on `ApiRequestError`.
- `packages/frontend-shared/tests/api-client.test.ts`
  - Proves structured details survive failed requests.
- `apps/api/src/modules/certdrill/admin-service.ts`
  - Creates and exposes the focused import service methods.
- `apps/api/src/modules/certdrill/routes.ts`
  - Adds size-limited preview/confirm endpoints and typed 409 conflict handling.
- `apps/api/tests/certdrill.admin.routes.test.ts`
  - Covers route payload limits, delegation, validation, and conflict responses.
- `apps/admin/src/lib/api/certdrill.server.ts`
  - Adds typed preview and confirm API functions.
- `apps/admin/src/modules/certdrill/admin-page.tsx`
  - Adds the Questions-card import button and imported-count success message.
- `apps/admin/src/modules/certdrill/question-editor-href.ts`
  - Adds the certification-scoped import URL helper.
- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx`
  - Passes the imported-count query value into the admin page.
- `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
  - Covers the import entry point and success message.

## Task 1: Canonical Import Contract and Pure Preview Analysis

**Files:**
- Create: `apps/api/src/modules/certdrill/question-import.ts`
- Create: `apps/api/tests/modules/certdrill/question-import.test.ts`

- [ ] **Step 1: Write failing schema and preview tests**

Create tests with these fixtures:

```ts
import { describe, expect, it } from "vitest";

import {
  MAX_QUESTION_IMPORT_BYTES,
  MAX_QUESTION_IMPORT_ROWS,
  analyzeQuestionImport,
  hashQuestionImportDocument,
  normalizeImportedStem,
  questionImportEnvelopeSchema,
} from "../../../src/modules/certdrill/question-import";

const validQuestion = {
  categoryCode: "SEC-01",
  stem: "What does the control provide?",
  difficulty: "medium",
  answers: [
    {
      text: "Protection",
      isCorrect: true,
      explanation: "It protects the resource.",
      citationUrls: ["https://example.com/protection"],
    },
    {
      text: "Billing",
      isCorrect: false,
      explanation: "",
      citationUrls: [],
    },
  ],
};

const document = {
  version: 1 as const,
  questions: [validQuestion],
};

const categories = [{
  id: "11111111-1111-4111-8111-111111111111",
  code: "SEC-01",
  archivedAt: null,
}];

describe("question import contract", () => {
  it("accepts the canonical envelope and its 500-row boundary", () => {
    expect(questionImportEnvelopeSchema.safeParse(document).success).toBe(true);
    expect(questionImportEnvelopeSchema.safeParse({
      version: 1,
      questions: Array.from({ length: 500 }, () => validQuestion),
    }).success).toBe(true);
  });

  it("rejects unsupported versions, empty batches, 501 rows, and top-level extras", () => {
    expect(questionImportEnvelopeSchema.safeParse({
      version: 2,
      questions: [validQuestion],
    }).success).toBe(false);
    expect(questionImportEnvelopeSchema.safeParse({
      version: 1,
      questions: [],
    }).success).toBe(false);
    expect(questionImportEnvelopeSchema.safeParse({
      version: 1,
      questions: Array.from({ length: 501 }, () => validQuestion),
    }).success).toBe(false);
    expect(questionImportEnvelopeSchema.safeParse({
      ...document,
      status: "published",
    }).success).toBe(false);
  });

  it("normalizes Stem duplicates by case and whitespace only", () => {
    expect(normalizeImportedStem("  What   IS\nZero Trust?  "))
      .toBe("what is zero trust?");
    expect(normalizeImportedStem("What is **Zero Trust**?"))
      .not.toBe(normalizeImportedStem("What is Zero Trust?"));
  });

  it("produces a stable hash independent of object key order", () => {
    const reordered = {
      questions: document.questions,
      version: document.version,
    };
    expect(hashQuestionImportDocument(reordered))
      .toBe(hashQuestionImportDocument(document));
  });

  it("resolves categories and marks existing and batch duplicates", () => {
    const result = analyzeQuestionImport({
      document: {
        version: 1,
        questions: [
          validQuestion,
          {
            ...validQuestion,
            categoryCode: " sec-01 ",
            stem: " WHAT  DOES THE CONTROL PROVIDE? ",
          },
        ],
      },
      categories,
      existingQuestions: [{
        id: "22222222-2222-4222-8222-222222222222",
        stem: "What does the control provide?",
      }],
    });

    expect(result.preview.rows[0]).toMatchObject({
      sourceIndex: 0,
      categoryId: categories[0].id,
      valid: true,
      selectedByDefault: false,
      duplicate: {
        existingQuestionIds: ["22222222-2222-4222-8222-222222222222"],
        earlierSourceIndexes: [],
      },
    });
    expect(result.preview.rows[1]).toMatchObject({
      sourceIndex: 1,
      valid: true,
      selectedByDefault: false,
      duplicate: {
        existingQuestionIds: ["22222222-2222-4222-8222-222222222222"],
        earlierSourceIndexes: [0],
      },
    });
  });

  it("keeps invalid rows visible with field errors", () => {
    const result = analyzeQuestionImport({
      document: {
        version: 1,
        questions: [{
          categoryCode: "UNKNOWN",
          stem: "",
          difficulty: "expert",
          answers: [{ text: "", isCorrect: false }],
          extra: true,
        }],
      },
      categories,
      existingQuestions: [],
    });

    expect(result.preview.rows[0].valid).toBe(false);
    expect(result.preview.rows[0].errors.map((error) => error.field))
      .toEqual(expect.arrayContaining([
        "categoryCode",
        "stem",
        "difficulty",
        "answers",
        "extra",
      ]));
  });

  it("exports the approved limits", () => {
    expect(MAX_QUESTION_IMPORT_ROWS).toBe(500);
    expect(MAX_QUESTION_IMPORT_BYTES).toBe(5 * 1024 * 1024);
  });
});
```

Add separate cases for:

```ts
it.each([1, 11])("rejects %i answers at row level", (answerCount) => {
  const result = analyzeQuestionImport({
    document: {
      version: 1,
      questions: [{
        ...validQuestion,
        answers: Array.from({ length: answerCount }, (_, index) => ({
          text: `Answer ${index + 1}`,
          isCorrect: index === 0,
        })),
      }],
    },
    categories,
    existingQuestions: [],
  });
  expect(result.preview.rows[0].errors.map((error) => error.field))
    .toContain("answers");
});

it.each([2, 10])("accepts %i answers", (answerCount) => {
  const result = analyzeQuestionImport({
    document: {
      version: 1,
      questions: [{
        categoryCode: "SEC-01",
        stem: `Question with ${answerCount} answers`,
        answers: Array.from({ length: answerCount }, (_, index) => ({
          text: `Answer ${index + 1}`,
          isCorrect: index === 0,
        })),
      }],
    },
    categories,
    existingQuestions: [],
  });
  expect(result.preview.rows[0]).toMatchObject({
    valid: true,
    difficulty: "medium",
    answerCount,
  });
  expect(result.normalizedRows.get(0)?.answers).toHaveLength(answerCount);
  expect(result.normalizedRows.get(0)?.answers[0]).toMatchObject({
    explanation: "",
    citationUrls: [],
  });
});

it.each([0, 2])("rejects %i correct answers", (correctCount) => {
  const result = analyzeQuestionImport({
    document: {
      version: 1,
      questions: [{
        ...validQuestion,
        answers: [0, 1].map((index) => ({
          text: `Answer ${index + 1}`,
          isCorrect: index < correctCount,
        })),
      }],
    },
    categories,
    existingQuestions: [],
  });
  expect(result.preview.rows[0].errors.map((error) => error.field))
    .toContain("answers");
});

it("reports unknown question and answer properties as row errors", () => {
  const result = analyzeQuestionImport({
    document: {
      version: 1,
      questions: [{
        ...validQuestion,
        id: "33333333-3333-4333-8333-333333333333",
        answers: validQuestion.answers.map((answer, index) => (
          index === 0 ? { ...answer, sortOrder: 0 } : answer
        )),
      }],
    },
    categories,
    existingQuestions: [],
  });
  expect(result.preview.rows[0].errors.map((error) => error.field))
    .toEqual(expect.arrayContaining(["id", "answers.0.sortOrder"]));
});

it("reports unsafe citation URLs as row errors", () => {
  const result = analyzeQuestionImport({
    document: {
      version: 1,
      questions: [{
        ...validQuestion,
        answers: validQuestion.answers.map((answer, index) => ({
          ...answer,
          citationUrls: index === 0 ? ["javascript:alert(1)"] : [],
        })),
      }],
    },
    categories,
    existingQuestions: [],
  });
  expect(result.preview.rows[0].errors.map((error) => error.field))
    .toContain("answers.0.citationUrls.0");
});

it("reports archived and ambiguous case-insensitive categories", () => {
  const result = analyzeQuestionImport({
    document: {
      version: 1,
      questions: [
        { ...validQuestion, categoryCode: "ARCHIVED" },
        { ...validQuestion, categoryCode: "DUPLICATE", stem: "Second stem" },
      ],
    },
    categories: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        code: "ARCHIVED",
        archivedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        code: "DUPLICATE",
        archivedAt: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        code: "duplicate",
        archivedAt: "2026-08-02T00:00:00.000Z",
      },
    ],
    existingQuestions: [],
  });
  expect(result.preview.rows[0].errors.map((error) => error.field))
    .toContain("categoryCode");
  expect(result.preview.rows[1].errors.map((error) => error.field))
    .toContain("categoryCode");
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-import.test.ts
```

Expected: FAIL because `question-import.ts` does not exist.

- [ ] **Step 3: Implement schemas, types, hashing, and analysis**

Create `question-import.ts` with these public constants and types:

```ts
import { createHash } from "node:crypto";
import { z } from "zod";

import { isSafeCitationUrl } from "./validation";

export const QUESTION_IMPORT_VERSION = 1 as const;
export const MAX_QUESTION_IMPORT_ROWS = 500;
export const MAX_QUESTION_IMPORT_BYTES = 5 * 1024 * 1024;

export type QuestionImportCategoryReference = {
  id: string;
  code: string;
  archivedAt: Date | string | null;
};

export type QuestionImportExistingQuestion = {
  id: string;
  stem: string;
};

export type NormalizedQuestionImportAnswer = {
  text: string;
  isCorrect: boolean;
  explanation: string;
  citationUrls: string[];
};

export type NormalizedQuestionImportQuestion = {
  sourceIndex: number;
  categoryCode: string;
  categoryId: string;
  stem: string;
  difficulty: "easy" | "medium" | "hard";
  answers: NormalizedQuestionImportAnswer[];
};

export type QuestionImportRowError = {
  field: string;
  message: string;
};

export type QuestionImportPreviewRow = {
  sourceIndex: number;
  categoryCode: string;
  categoryId?: string;
  stem: string;
  difficulty: "easy" | "medium" | "hard";
  answerCount: number;
  valid: boolean;
  duplicate: {
    existingQuestionIds: string[];
    earlierSourceIndexes: number[];
  };
  selectedByDefault: boolean;
  errors: QuestionImportRowError[];
};

export type QuestionImportPreviewResult = {
  documentVersion: 1;
  documentHash: string;
  totals: {
    submitted: number;
    valid: number;
    invalid: number;
    duplicateExisting: number;
    duplicateBatch: number;
    selectedByDefault: number;
  };
  rows: QuestionImportPreviewRow[];
};
```

Define strict schemas:

```ts
const answerSchema = z.object({
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().trim().optional().default(""),
  citationUrls: z.array(
    z.string().url().refine(isSafeCitationUrl),
  ).optional().default([]),
}).strict();

const questionSchema = z.object({
  categoryCode: z.string().trim().min(1),
  stem: z.string().trim().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
  answers: z.array(answerSchema).min(2).max(10).refine(
    (answers) => answers.filter((answer) => answer.isCorrect).length === 1,
    "Exactly one answer must be correct.",
  ),
}).strict();

export const questionImportEnvelopeSchema = z.object({
  version: z.literal(QUESTION_IMPORT_VERSION),
  questions: z.array(z.unknown()).min(1).max(MAX_QUESTION_IMPORT_ROWS),
}).strict();
```

Implement stable hashing:

```ts
function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableJsonValue(child)]),
    );
  }
  return value;
}

export function hashQuestionImportDocument(document: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableJsonValue(document)))
    .digest("hex");
}

export function normalizeImportedStem(stem: string) {
  return stem.trim().replace(/\s+/g, " ").toLowerCase();
}
```

Implement a custom envelope error:

```ts
export class QuestionImportDocumentError extends Error {
  constructor(public readonly errors: QuestionImportRowError[]) {
    super("Question import document is invalid.");
    this.name = "QuestionImportDocumentError";
  }
}
```

Implement:

```ts
export function analyzeQuestionImport(input: {
  document: unknown;
  categories: QuestionImportCategoryReference[];
  existingQuestions: QuestionImportExistingQuestion[];
}): {
  preview: QuestionImportPreviewResult;
  normalizedRows: Map<number, NormalizedQuestionImportQuestion>;
}
```

The function must execute this exact algorithm:

```ts
const envelope = questionImportEnvelopeSchema.safeParse(input.document);
if (!envelope.success) {
  throw new QuestionImportDocumentError(zodRowErrors(envelope.error));
}

const categoriesByCode = new Map<string, QuestionImportCategoryReference[]>();
for (const category of input.categories) {
  const key = category.code.trim().toLowerCase();
  categoriesByCode.set(key, [...(categoriesByCode.get(key) ?? []), category]);
}

const existingByStem = new Map<string, string[]>();
for (const question of input.existingQuestions) {
  const key = normalizeImportedStem(question.stem);
  existingByStem.set(key, [...(existingByStem.get(key) ?? []), question.id]);
}

const earlierByStem = new Map<string, number[]>();
const normalizedRows = new Map<number, NormalizedQuestionImportQuestion>();
const rows = envelope.data.questions.map((rawQuestion, sourceIndex) => {
  const parsed = questionSchema.safeParse(rawQuestion);
  const raw = rawObject(rawQuestion);
  const errors = parsed.success ? [] : zodRowErrors(parsed.error);
  const categoryCode = parsed.success
    ? parsed.data.categoryCode
    : rawString(raw.categoryCode).trim();
  const stem = parsed.success ? parsed.data.stem : rawString(raw.stem);
  const difficulty = parsed.success ? parsed.data.difficulty : "medium";
  const answerCount = Array.isArray(raw.answers) ? raw.answers.length : 0;
  const categoryMatches = categoriesByCode.get(categoryCode.toLowerCase()) ?? [];
  const activeMatches = categoryMatches.filter((category) => !category.archivedAt);

  if (categoryMatches.length === 0) {
    errors.push({ field: "categoryCode", message: `Unknown category code \"${categoryCode}\".` });
  } else if (categoryMatches.length > 1) {
    errors.push({ field: "categoryCode", message: `Category code \"${categoryCode}\" is ambiguous.` });
  } else if (activeMatches.length === 0) {
    errors.push({ field: "categoryCode", message: `Category \"${categoryCode}\" is archived.` });
  }

  const normalizedStem = stem ? normalizeImportedStem(stem) : "";
  const existingQuestionIds = normalizedStem
    ? existingByStem.get(normalizedStem) ?? []
    : [];
  const earlierSourceIndexes = normalizedStem
    ? earlierByStem.get(normalizedStem) ?? []
    : [];

  if (normalizedStem) {
    earlierByStem.set(normalizedStem, [...earlierSourceIndexes, sourceIndex]);
  }

  const category = categoryMatches.length === 1 && activeMatches.length === 1
    ? activeMatches[0]
    : undefined;
  if (parsed.success && category && errors.length === 0) {
    normalizedRows.set(sourceIndex, {
      sourceIndex,
      categoryCode: category.code,
      categoryId: category.id,
      stem: parsed.data.stem,
      difficulty: parsed.data.difficulty,
      answers: parsed.data.answers,
    });
  }

  const duplicate = {
    existingQuestionIds,
    earlierSourceIndexes,
  };
  const valid = errors.length === 0;
  const hasDuplicate = existingQuestionIds.length > 0 || earlierSourceIndexes.length > 0;
  return {
    sourceIndex,
    categoryCode,
    ...(category ? { categoryId: category.id } : {}),
    stem,
    difficulty,
    answerCount,
    valid,
    duplicate,
    selectedByDefault: valid && !hasDuplicate,
    errors,
  };
});
```

Build totals directly from `rows`, and set:

```ts
documentVersion: QUESTION_IMPORT_VERSION,
documentHash: hashQuestionImportDocument(envelope.data),
```

`zodRowErrors` must preserve precise paths, including one error per unknown key:

```ts
function zodRowErrors(error: z.ZodError): QuestionImportRowError[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        field: [...issue.path, key].map(String).join("."),
        message: `Unknown property "${key}".`,
      }));
    }
    return [{
      field: issue.path.map(String).join(".") || "document",
      message: issue.message,
    }];
  });
}
```

- [ ] **Step 4: Run schema and analysis tests**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-import.test.ts
bun run --cwd apps/api typecheck
```

Expected: all selected tests and typecheck PASS.

- [ ] **Step 5: Commit the pure import contract**

```bash
git add \
  apps/api/src/modules/certdrill/question-import.ts \
  apps/api/tests/modules/certdrill/question-import.test.ts
git commit -m "feat: analyze question import documents" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 2: Preview and Atomic Confirm Service

**Files:**
- Create: `apps/api/src/modules/certdrill/question-import-service.ts`
- Create: `apps/api/tests/modules/certdrill/question-import-service.test.ts`
- Modify: `apps/api/src/modules/certdrill/admin-service.ts`
- Modify: `apps/api/tests/modules/certdrill/admin-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create a focused fake database with:

```ts
type FakeImportDbState = {
  categories: Array<{
    id: string;
    certificationId: string;
    code: string;
    archivedAt: Date | null;
  }>;
  questions: Array<{
    id: string;
    certificationId: string;
    categoryId: string;
    stem: string;
    status: string;
    createdBy: string;
  }>;
  answers: Array<{
    questionId: string;
    text: string;
    isCorrect: boolean;
    explanation: string;
    citationUrls: string[];
    sortOrder: number;
  }>;
};
```

The fake `transaction` clones state, executes against the clone, and copies the
clone back only on success. Tests must prove:

```ts
it("previews categories and existing duplicates for one certification", async () => {
  const result = await service.preview({
    certificationId,
    document,
  });
  expect(result.rows[0]).toMatchObject({
    valid: true,
    selectedByDefault: false,
  });
});

it("imports selected rows as Draft and AI with ordered answers", async () => {
  const preview = await service.preview({ certificationId, document });
  const result = await service.confirm({
    certificationId,
    document,
    previewDocumentHash: preview.documentHash,
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [],
  });

  expect(result.importedCount).toBe(1);
  expect(state.questions[0]).toMatchObject({
    status: "draft",
    createdBy: "ai",
    certificationId,
  });
  expect(state.answers.map((answer) => answer.sortOrder)).toEqual([0, 1]);
});

it("allows explicitly overridden duplicate rows", async () => {
  const preview = await service.preview({ certificationId, document });
  const result = await service.confirm({
    certificationId,
    document,
    previewDocumentHash: preview.documentHash,
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [0],
  });
  expect(result.importedCount).toBe(1);
  expect(state.questions).toHaveLength(1);
});

it("returns a conflict when a duplicate lacks an override", async () => {
  await expect(service.confirm({
    certificationId,
    document,
    previewDocumentHash: preview.documentHash,
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [],
  })).rejects.toMatchObject({
    code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
    details: expect.objectContaining({ rows: expect.any(Array) }),
  });
});

it.each([
  {
    name: "changed hash",
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [],
    previewDocumentHash: "f".repeat(64),
  },
  {
    name: "missing row",
    selectedSourceIndexes: [99],
    duplicateOverrideSourceIndexes: [],
  },
  {
    name: "duplicate selected index",
    selectedSourceIndexes: [0, 0],
    duplicateOverrideSourceIndexes: [],
  },
  {
    name: "empty selection",
    selectedSourceIndexes: [],
    duplicateOverrideSourceIndexes: [],
  },
])("returns a conflict for $name", async ({
  selectedSourceIndexes,
  duplicateOverrideSourceIndexes,
  previewDocumentHash,
}) => {
  const preview = await service.preview({ certificationId, document });
  await expect(service.confirm({
    certificationId,
    document,
    previewDocumentHash: previewDocumentHash ?? preview.documentHash,
    selectedSourceIndexes,
    duplicateOverrideSourceIndexes,
  })).rejects.toMatchObject({
    code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
  });
  expect(state.questions).toEqual([]);
});

it("revalidates category and duplicate state inside confirm", async () => {
  const preview = await service.preview({ certificationId, document });
  state.questions.push({
    id: "99999999-9999-4999-8999-999999999999",
    certificationId,
    categoryId,
    stem: document.questions[0].stem,
    status: "published",
    createdBy: "human",
  });
  await expect(service.confirm({
    certificationId,
    document,
    previewDocumentHash: preview.documentHash,
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [],
  })).rejects.toMatchObject({
    code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
  });
  expect(state.questions).toHaveLength(1);
  expect(state.answers).toEqual([]);
});

it("rolls back all questions when answer insertion fails", async () => {
  db.failAnswerInsert = true;
  await expect(service.confirm(validConfirm)).rejects.toThrow("answer insert failed");
  expect(state.questions).toEqual([]);
  expect(state.answers).toEqual([]);
});
```

Add an admin-service delegation test:

```ts
it("exposes question import preview and confirm", async () => {
  const preview = vi.fn().mockResolvedValue({ rows: [] });
  const confirm = vi.fn().mockResolvedValue({ importedCount: 0, questionIds: [] });
  const service = createCertDrillAdminService({
    db,
    questionImport: { preview, confirm },
  });

  await service.previewQuestionImport(previewInput);
  await service.importQuestions(confirmInput);

  expect(preview).toHaveBeenCalledWith(previewInput);
  expect(confirm).toHaveBeenCalledWith(confirmInput);
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-import-service.test.ts \
  tests/modules/certdrill/admin-service.test.ts
```

Expected: FAIL because the import service and admin-service methods do not exist.

- [ ] **Step 3: Implement the import service**

Create these input/result and error types:

```ts
import {
  certdrillAnswerOptions,
  certdrillExamCategories,
  certdrillQuestions,
} from "@platform/platform-db";
import { eq } from "drizzle-orm";

import {
  QuestionImportDocumentError,
  analyzeQuestionImport,
  type QuestionImportPreviewResult,
} from "./question-import";

export type QuestionImportPreviewInput = {
  certificationId: string;
  document: unknown;
};

export type QuestionImportConfirmInput = QuestionImportPreviewInput & {
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
};

export type QuestionImportResult = {
  importedCount: number;
  questionIds: string[];
};

export type QuestionImportServiceErrorCode =
  | "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT"
  | "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT";

export class QuestionImportServiceError extends Error {
  constructor(
    public readonly code: QuestionImportServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "QuestionImportServiceError";
  }
}
```

Create:

```ts
export function createQuestionImportService({
  db,
  generateId = () => crypto.randomUUID(),
}: {
  db: any;
  generateId?: () => string;
}) {
```

Implement a shared loader:

```ts
async function loadReferences(database: any, certificationId: string) {
  const [categories, existingQuestions] = await Promise.all([
    database.query.certdrillExamCategories.findMany({
      where: eq(certdrillExamCategories.certificationId, certificationId),
    }),
    database.query.certdrillQuestions.findMany({
      where: eq(certdrillQuestions.certificationId, certificationId),
      columns: { id: true, stem: true },
    }),
  ]);
  return { categories, existingQuestions };
}
```

Add the shared helpers:

```ts
function analyzeOrServiceError(
  document: unknown,
  references: Awaited<ReturnType<typeof loadReferences>>,
) {
  try {
    return analyzeQuestionImport({ document, ...references });
  } catch (error) {
    if (error instanceof QuestionImportDocumentError) {
      throw new QuestionImportServiceError(
        "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
        error.message,
        error.errors,
      );
    }
    throw error;
  }
}

function uniqueIndexes(indexes: number[]) {
  return [...new Set(indexes.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < 500,
  ))];
}

async function withTransaction<T>(
  database: any,
  operation: (tx: any) => Promise<T>,
): Promise<T> {
  if (typeof database.transaction === "function") {
    return database.transaction(operation);
  }
  return operation(database);
}
```

Implement preview:

```ts
async function preview(
  input: QuestionImportPreviewInput,
): Promise<QuestionImportPreviewResult> {
  const references = await loadReferences(db, input.certificationId);
  return analyzeOrServiceError(input.document, references).preview;
}
```

Implement confirm so all reference loading and persistence occurs inside one
transaction:

```ts
async function confirm(
  input: QuestionImportConfirmInput,
): Promise<QuestionImportResult> {
  return withTransaction(db, async (tx) => {
    const references = await loadReferences(tx, input.certificationId);
    const analysis = analyzeOrServiceError(input.document, references);
    const preview = analysis.preview;
    const selected = uniqueIndexes(input.selectedSourceIndexes);
    const overrides = uniqueIndexes(input.duplicateOverrideSourceIndexes);

    const conflict =
      preview.documentHash !== input.previewDocumentHash
      || selected.length === 0
      || selected.length !== input.selectedSourceIndexes.length
      || overrides.length !== input.duplicateOverrideSourceIndexes.length
      || overrides.some((index) => !selected.includes(index))
      || selected.some((index) => {
        const row = preview.rows[index];
        if (!row?.valid || !analysis.normalizedRows.has(index)) return true;
        const duplicate = row.duplicate.existingQuestionIds.length > 0
          || row.duplicate.earlierSourceIndexes.length > 0;
        return duplicate && !overrides.includes(index);
      });

    if (conflict) {
      throw new QuestionImportServiceError(
        "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
        "Question import changed. Review the refreshed preview.",
        preview,
      );
    }

    const questions = selected.map((sourceIndex) => {
      const normalized = analysis.normalizedRows.get(sourceIndex);
      if (!normalized) {
        throw new QuestionImportServiceError(
          "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
          "Question import changed. Review the refreshed preview.",
          preview,
        );
      }
      return {
        id: generateId(),
        sourceIndex,
        normalized,
      };
    });

    await tx.insert(certdrillQuestions).values(questions.map(({ id, normalized }) => ({
      id,
      certificationId: input.certificationId,
      categoryId: normalized.categoryId,
      sourceResourceId: null,
      generationJobId: null,
      stem: normalized.stem,
      mediaAssets: [],
      difficulty: normalized.difficulty,
      status: "draft",
      createdBy: "ai",
    })));

    await tx.insert(certdrillAnswerOptions).values(questions.flatMap(({ id, normalized }) =>
      normalized.answers.map((answer, sortOrder) => ({
        questionId: id,
        text: answer.text,
        mediaAssets: [],
        isCorrect: answer.isCorrect,
        explanation: answer.explanation,
        citationUrls: answer.citationUrls,
        sortOrder,
      })),
    ));

    return {
      importedCount: questions.length,
      questionIds: questions.map(({ id }) => id),
    };
  });
}
```

The production database always takes the transactional branch. The fallback is
only for the repository's existing lightweight service-test doubles.

- [ ] **Step 4: Wire the focused service into admin-service**

Extend deps:

```ts
type QuestionImportService = Pick<
  ReturnType<typeof createQuestionImportService>,
  "preview" | "confirm"
>;

type CertDrillAdminServiceDeps = {
  db: any;
  questionIndex?: CertDrillAdminQuestionIndex;
  questionImport?: QuestionImportService;
};
```

Inside `createCertDrillAdminService`:

```ts
const questionImport =
  deps.questionImport ?? createQuestionImportService({ db: deps.db });

async function previewQuestionImport(input: QuestionImportPreviewInput) {
  return questionImport.preview(input);
}

async function importQuestions(input: QuestionImportConfirmInput) {
  return questionImport.confirm(input);
}
```

Return both methods from the service.

- [ ] **Step 5: Run service tests**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-import.test.ts \
  tests/modules/certdrill/question-import-service.test.ts \
  tests/modules/certdrill/admin-service.test.ts
bun run --cwd apps/api typecheck
```

Expected: all selected tests and typecheck PASS.

- [ ] **Step 6: Commit the service**

```bash
git add \
  apps/api/src/modules/certdrill/question-import-service.ts \
  apps/api/src/modules/certdrill/admin-service.ts \
  apps/api/tests/modules/certdrill/question-import-service.test.ts \
  apps/api/tests/modules/certdrill/admin-service.test.ts
git commit -m "feat: atomically import certdrill questions" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 3: Import API Routes and Structured Error Details

**Files:**
- Modify: `packages/frontend-shared/src/api-client.ts`
- Modify: `packages/frontend-shared/tests/api-client.test.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/api/tests/certdrill.admin.routes.test.ts`

- [ ] **Step 1: Write failing structured-error and route tests**

Add API client coverage:

```ts
it("preserves structured API error details", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    success: false,
    error: {
      code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
      message: "Review the refreshed preview.",
      details: { rows: [{ sourceIndex: 0 }] },
    },
  }), {
    status: 409,
    headers: { "content-type": "application/json" },
  }));

  await expect(apiRequest("/import")).rejects.toMatchObject({
    status: 409,
    errorCode: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
    details: { rows: [{ sourceIndex: 0 }] },
  });
});
```

Add admin route tests:

```ts
it("delegates question import preview and confirm", async () => {
  const previewBody = { certificationId, document };
  const confirmBody = {
    ...previewBody,
    previewDocumentHash: "a".repeat(64),
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [],
  };

  expect((await router.request("/questions/import/preview", {
    method: "POST",
    body: JSON.stringify(previewBody),
    headers: adminJsonHeaders,
  })).status).toBe(200);

  expect((await router.request("/questions/import", {
    method: "POST",
    body: JSON.stringify(confirmBody),
    headers: adminJsonHeaders,
  })).status).toBe(200);
});

it("returns 409 with refreshed preview for import conflicts", async () => {
  importQuestions.mockRejectedValueOnce(new QuestionImportServiceError(
    "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
    "Review the refreshed preview.",
    preview,
  ));
  const response = await router.request("/questions/import", request);
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    error: {
      code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
      details: preview,
    },
  });
});

it("rejects import requests larger than 5 MB", async () => {
  const response = await router.request("/questions/import/preview", {
    method: "POST",
    headers: adminJsonHeaders,
    body: JSON.stringify({
      certificationId,
      document: {
        version: 1,
        questions: [{ ...validQuestion, stem: "x".repeat(5 * 1024 * 1024) }],
      },
    }),
  });
  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd packages/frontend-shared test -- tests/api-client.test.ts
bun run --cwd apps/api test -- tests/certdrill.admin.routes.test.ts
```

Expected: FAIL because error details and import routes do not exist.

- [ ] **Step 3: Preserve API error details**

Extend:

```ts
type ApiErrorBody = {
  error?: string | {
    code?: string;
    message?: string;
    details?: unknown;
  };
  errorCode?: string;
  requestId?: string;
};
```

Add:

```ts
details?: unknown;
```

to `ApiRequestError`, accept it in the constructor, and pass:

```ts
details:
  typeof parsedBody?.error === "object" && parsedBody.error !== null
    ? parsedBody.error.details
    : undefined,
```

when throwing the error.

- [ ] **Step 4: Add size-limited route parsing**

In `routes.ts`, import:

```ts
import {
  MAX_QUESTION_IMPORT_BYTES,
} from "./question-import";
import {
  QuestionImportServiceError,
} from "./question-import-service";
```

Add strict transport schemas:

```ts
const questionImportPreviewRequestSchema = z.object({
  certificationId: z.string().uuid(),
  document: z.unknown(),
}).strict();

const questionImportRequestSchema = questionImportPreviewRequestSchema.extend({
  previewDocumentHash: z.string().regex(/^[a-f0-9]{64}$/),
  selectedSourceIndexes: z.array(z.number().int().min(0).max(499)).min(1).max(500),
  duplicateOverrideSourceIndexes: z.array(z.number().int().min(0).max(499)).max(500),
}).strict();
```

Add:

```ts
const MAX_QUESTION_IMPORT_TRANSPORT_BYTES =
  MAX_QUESTION_IMPORT_BYTES + 64 * 1024;

async function adminJsonWithLimit<T>(
  c: Context<AppEnv>,
  schema: z.ZodSchema<T>,
  documentFromBody: (body: T) => unknown,
) {
  const rawBody = await c.req.text();
  if (
    new TextEncoder().encode(rawBody).byteLength
      > MAX_QUESTION_IMPORT_TRANSPORT_BYTES
  ) {
    return {
      success: false as const,
      response: validationError(c, "Question import payload exceeds 5 MB."),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return {
      success: false as const,
      response: validationError(c, "Question import payload must be valid JSON."),
    };
  }

  const parsed = parseJsonBody(schema, body);
  if (
    parsed.success
    && new TextEncoder().encode(
      JSON.stringify(documentFromBody(parsed.data)),
    ).byteLength > MAX_QUESTION_IMPORT_BYTES
  ) {
    return {
      success: false as const,
      response: validationError(c, "Question import JSON exceeds 5 MB."),
    };
  }
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : {
        success: false as const,
        response: parsedValidationError(c, "Invalid question import payload", parsed.error),
      };
}
```

Extend error handling before the generic admin-service error:

```ts
if (error instanceof QuestionImportServiceError) {
  const status = error.code === "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT"
    ? 409
    : 400;
  return c.json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  }, status);
}
```

Add routes before `/questions/:id` so `"import"` cannot be interpreted as an ID:

```ts
router.post("/questions/import/preview", async (c) => {
  const parsed = await adminJsonWithLimit(
    c,
    questionImportPreviewRequestSchema,
    (body) => body.document,
  );
  if (!parsed.success) return parsed.response;
  return withAdminAction(c, () =>
    deps.service.previewQuestionImport(parsed.data));
});

router.post("/questions/import", async (c) => {
  const parsed = await adminJsonWithLimit(
    c,
    questionImportRequestSchema,
    (body) => body.document,
  );
  if (!parsed.success) return parsed.response;
  return withAdminAction(c, () =>
    deps.service.importQuestions(parsed.data));
});
```

- [ ] **Step 5: Run route and shared-client tests**

Run:

```bash
bun run --cwd packages/frontend-shared test -- tests/api-client.test.ts
bun run --cwd apps/api test -- \
  tests/certdrill.admin.routes.test.ts \
  tests/modules/certdrill/question-import.test.ts \
  tests/modules/certdrill/question-import-service.test.ts
bun run --cwd apps/api typecheck
```

Expected: all selected tests and typecheck PASS.

- [ ] **Step 6: Commit routes and structured errors**

```bash
git add \
  packages/frontend-shared/src/api-client.ts \
  packages/frontend-shared/tests/api-client.test.ts \
  apps/api/src/modules/certdrill/routes.ts \
  apps/api/tests/certdrill.admin.routes.test.ts
git commit -m "feat: expose question import endpoints" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 4: Admin Import Types, API Client, and Server Actions

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-import-types.ts`
- Create: `apps/admin/src/modules/certdrill/question-import-actions.ts`
- Create: `apps/admin/tests/modules/certdrill/question-import-actions.test.ts`
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`

- [ ] **Step 1: Write failing action tests**

Mock the typed server API functions and cover:

```ts
it("rejects invalid JSON without calling the API", async () => {
  const result = await previewQuestionImportAction({
    certificationId,
    rawJson: "{",
  });
  expect(result).toEqual({
    status: "error",
    message: "Question import JSON is invalid.",
  });
  expect(previewServer).not.toHaveBeenCalled();
});

it("rejects JSON larger than 5 MB", async () => {
  const result = await previewQuestionImportAction({
    certificationId,
    rawJson: JSON.stringify({
      version: 1,
      questions: [{ stem: "x".repeat(5 * 1024 * 1024) }],
    }),
  });
  expect(result.status).toBe("error");
  expect(previewServer).not.toHaveBeenCalled();
});

it("returns the server preview", async () => {
  previewServer.mockResolvedValue(preview);
  await expect(previewQuestionImportAction({
    certificationId,
    rawJson: JSON.stringify(document),
  })).resolves.toEqual({ status: "preview", preview });
});

it("returns refreshed preview details for confirm conflicts", async () => {
  confirmServer.mockRejectedValue(new ApiRequestError({
    status: 409,
    message: "API request failed (409): Review the refreshed preview.",
    errorCode: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
    details: preview,
  }));

  await expect(confirmQuestionImportAction(input)).resolves.toEqual({
    status: "conflict",
    message: "Review the refreshed preview.",
    preview,
  });
});

it("returns imported count and IDs on success", async () => {
  confirmServer.mockResolvedValue({
    importedCount: 2,
    questionIds: ["a", "b"],
  });
  await expect(confirmQuestionImportAction(input)).resolves.toEqual({
    status: "success",
    importedCount: 2,
    questionIds: ["a", "b"],
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-import-actions.test.ts
```

Expected: FAIL because the types and actions do not exist.

- [ ] **Step 3: Add serializable admin types**

Create `question-import-types.ts`:

```ts
export const MAX_QUESTION_IMPORT_BYTES = 5 * 1024 * 1024;

export type QuestionImportRowError = {
  field: string;
  message: string;
};

export type QuestionImportPreviewRow = {
  sourceIndex: number;
  categoryCode: string;
  categoryId?: string;
  stem: string;
  difficulty: "easy" | "medium" | "hard";
  answerCount: number;
  valid: boolean;
  duplicate: {
    existingQuestionIds: string[];
    earlierSourceIndexes: number[];
  };
  selectedByDefault: boolean;
  errors: QuestionImportRowError[];
};

export type QuestionImportPreviewResult = {
  documentVersion: 1;
  documentHash: string;
  totals: {
    submitted: number;
    valid: number;
    invalid: number;
    duplicateExisting: number;
    duplicateBatch: number;
    selectedByDefault: number;
  };
  rows: QuestionImportPreviewRow[];
};

export type QuestionImportResult = {
  importedCount: number;
  questionIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.every((item) => Number.isInteger(item));
}

function isPreviewRow(value: unknown): value is QuestionImportPreviewRow {
  if (!isRecord(value) || !isRecord(value.duplicate)) return false;
  return Number.isInteger(value.sourceIndex)
    && typeof value.categoryCode === "string"
    && (value.categoryId === undefined || typeof value.categoryId === "string")
    && typeof value.stem === "string"
    && typeof value.difficulty === "string"
    && ["easy", "medium", "hard"].includes(value.difficulty)
    && Number.isInteger(value.answerCount)
    && typeof value.valid === "boolean"
    && isStringArray(value.duplicate.existingQuestionIds)
    && isNumberArray(value.duplicate.earlierSourceIndexes)
    && typeof value.selectedByDefault === "boolean"
    && Array.isArray(value.errors)
    && value.errors.every((error) => (
      isRecord(error)
      && typeof error.field === "string"
      && typeof error.message === "string"
    ));
}

export function isQuestionImportPreviewResult(
  value: unknown,
): value is QuestionImportPreviewResult {
  if (!isRecord(value) || !isRecord(value.totals)) return false;
  return value.documentVersion === 1
    && typeof value.documentHash === "string"
    && [
      value.totals.submitted,
      value.totals.valid,
      value.totals.invalid,
      value.totals.duplicateExisting,
      value.totals.duplicateBatch,
      value.totals.selectedByDefault,
    ].every((count) => Number.isInteger(count))
    && Array.isArray(value.rows)
    && value.rows.every(isPreviewRow);
}

export type QuestionImportPreviewActionResult =
  | { status: "preview"; preview: QuestionImportPreviewResult }
  | { status: "error"; message: string };

export type QuestionImportConfirmActionResult =
  | {
      status: "success";
      importedCount: number;
      questionIds: string[];
    }
  | {
      status: "conflict";
      message: string;
      preview: QuestionImportPreviewResult;
    }
  | { status: "error"; message: string };
```

- [ ] **Step 4: Add typed API methods**

In `certdrill.server.ts`, import the types and add:

```ts
export async function previewCertDrillQuestionImportServer(input: {
  certificationId: string;
  document: unknown;
}) {
  return certdrillAdminRequest<QuestionImportPreviewResult>(
    "/questions/import/preview",
    jsonRequestInit("POST", input),
  );
}

export async function confirmCertDrillQuestionImportServer(input: {
  certificationId: string;
  document: unknown;
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
}) {
  return certdrillAdminRequest<QuestionImportResult>(
    "/questions/import",
    jsonRequestInit("POST", input),
  );
}
```

- [ ] **Step 5: Implement server actions**

Create `"use server"` actions:

```ts
import { ApiRequestError } from "@platform/frontend-shared";

import {
  confirmCertDrillQuestionImportServer,
  previewCertDrillQuestionImportServer,
} from "@/lib/api/certdrill.server";
import {
  isQuestionImportPreviewResult,
  MAX_QUESTION_IMPORT_BYTES,
  type QuestionImportConfirmActionResult,
  type QuestionImportPreviewActionResult,
  type QuestionImportPreviewResult,
} from "./question-import-types";

function parseRawImportJson(rawJson: string) {
  if (!rawJson.trim()) {
    return { success: false as const, message: "Add question import JSON first." };
  }
  if (Buffer.byteLength(rawJson, "utf8") > MAX_QUESTION_IMPORT_BYTES) {
    return { success: false as const, message: "Question import JSON must not exceed 5 MB." };
  }
  try {
    return { success: true as const, document: JSON.parse(rawJson) as unknown };
  } catch {
    return { success: false as const, message: "Question import JSON is invalid." };
  }
}

function apiMessage(error: unknown) {
  return error instanceof Error ? error.message : "Question import request failed.";
}

function conflictPreview(error: ApiRequestError) {
  if (
    error.errorCode !== "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT"
    || !isQuestionImportPreviewResult(error.details)
  ) return undefined;
  return error.details;
}
```

Preview:

```ts
export async function previewQuestionImportAction(input: {
  certificationId: string;
  rawJson: string;
}): Promise<QuestionImportPreviewActionResult> {
  const parsed = parseRawImportJson(input.rawJson);
  if (!parsed.success) return { status: "error", message: parsed.message };
  try {
    return {
      status: "preview",
      preview: await previewCertDrillQuestionImportServer({
        certificationId: input.certificationId,
        document: parsed.document,
      }),
    };
  } catch (error) {
    return { status: "error", message: apiMessage(error) };
  }
}
```

Confirm repeats parsing and calls confirm. On `ApiRequestError` conflict, strip the
standard prefix from the human message:

```ts
const message = error.message.replace(/^API request failed \(\d+\):\s*/, "");
```

Return the three discriminated outcomes exactly as defined.

- [ ] **Step 6: Run action tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-import-actions.test.ts \
  tests/lib/certdrill-admin-api.test.ts
bun run --cwd apps/admin typecheck
```

Expected: all selected tests and typecheck PASS.

- [ ] **Step 7: Commit admin actions**

```bash
git add \
  apps/admin/src/modules/certdrill/question-import-types.ts \
  apps/admin/src/modules/certdrill/question-import-actions.ts \
  apps/admin/src/lib/api/certdrill.server.ts \
  apps/admin/tests/modules/certdrill/question-import-actions.test.ts
git commit -m "feat: call question import API" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 5: Import Route, Entry Point, Example, and Success Message

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-import-page.tsx`
- Create: `apps/admin/src/modules/certdrill/question-import-form.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/import/page.tsx`
- Create: `apps/admin/public/question-import-example.json`
- Modify: `apps/admin/src/modules/certdrill/question-editor-href.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
- Create: `apps/admin/tests/modules/certdrill/question-import-page.test.ts`

- [ ] **Step 1: Write failing route and entry tests**

Assert source/markup contracts:

```ts
expect(adminPageSource).toContain("Import questions");
expect(adminPageSource).toContain("questionImportHref");
expect(adminPageSource).toContain("questionsImported");
expect(questionImportPageSource).toContain("QuestionImportForm");
expect(questionImportFormSource).toContain("Upload JSON");
expect(questionImportFormSource).toContain("Paste JSON");
expect(questionImportFormSource).toContain("Validate and preview");
expect(questionImportPageSource).toContain("Back to questions");
expect(exampleDocument.version).toBe(1);
expect(exampleDocument.questions[0].answers).toHaveLength(2);
```

Render `QuestionImportPage` with a certification and assert:

```ts
expect(markup).toContain("Import questions");
expect(markup).toContain("AZ-104");
expect(markup).toContain("question-import-example.json");
expect(markup).toContain("Back to questions");
```

Render `CertDrillAdminPage` with `importedQuestionCount={3}` and assert:

```ts
expect(markup).toContain("3 questions imported as Draft.");
expect(markup).toContain('role="status"');
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/modules/certdrill/question-import-page.test.ts
```

Expected: FAIL because the route, button, example, and banner do not exist.

- [ ] **Step 3: Add href and route**

Add:

```ts
export function questionImportHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}/questions/import`;
}
```

Create the route:

```tsx
import { Container } from "@/components/ui/container";
import { listCertDrillAdminCertificationsServer } from "@/lib/api/certdrill.server";
import { QuestionImportPage } from "@/modules/certdrill/question-import-page";

export default async function CertDrillQuestionImportRoute({
  params,
}: {
  params: Promise<{ certificationId: string }>;
}) {
  const { certificationId } = await params;
  const certifications = await listCertDrillAdminCertificationsServer();
  const certification = certifications.find((item) => item.id === certificationId);

  return (
    <Container className="py-6">
      <QuestionImportPage
        certificationId={certificationId}
        certification={certification}
      />
    </Container>
  );
}
```

Create `question-import-page.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Link as LocalizedLink } from "@/i18n/navigation";
import type {
  CertDrillAdminCertification,
} from "@/lib/api/certdrill.server";

import { QuestionImportForm } from "./question-import-form";

export function QuestionImportPage({
  certificationId,
  certification,
}: {
  certificationId: string;
  certification?: CertDrillAdminCertification;
}) {
  const questionsHref = `/admin/certdrill/${certificationId}?tab=questions`;

  if (!certification) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-md border border-destructive p-4">
          Certification could not be found.
        </div>
        <Button asChild variant="outline">
          <LocalizedLink href="/admin/certdrill">
            Back to CertDrill
          </LocalizedLink>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="outline">
          <LocalizedLink href={questionsHref}>Back to questions</LocalizedLink>
        </Button>
        <h1 className="text-2xl font-semibold">Import questions</h1>
        <p className="text-muted-foreground">
          Import AI-generated questions for {certification.code}. Every imported
          question is saved as Draft and marked as AI-created.
        </p>
        <a
          href="/question-import-example.json"
          download
          className="inline-block underline"
        >
          Download canonical JSON example
        </a>
      </div>
      <QuestionImportForm certificationId={certificationId} />
    </div>
  );
}
```

- [ ] **Step 4: Add entry button and success banner**

In the Questions card header, replace the single Create button with:

```tsx
<div className="flex flex-wrap gap-2">
  <Button asChild variant="outline">
    <LocalizedLink href={questionImportHref(selectedCertificationId)}>
      Import questions
    </LocalizedLink>
  </Button>
  <Button asChild>
    <LocalizedLink href={questionEditorNewHref(selectedCertificationId)}>
      Create question
    </LocalizedLink>
  </Button>
</div>
```

Add `importedQuestionCount?: number` to `CertDrillAdminPage`. Above the Question
filter, render:

```tsx
{importedQuestionCount ? (
  <div
    role="status"
    className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm"
  >
    {importedQuestionCount} {importedQuestionCount === 1 ? "question" : "questions"} imported as Draft.
  </div>
) : null}
```

Parse the route query:

```ts
function positiveInteger(value: SearchParamValue) {
  const parsed = Number(firstSearchParamString(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
```

Pass `importedQuestionCount={positiveInteger(query.imported)}`.

- [ ] **Step 5: Add the initial working upload/paste preview form**

Create:

```tsx
"use client";

import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { previewQuestionImportAction } from "./question-import-actions";
import {
  MAX_QUESTION_IMPORT_BYTES,
  type QuestionImportPreviewResult,
} from "./question-import-types";

export function QuestionImportForm({
  certificationId,
}: {
  certificationId: string;
}) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<QuestionImportPreviewResult>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > MAX_QUESTION_IMPORT_BYTES) {
      setMessage("Question import JSON must not exceed 5 MB.");
      return;
    }
    const text = await file.text();
    setRawJson(text);
    setPreview(undefined);
    setMessage(undefined);
  }

  async function handlePreview() {
    setPending(true);
    setMessage(undefined);
    const result = await previewQuestionImportAction({
      certificationId,
      rawJson,
    });
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    setPreview(result.preview);
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={mode}
        onValueChange={(value) => setMode(value as "upload" | "paste")}
      >
        <TabsList>
          <TabsTrigger value="upload">Upload JSON</TabsTrigger>
          <TabsTrigger value="paste">Paste JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="space-y-2">
          <Label htmlFor="question-import-file">Question import file</Label>
          <input
            id="question-import-file"
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
          />
        </TabsContent>
        <TabsContent value="paste" className="space-y-2">
          <Label htmlFor="question-import-json">Question import JSON</Label>
          <Textarea
            id="question-import-json"
            value={rawJson}
            rows={16}
            onChange={(event) => {
              setRawJson(event.currentTarget.value);
              setPreview(undefined);
              setMessage(undefined);
            }}
          />
        </TabsContent>
      </Tabs>

      {message ? <div role="alert">{message}</div> : null}

      <Button type="button" disabled={pending} onClick={handlePreview}>
        {pending ? "Validating..." : "Validate and preview"}
      </Button>

      {preview ? (
        <div role="status">
          {preview.totals.submitted} rows checked: {preview.totals.valid} valid,{" "}
          {preview.totals.invalid} invalid,{" "}
          {preview.totals.duplicateExisting + preview.totals.duplicateBatch} duplicate matches.
        </div>
      ) : null}
    </div>
  );
}
```

This is intentionally a complete preview-only increment. Task 6 adds row
review, duplicate overrides, and confirm behavior without replacing the
upload/paste flow.

- [ ] **Step 6: Add canonical example JSON**

Create `apps/admin/public/question-import-example.json` with exactly:

```json
{
  "version": 1,
  "questions": [
    {
      "categoryCode": "SEC-01",
      "stem": "What does the security control provide?",
      "difficulty": "medium",
      "answers": [
        {
          "text": "Protection for the resource",
          "isCorrect": true,
          "explanation": "The control protects the resource.",
          "citationUrls": [
            "https://example.com/source"
          ]
        },
        {
          "text": "A billing discount",
          "isCorrect": false,
          "explanation": "Billing is unrelated to the security control.",
          "citationUrls": []
        }
      ]
    }
  ]
}
```

- [ ] **Step 7: Run route and copy tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/modules/certdrill/question-import-page.test.ts
bun run --cwd apps/admin typecheck
```

Expected: selected tests and typecheck PASS.

- [ ] **Step 8: Commit route and entry point**

```bash
git add \
  apps/admin/src/modules/certdrill/question-import-page.tsx \
  apps/admin/src/modules/certdrill/question-import-form.tsx \
  apps/admin/src/app/[locale]/\\(backend\\)/\\(admin\\)/admin/certdrill/[certificationId]/questions/import/page.tsx \
  apps/admin/public/question-import-example.json \
  apps/admin/src/modules/certdrill/question-editor-href.ts \
  apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/src/app/[locale]/\\(backend\\)/\\(admin\\)/admin/certdrill/[certificationId]/page.tsx \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts \
  apps/admin/tests/modules/certdrill/question-import-page.test.ts
git commit -m "feat: add question import entry point" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 6: Import Selection State and Client Review UI

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-import-selection.ts`
- Modify: `apps/admin/src/modules/certdrill/question-import-form.tsx`
- Create: `apps/admin/tests/modules/certdrill/question-import-selection.test.ts`
- Modify: `apps/admin/tests/modules/certdrill/question-import-page.test.ts`

- [ ] **Step 1: Write failing selection tests**

Create:

```ts
import { describe, expect, it } from "vitest";

import {
  includeAllDuplicateRows,
  initialQuestionImportSelection,
  reconcileSelection,
  toggleQuestionImportRow,
} from "../../../src/modules/certdrill/question-import-selection";
import type {
  QuestionImportPreviewResult,
  QuestionImportPreviewRow,
} from "../../../src/modules/certdrill/question-import-types";

function row(
  sourceIndex: number,
  overrides: Partial<QuestionImportPreviewRow> = {},
): QuestionImportPreviewRow {
  return {
    sourceIndex,
    categoryCode: "SEC-01",
    categoryId: "11111111-1111-4111-8111-111111111111",
    stem: `Question ${sourceIndex + 1}`,
    difficulty: "medium",
    answerCount: 2,
    valid: true,
    duplicate: {
      existingQuestionIds: [],
      earlierSourceIndexes: [],
    },
    selectedByDefault: true,
    errors: [],
    ...overrides,
  };
}

function previewWith(rows: QuestionImportPreviewRow[]): QuestionImportPreviewResult {
  return {
    documentVersion: 1,
    documentHash: "a".repeat(64),
    totals: {
      submitted: rows.length,
      valid: rows.filter((item) => item.valid).length,
      invalid: rows.filter((item) => !item.valid).length,
      duplicateExisting: rows.filter(
        (item) => item.duplicate.existingQuestionIds.length > 0,
      ).length,
      duplicateBatch: rows.filter(
        (item) => item.duplicate.earlierSourceIndexes.length > 0,
      ).length,
      selectedByDefault: rows.filter((item) => item.selectedByDefault).length,
    },
    rows,
  };
}

const validRow = row(0);
const duplicateRow = row(1, {
  duplicate: {
    existingQuestionIds: ["22222222-2222-4222-8222-222222222222"],
    earlierSourceIndexes: [],
  },
  selectedByDefault: false,
});
const invalidRow = row(2, {
  valid: false,
  selectedByDefault: false,
  errors: [{ field: "stem", message: "Stem is required." }],
});
const preview = previewWith([validRow, duplicateRow, invalidRow]);
const selection = { selected: [0], duplicateOverrides: [] };
const selectedDuplicate = {
  selected: [0, 1],
  duplicateOverrides: [1],
};
const refreshedPreviewWithRowOneNowDuplicate = previewWith([
  validRow,
  duplicateRow,
]);

describe("question import selection", () => {
  it("selects valid non-duplicates by default", () => {
    expect(initialQuestionImportSelection(preview)).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("does not allow invalid rows to be selected", () => {
    expect(toggleQuestionImportRow(selection, invalidRow, true))
      .toEqual(selection);
  });

  it("selecting a duplicate also records its explicit override", () => {
    expect(toggleQuestionImportRow(selection, duplicateRow, true)).toEqual({
      selected: [0, 1],
      duplicateOverrides: [1],
    });
  });

  it("deselecting a duplicate removes its override", () => {
    expect(toggleQuestionImportRow(selectedDuplicate, duplicateRow, false))
      .toEqual({ selected: [0], duplicateOverrides: [] });
  });

  it("the batch toggle selects or removes every valid duplicate", () => {
    expect(includeAllDuplicateRows(selection, preview, true))
      .toEqual({ selected: [0, 1], duplicateOverrides: [1] });
    expect(includeAllDuplicateRows(selectedDuplicate, preview, false))
      .toEqual({ selected: [0], duplicateOverrides: [] });
  });

  it("drops newly duplicated selections after a refreshed preview", () => {
    expect(reconcileSelection(
      { selected: [0, 1], duplicateOverrides: [] },
      refreshedPreviewWithRowOneNowDuplicate,
    )).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("retains an explicitly overridden duplicate after a refreshed preview", () => {
    expect(reconcileSelection(
      { selected: [0, 1], duplicateOverrides: [1] },
      refreshedPreviewWithRowOneNowDuplicate,
    )).toEqual({
      selected: [0, 1],
      duplicateOverrides: [1],
    });
  });
});
```

- [ ] **Step 2: Write failing UI markup/source tests**

Extend the import page test:

```ts
expect(formSource).toContain("Upload JSON");
expect(formSource).toContain("Paste JSON");
expect(formSource).toContain("Validate and preview");
expect(formSource).toContain("Import selected questions");
expect(formSource).toContain("Include duplicates");
expect(formSource).toContain("file.size");
expect(formSource).toContain("MAX_QUESTION_IMPORT_BYTES");
expect(formSource).toContain("role=\"alert\"");
expect(formSource).toContain("role=\"status\"");
expect(formSource).toContain("aria-label={`Import row ${row.sourceIndex + 1}`}");
expect(formSource).toContain("previewHeadingRef");
expect(formSource).toContain("conflictAlertRef");
expect(formSource).toContain("router.push");
expect(formSource).toContain("tab=questions");
expect(formSource).toContain("imported=");
```

Render the initial form and assert labels, file input, textarea, example guidance,
and disabled confirm button.

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-import-selection.test.ts \
  tests/modules/certdrill/question-import-page.test.ts
```

Expected: FAIL because selection helpers and the client form do not exist.

- [ ] **Step 4: Implement pure selection state**

Create:

```ts
import type {
  QuestionImportPreviewResult,
  QuestionImportPreviewRow,
} from "./question-import-types";

export type QuestionImportSelection = {
  selected: number[];
  duplicateOverrides: number[];
};

function sorted(values: Iterable<number>) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function isDuplicate(row: QuestionImportPreviewRow) {
  return row.duplicate.existingQuestionIds.length > 0
    || row.duplicate.earlierSourceIndexes.length > 0;
}

export function initialQuestionImportSelection(
  preview: QuestionImportPreviewResult,
): QuestionImportSelection {
  return {
    selected: preview.rows
      .filter((row) => row.selectedByDefault)
      .map((row) => row.sourceIndex),
    duplicateOverrides: [],
  };
}

export function toggleQuestionImportRow(
  state: QuestionImportSelection,
  row: QuestionImportPreviewRow,
  checked: boolean,
): QuestionImportSelection {
  if (!row.valid) return state;
  const selected = new Set(state.selected);
  const overrides = new Set(state.duplicateOverrides);
  if (checked) {
    selected.add(row.sourceIndex);
    if (isDuplicate(row)) overrides.add(row.sourceIndex);
  } else {
    selected.delete(row.sourceIndex);
    overrides.delete(row.sourceIndex);
  }
  return {
    selected: sorted(selected),
    duplicateOverrides: sorted(overrides),
  };
}

export function includeAllDuplicateRows(
  state: QuestionImportSelection,
  preview: QuestionImportPreviewResult,
  checked: boolean,
) {
  return preview.rows
    .filter((row) => row.valid && isDuplicate(row))
    .reduce(
      (current, row) => toggleQuestionImportRow(current, row, checked),
      state,
    );
}
```

- [ ] **Step 5: Expand the client import form into the review workflow**

Modify the existing `"use client"` component to use this state:

```ts
const [mode, setMode] = useState<"upload" | "paste">("upload");
const [rawJson, setRawJson] = useState("");
const [preview, setPreview] = useState<QuestionImportPreviewResult>();
const [selection, setSelection] = useState<QuestionImportSelection>({
  selected: [],
  duplicateOverrides: [],
});
const [message, setMessage] = useState<string>();
const [operation, setOperation] = useState<"preview" | "confirm">();
const previewHeadingRef = useRef<HTMLHeadingElement>(null);
const conflictAlertRef = useRef<HTMLDivElement>(null);
const router = useRouter();
```

File handling must capture values before awaiting:

```ts
async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  if (file.size > MAX_QUESTION_IMPORT_BYTES) {
    setMessage("Question import JSON must not exceed 5 MB.");
    return;
  }
  const text = await file.text();
  setRawJson(text);
  setPreview(undefined);
  setSelection({ selected: [], duplicateOverrides: [] });
  setMessage(undefined);
}
```

Preview:

```ts
async function handlePreview() {
  setOperation("preview");
  setMessage(undefined);
  const result = await previewQuestionImportAction({
    certificationId,
    rawJson,
  });
  setOperation(undefined);
  if (result.status === "error") {
    setMessage(result.message);
    return;
  }
  setPreview(result.preview);
  setSelection(initialQuestionImportSelection(result.preview));
  requestAnimationFrame(() => previewHeadingRef.current?.focus());
}
```

Confirm:

```ts
async function handleConfirm() {
  if (!preview || selection.selected.length === 0) return;
  setOperation("confirm");
  setMessage(undefined);
  const result = await confirmQuestionImportAction({
    certificationId,
    rawJson,
    previewDocumentHash: preview.documentHash,
    selectedSourceIndexes: selection.selected,
    duplicateOverrideSourceIndexes: selection.duplicateOverrides,
  });
  setOperation(undefined);

  if (result.status === "error") {
    setMessage(result.message);
    return;
  }
  if (result.status === "conflict") {
    setPreview(result.preview);
    setSelection((current) => reconcileSelection(current, result.preview));
    setMessage(result.message);
    requestAnimationFrame(() => conflictAlertRef.current?.focus());
    return;
  }

  router.push(
    `/admin/certdrill/${certificationId}?tab=questions&imported=${result.importedCount}`,
  );
  router.refresh();
}
```

Add `reconcileSelection` to the selection module:

```ts
export function reconcileSelection(
  state: QuestionImportSelection,
  preview: QuestionImportPreviewResult,
): QuestionImportSelection {
  const rowsByIndex = new Map(
    preview.rows.map((row) => [row.sourceIndex, row]),
  );
  const previousOverrides = new Set(state.duplicateOverrides);
  const selected = state.selected.filter((sourceIndex) => {
    const row = rowsByIndex.get(sourceIndex);
    if (!row?.valid) return false;
    return !isDuplicate(row) || previousOverrides.has(sourceIndex);
  });
  const selectedSet = new Set(selected);
  const duplicateOverrides = state.duplicateOverrides.filter((sourceIndex) => {
    const row = rowsByIndex.get(sourceIndex);
    return selectedSet.has(sourceIndex)
      && row !== undefined
      && isDuplicate(row);
  });
  return {
    selected: sorted(selected),
    duplicateOverrides: sorted(duplicateOverrides),
  };
}
```

Add these derived values before the return:

```ts
const duplicateRows = preview?.rows.filter((row) => (
  row.valid && (
    row.duplicate.existingQuestionIds.length > 0
    || row.duplicate.earlierSourceIndexes.length > 0
  )
)) ?? [];
const allDuplicatesIncluded = duplicateRows.length > 0
  && duplicateRows.every((row) => (
    selection.selected.includes(row.sourceIndex)
    && selection.duplicateOverrides.includes(row.sourceIndex)
  ));
```

Replace the return block with:

```tsx
return (
  <div className="space-y-6" aria-busy={operation !== undefined}>
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as "upload" | "paste")}
    >
      <TabsList aria-label="Question import input">
        <TabsTrigger value="upload">Upload JSON</TabsTrigger>
        <TabsTrigger value="paste">Paste JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="upload" className="space-y-2">
        <Label htmlFor="question-import-file">Question import file</Label>
        <input
          id="question-import-file"
          type="file"
          accept=".json,application/json"
          disabled={operation !== undefined}
          onChange={handleFileChange}
        />
        <p className="text-sm text-muted-foreground">
          Choose a JSON file up to 5 MB. Its content remains editable below.
        </p>
      </TabsContent>
      <TabsContent value="paste">
        <p className="text-sm text-muted-foreground">
          Paste a canonical version 1 question import document below.
        </p>
      </TabsContent>
    </Tabs>

    <div className="space-y-2">
      <Label htmlFor="question-import-json">Question import JSON</Label>
      <Textarea
        id="question-import-json"
        value={rawJson}
        rows={18}
        disabled={operation !== undefined}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setRawJson(value);
          setPreview(undefined);
          setSelection({ selected: [], duplicateOverrides: [] });
          setMessage(undefined);
        }}
      />
    </div>

    {message ? (
      <div ref={conflictAlertRef} role="alert" tabIndex={-1}>
        {message}
      </div>
    ) : null}

    <Button
      type="button"
      disabled={operation !== undefined}
      onClick={handlePreview}
    >
      {operation === "preview" ? "Validating..." : "Validate and preview"}
    </Button>

    {preview ? (
      <section className="space-y-4" aria-labelledby="question-import-preview">
        <h2
          ref={previewHeadingRef}
          id="question-import-preview"
          tabIndex={-1}
          className="text-lg font-semibold"
        >
          Import preview
        </h2>

        <div role="status" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>Submitted: {preview.totals.submitted}</div>
          <div>Valid: {preview.totals.valid}</div>
          <div>Invalid: {preview.totals.invalid}</div>
          <div>Existing duplicates: {preview.totals.duplicateExisting}</div>
          <div>Batch duplicates: {preview.totals.duplicateBatch}</div>
          <div>Selected: {selection.selected.length}</div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="question-import-duplicates"
            checked={allDuplicatesIncluded}
            disabled={duplicateRows.length === 0 || operation !== undefined}
            onCheckedChange={(checked) => setSelection((current) =>
              includeAllDuplicateRows(current, preview, checked === true))}
          />
          <Label htmlFor="question-import-duplicates">
            Include duplicates
          </Label>
          <span className="text-sm text-muted-foreground">
            Selecting this permits intentional duplicate questions.
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Import</th>
                <th className="p-3">Row</th>
                <th className="p-3">Category</th>
                <th className="p-3">Stem</th>
                <th className="p-3">Difficulty</th>
                <th className="p-3">Answers</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => {
                const duplicate = row.duplicate.existingQuestionIds.length > 0
                  || row.duplicate.earlierSourceIndexes.length > 0;
                return (
                  <tr key={row.sourceIndex} className="border-b align-top">
                    <td className="p-3">
                      <Checkbox
                        aria-label={`Import row ${row.sourceIndex + 1}`}
                        checked={selection.selected.includes(row.sourceIndex)}
                        disabled={!row.valid || operation !== undefined}
                        onCheckedChange={(checked) => setSelection((current) =>
                          toggleQuestionImportRow(
                            current,
                            row,
                            checked === true,
                          ))}
                      />
                    </td>
                    <td className="p-3">{row.sourceIndex + 1}</td>
                    <td className="p-3">{row.categoryCode || "—"}</td>
                    <td className="min-w-72 p-3">{row.stem || "—"}</td>
                    <td className="p-3">{row.difficulty}</td>
                    <td className="p-3">{row.answerCount}</td>
                    <td className="space-y-2 p-3">
                      <div>{row.valid ? "Valid" : "Invalid"}</div>
                      {duplicate ? <div>Duplicate review required</div> : null}
                      {row.duplicate.existingQuestionIds.map((id) => (
                        <LocalizedLink
                          key={id}
                          href={questionEditorHref(certificationId, id)}
                          className="block underline"
                        >
                          Existing question {id.split("-")[0]}
                        </LocalizedLink>
                      ))}
                      {row.duplicate.earlierSourceIndexes.length > 0 ? (
                        <div>
                          Earlier rows:{" "}
                          {row.duplicate.earlierSourceIndexes
                            .map((index) => index + 1)
                            .join(", ")}
                        </div>
                      ) : null}
                      {row.errors.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {row.errors.map((error) => (
                            <li key={`${error.field}:${error.message}`}>
                              {error.field}: {error.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div role="status">{selection.selected.length} questions selected.</div>
        <Button
          type="button"
          disabled={operation !== undefined || selection.selected.length === 0}
          onClick={handleConfirm}
        >
          {operation === "confirm"
            ? "Importing..."
            : "Import selected questions"}
        </Button>
      </section>
    ) : null}
  </div>
);
```

Import `Checkbox`, `Label`, `Link as LocalizedLink` from
`@/i18n/navigation`, `questionEditorHref`,
`includeAllDuplicateRows`, `initialQuestionImportSelection`,
`reconcileSelection`, and `toggleQuestionImportRow`. All async event handlers
must capture event values before awaiting.

- [ ] **Step 6: Run UI and selection tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-import-selection.test.ts \
  tests/modules/certdrill/question-import-actions.test.ts \
  tests/modules/certdrill/question-import-page.test.ts \
  tests/components/certdrill-admin-page-copy.test.ts
bun run --cwd apps/admin typecheck
```

Expected: all selected tests and typecheck PASS.

- [ ] **Step 7: Commit the import UI**

```bash
git add \
  apps/admin/src/modules/certdrill/question-import-selection.ts \
  apps/admin/src/modules/certdrill/question-import-form.tsx \
  apps/admin/tests/modules/certdrill/question-import-selection.test.ts \
  apps/admin/tests/modules/certdrill/question-import-page.test.ts
git commit -m "feat: review and confirm question imports" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 7: Verify the Complete Import Workflow

**Files:**
- Verify all files changed in Tasks 1–6.

- [ ] **Step 1: Run focused API tests**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-import.test.ts \
  tests/modules/certdrill/question-import-service.test.ts \
  tests/modules/certdrill/admin-service.test.ts \
  tests/modules/certdrill/validation.test.ts \
  tests/certdrill.admin.routes.test.ts \
  tests/app.authz.functional.test.ts
```

Expected: all selected tests PASS, including the existing admin authentication
and trusted-Origin coverage that protects every mounted CertDrill admin route.

- [ ] **Step 2: Run focused admin and shared-package tests**

Run:

```bash
bun run --cwd packages/frontend-shared test -- tests/api-client.test.ts
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/modules/certdrill/question-import-actions.test.ts \
  tests/modules/certdrill/question-import-selection.test.ts \
  tests/modules/certdrill/question-import-page.test.ts \
  tests/modules/certdrill/question-answer-fields.test.ts \
  tests/modules/certdrill/question-answer-state.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts \
  tests/modules/certdrill/question-form-editor.test.ts \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/lib/server-api-client.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 3: Run full relevant suites and typechecks**

Run:

```bash
bun run --cwd apps/admin test
bun run --cwd packages/frontend-shared test
bun run --cwd apps/admin typecheck
bun run --cwd apps/api typecheck
bun run --cwd packages/frontend-shared typecheck
```

Expected: all commands exit successfully.

The full API suite still has two pre-existing TOTP expectation failures. Do not
change unrelated auth configuration; rely on the focused API import,
CertDrill-route, admin-service, and validation suites.

- [ ] **Step 4: Run changed-file lint**

From `apps/admin`:

```bash
bunx eslint \
  src/lib/api/certdrill.server.ts \
  src/modules/certdrill/admin-page.tsx \
  src/modules/certdrill/question-editor-href.ts \
  src/modules/certdrill/question-import-actions.ts \
  src/modules/certdrill/question-import-form.tsx \
  src/modules/certdrill/question-import-page.tsx \
  src/modules/certdrill/question-import-selection.ts \
  src/modules/certdrill/question-import-types.ts \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/modules/certdrill/question-import-actions.test.ts \
  tests/modules/certdrill/question-import-page.test.ts \
  tests/modules/certdrill/question-import-selection.test.ts \
  --max-warnings=0
```

Expected: zero warnings.

- [ ] **Step 5: Inspect final scope**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff --name-status
```

Confirm:

- No migration files.
- No Export implementation.
- No persistent import-job tables.
- No automatic publishing.
- Every imported question is forced Draft/AI.
- Import button appears only on certification Questions.
- Other untracked plan files remain untouched.

- [ ] **Step 6: Commit verification corrections only if needed**

If verification required in-scope corrections:

```bash
git add \
  packages/frontend-shared/src/api-client.ts \
  packages/frontend-shared/tests/api-client.test.ts \
  apps/api/src/modules/certdrill/admin-service.ts \
  apps/api/src/modules/certdrill/question-import.ts \
  apps/api/src/modules/certdrill/question-import-service.ts \
  apps/api/src/modules/certdrill/routes.ts \
  apps/api/tests/certdrill.admin.routes.test.ts \
  apps/api/tests/modules/certdrill/admin-service.test.ts \
  apps/api/tests/modules/certdrill/question-import.test.ts \
  apps/api/tests/modules/certdrill/question-import-service.test.ts \
  apps/admin/src/lib/api/certdrill.server.ts \
  apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/src/modules/certdrill/question-editor-href.ts \
  apps/admin/src/modules/certdrill/question-import-actions.ts \
  apps/admin/src/modules/certdrill/question-import-form.tsx \
  apps/admin/src/modules/certdrill/question-import-page.tsx \
  apps/admin/src/modules/certdrill/question-import-selection.ts \
  apps/admin/src/modules/certdrill/question-import-types.ts \
  apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/certdrill/[certificationId]/page.tsx \
  apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/certdrill/[certificationId]/questions/import/page.tsx \
  apps/admin/public/question-import-example.json \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts \
  apps/admin/tests/modules/certdrill/question-import-actions.test.ts \
  apps/admin/tests/modules/certdrill/question-import-page.test.ts \
  apps/admin/tests/modules/certdrill/question-import-selection.test.ts
git commit -m "test: verify question import workflow" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

Do not create an empty commit.
