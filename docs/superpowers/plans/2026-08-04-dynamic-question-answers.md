# Dynamic Question Answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed four-answer question editor with a stable, validated editor supporting two to ten answers without changing the persisted question API shape.

**Architecture:** Introduce a pure keyed-answer form parser and a pure editor-state module, then make validation, navigation, server actions, and the client editor consume those shared contracts. The API continues accepting `options[]`, but its schemas and publish validation enforce the two-to-ten option boundary independently.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Radix UI Tabs, Zod, Hono, Vitest, Bun workspaces.

---

## File Structure

### Create

- `apps/admin/src/modules/certdrill/question-answer-fields.ts`
  - Defines stable answer-key rules, keyed form field names, and pure FormData parsing.
- `apps/admin/src/modules/certdrill/question-answer-state.ts`
  - Defines pure initialization, add, update, selection, and removal state transitions.
- `apps/admin/tests/modules/certdrill/question-answer-fields.test.ts`
  - Covers structural parsing, malformed keys, duplicate keys, unknown fields, and option ordering.
- `apps/admin/tests/modules/certdrill/question-answer-state.test.ts`
  - Covers two/ten limits, legacy loading, add/remove confirmation, and correct-answer clearing.
- `apps/api/src/modules/certdrill/question-schemas.ts`
  - Owns reusable question option/create/update Zod schemas.
- `apps/api/tests/modules/certdrill/question-schemas.test.ts`
  - Covers two-to-ten option API bounds.

### Modify

- `apps/admin/src/modules/certdrill/question-form-validation.ts`
  - Validates keyed dynamic answers and maps errors to stable fields.
- `apps/admin/src/modules/certdrill/admin-actions.ts`
  - Converts keyed answers into the existing API `options[]` payload.
- `apps/admin/src/modules/certdrill/question-form-navigation.ts`
  - Maps stable-key fields to answer tabs and DOM IDs.
- `apps/admin/src/modules/certdrill/question-form.tsx`
  - Renders dynamic answer tabs, add/remove controls, confirmation, and keyed form fields.
- `apps/admin/tests/modules/certdrill/question-form-validation.test.ts`
  - Replaces fixed option tests with keyed 2–10 answer tests.
- `apps/admin/tests/modules/certdrill/question-form-actions.test.ts`
  - Verifies keyed answers become ordered API options.
- `apps/admin/tests/modules/certdrill/question-form-navigation.test.ts`
  - Verifies stable-key tab and field mapping.
- `apps/admin/tests/modules/certdrill/question-form-editor.test.ts`
  - Verifies dynamic markup and wiring.
- `apps/api/src/modules/certdrill/routes.ts`
  - Imports the extracted question schemas.
- `apps/api/src/modules/certdrill/validation.ts`
  - Adds the maximum-ten publish check.
- `apps/api/tests/modules/certdrill/validation.test.ts`
  - Covers publish rejection above ten options.

## Task 1: Parse Stable Keyed Answer Fields

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-answer-fields.ts`
- Create: `apps/admin/tests/modules/certdrill/question-answer-fields.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `question-answer-fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  answerFieldName,
  parseQuestionAnswerFields,
} from "../../../src/modules/certdrill/question-answer-fields";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  Object.entries(entries).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe("question answer fields", () => {
  it("parses ordered keyed answers and the correct answer", () => {
    const result = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-b",
      "answer.answer-a.text": "First",
      "answer.answer-a.explanation": "First explanation",
      "answer.answer-a.citationUrls": "https://example.com/a",
      "answer.answer-b.text": "Second",
      correctAnswerKey: "answer-b",
    }));

    expect(result.fieldErrors).toEqual({});
    expect(result.answers).toEqual([
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
    ]);
    expect(result.correctAnswerKey).toBe("answer-b");
  });

  it("rejects fewer than two and more than ten keys", () => {
    expect(parseQuestionAnswerFields(formData({
      answerKeys: "answer-a",
      "answer.answer-a.text": "Only",
    })).fieldErrors.options).toEqual(["Add between 2 and 10 answers."]);

    const keys = Array.from({ length: 11 }, (_, index) => `answer-${index}`);
    expect(parseQuestionAnswerFields(formData({
      answerKeys: keys.join(","),
    })).fieldErrors.options).toEqual(["Add between 2 and 10 answers."]);
  });

  it("rejects duplicate and malformed keys", () => {
    const result = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-a,bad.key",
    }));

    expect(result.fieldErrors.options).toEqual([
      "Answer keys must be unique.",
      "Answer key \"bad.key\" is invalid.",
    ]);
  });

  it("rejects unknown keyed fields and an unknown correct key", () => {
    const result = parseQuestionAnswerFields(formData({
      answerKeys: "answer-a,answer-b",
      "answer.answer-a.text": "First",
      "answer.answer-b.text": "Second",
      "answer.answer-c.text": "Unexpected",
      correctAnswerKey: "answer-c",
    }));

    expect(result.fieldErrors.options).toContain(
      "Answer fields reference unknown key \"answer-c\".",
    );
    expect(result.fieldErrors.correctAnswerKey).toEqual([
      "Select a correct answer from the submitted answers.",
    ]);
  });

  it("builds stable keyed field names", () => {
    expect(answerFieldName("answer-a", "text"))
      .toBe("answer.answer-a.text");
    expect(answerFieldName("answer-a", "citationUrls"))
      .toBe("answer.answer-a.citationUrls");
  });
});
```

- [ ] **Step 2: Run the parser test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-answer-fields.test.ts
```

Expected: FAIL because `question-answer-fields.ts` does not exist.

- [ ] **Step 3: Implement the pure keyed parser**

Create `question-answer-fields.ts`:

```ts
export const MIN_QUESTION_ANSWERS = 2;
export const MAX_QUESTION_ANSWERS = 10;

export type QuestionAnswerField = "text" | "explanation" | "citationUrls";

export type ParsedQuestionAnswer = {
  key: string;
  text: string;
  explanation: string;
  citationUrls: string[];
};

export type ParsedQuestionAnswerFields = {
  answerKeys: string[];
  answers: ParsedQuestionAnswer[];
  correctAnswerKey: string;
  fieldErrors: Record<string, string[]>;
};

const answerKeyPattern = /^answer-[A-Za-z0-9_-]+$/;
const answerFieldPattern =
  /^answer\.([A-Za-z0-9_-]+)\.(text|explanation|citationUrls)$/;

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function csvValues(formData: FormData, name: string) {
  return stringValue(formData, name)
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function addError(
  fieldErrors: Record<string, string[]>,
  fieldName: string,
  message: string,
) {
  fieldErrors[fieldName] = [...(fieldErrors[fieldName] ?? []), message];
}

export function answerFieldName(
  answerKey: string,
  field: QuestionAnswerField,
) {
  return `answer.${answerKey}.${field}`;
}

export function parseQuestionAnswerFields(
  formData: FormData,
): ParsedQuestionAnswerFields {
  const fieldErrors: Record<string, string[]> = {};
  const answerKeys = stringValue(formData, "answerKeys")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const uniqueKeys = new Set(answerKeys);

  if (
    answerKeys.length < MIN_QUESTION_ANSWERS
    || answerKeys.length > MAX_QUESTION_ANSWERS
  ) {
    addError(fieldErrors, "options", "Add between 2 and 10 answers.");
  }
  if (uniqueKeys.size !== answerKeys.length) {
    addError(fieldErrors, "options", "Answer keys must be unique.");
  }
  answerKeys.forEach((key) => {
    if (!answerKeyPattern.test(key)) {
      addError(fieldErrors, "options", `Answer key "${key}" is invalid.`);
    }
  });

  for (const name of formData.keys()) {
    const match = name.match(answerFieldPattern);
    if (match && !uniqueKeys.has(match[1] ?? "")) {
      addError(
        fieldErrors,
        "options",
        `Answer fields reference unknown key "${match[1]}".`,
      );
    }
  }

  const correctAnswerKey = stringValue(formData, "correctAnswerKey");
  if (correctAnswerKey && !uniqueKeys.has(correctAnswerKey)) {
    addError(
      fieldErrors,
      "correctAnswerKey",
      "Select a correct answer from the submitted answers.",
    );
  }

  return {
    answerKeys,
    answers: answerKeys.map((key) => ({
      key,
      text: stringValue(formData, answerFieldName(key, "text")),
      explanation: stringValue(
        formData,
        answerFieldName(key, "explanation"),
      ),
      citationUrls: csvValues(
        formData,
        answerFieldName(key, "citationUrls"),
      ),
    })),
    correctAnswerKey,
    fieldErrors,
  };
}
```

- [ ] **Step 4: Run the parser tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-answer-fields.test.ts
```

Expected: all parser tests PASS.

- [ ] **Step 5: Commit the keyed parser**

```bash
git add \
  apps/admin/src/modules/certdrill/question-answer-fields.ts \
  apps/admin/tests/modules/certdrill/question-answer-fields.test.ts
git commit -m "feat: parse keyed question answers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 2: Use Keyed Answers in Validation and Server Actions

**Files:**
- Modify: `apps/admin/src/modules/certdrill/question-form-validation.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Modify: `apps/admin/tests/modules/certdrill/question-form-validation.test.ts`
- Modify: `apps/admin/tests/modules/certdrill/question-form-actions.test.ts`

- [ ] **Step 1: Replace fixed-option validation fixtures**

In both test files, add:

```ts
function answerEntries(
  answers: Array<{
    key: string;
    text?: string;
    explanation?: string;
    citationUrls?: string;
  }>,
  correctAnswerKey = "",
) {
  return Object.fromEntries([
    ["answerKeys", answers.map((answer) => answer.key).join(",")],
    ["correctAnswerKey", correctAnswerKey],
    ...answers.flatMap((answer) => [
      [`answer.${answer.key}.text`, answer.text ?? ""],
      [`answer.${answer.key}.explanation`, answer.explanation ?? ""],
      [`answer.${answer.key}.citationUrls`, answer.citationUrls ?? ""],
    ]),
  ]);
}
```

Replace fixed `option0Text` fixtures with keyed fixtures. Add validation tests:

```ts
it("requires text for every visible draft answer", () => {
  const result = validateQuestionForm(questionFormData({
    categoryId,
    stem: "Draft question",
    status: "draft",
    ...answerEntries([
      { key: "answer-a", text: "First" },
      { key: "answer-b", text: "" },
    ]),
  }));

  expect(result.fieldErrors["answer.answer-b.text"]).toEqual([
    "Add answer text for answer 2.",
  ]);
});

it("accepts ten draft answers without a correct selection", () => {
  const answers = Array.from({ length: 10 }, (_, index) => ({
    key: `answer-${index}`,
    text: `Answer ${index + 1}`,
  }));

  expect(validateQuestionForm(questionFormData({
    categoryId,
    stem: "Ten-answer question",
    status: "draft",
    ...answerEntries(answers),
  }))).toEqual({ valid: true, fieldErrors: {} });
});
```

Update published tests to use `correctAnswerKey`.

- [ ] **Step 2: Add an action payload regression**

Add to `question-form-actions.test.ts`:

```ts
it("creates ordered API options from keyed answers", async () => {
  createQuestion.mockResolvedValueOnce({});

  await createCertDrillQuestionAction(
    initialQuestionFormActionState,
    formData({
      certificationId,
      categoryId,
      stem: "Question?",
      status: "draft",
      ...answerEntries([
        { key: "answer-z", text: "First" },
        { key: "answer-a", text: "Second" },
        { key: "answer-q", text: "Third" },
      ], "answer-a"),
    }),
  );

  expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
    options: [
      expect.objectContaining({
        text: "First",
        isCorrect: false,
        sortOrder: 0,
      }),
      expect.objectContaining({
        text: "Second",
        isCorrect: true,
        sortOrder: 1,
      }),
      expect.objectContaining({
        text: "Third",
        isCorrect: false,
        sortOrder: 2,
      }),
    ],
  }));
});
```

- [ ] **Step 3: Run tests and verify fixed-slot behavior fails**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts
```

Expected: FAIL because validation and actions still read `option0...option3`.

- [ ] **Step 4: Update shared validation**

Import:

```ts
import {
  answerFieldName,
  parseQuestionAnswerFields,
} from "./question-answer-fields";
```

Replace fixed option parsing with:

```ts
const parsedAnswers = parseQuestionAnswerFields(formData);
Object.entries(parsedAnswers.fieldErrors).forEach(([fieldName, messages]) => {
  messages.forEach((message) => addError(fieldErrors, fieldName, message));
});

for (const [index, answer] of parsedAnswers.answers.entries()) {
  const answerNumber = index + 1;
  if (!answer.text) {
    addError(
      fieldErrors,
      answerFieldName(answer.key, "text"),
      `Add answer text for answer ${answerNumber}.`,
    );
  }

  answer.citationUrls.forEach((url, citationIndex) => {
    if (!isSafeCitationUrl(url)) {
      addError(
        fieldErrors,
        answerFieldName(answer.key, "citationUrls"),
        `Answer ${answerNumber} citation URL ${citationIndex + 1} must use http, https, or mailto.`,
      );
    }
  });
}
```

For published status:

```ts
const selectedCorrectAnswer = parsedAnswers.answers.find(
  (answer) => answer.key === parsedAnswers.correctAnswerKey,
);
if (!selectedCorrectAnswer?.text) {
  addError(
    fieldErrors,
    "correctAnswerKey",
    "Select a correct answer that has answer text.",
  );
}

for (const [index, answer] of parsedAnswers.answers.entries()) {
  const answerNumber = index + 1;
  if (!answer.explanation) {
    addError(
      fieldErrors,
      answerFieldName(answer.key, "explanation"),
      `Add an explanation for answer ${answerNumber}.`,
    );
  }
  if (answer.citationUrls.length === 0) {
    addError(
      fieldErrors,
      answerFieldName(answer.key, "citationUrls"),
      `Add at least one citation URL for answer ${answerNumber}.`,
    );
  }
}
```

Remove all `[0, 1, 2, 3]`, `correctOption`, and `option${index}` logic.

- [ ] **Step 5: Update server action option conversion**

Replace `questionOptions` with:

```ts
function questionOptions(
  formData: FormData,
): CertDrillAdminQuestionOptionInput[] {
  const parsed = parseQuestionAnswerFields(formData);

  return parsed.answers.map((answer, index) => ({
    text: answer.text,
    isCorrect: parsed.correctAnswerKey === answer.key,
    explanation: answer.explanation,
    citationUrls: answer.citationUrls,
    sortOrder: index,
  }));
}

function submittedQuestionOptions(formData: FormData) {
  if (!formData.has("answerKeys")) return undefined;
  return questionOptions(formData);
}
```

Import `parseQuestionAnswerFields` in `admin-actions.ts`.

- [ ] **Step 6: Run validation and action tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-answer-fields.test.ts \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit validation and action integration**

```bash
git add \
  apps/admin/src/modules/certdrill/admin-actions.ts \
  apps/admin/src/modules/certdrill/question-form-validation.ts \
  apps/admin/tests/modules/certdrill/question-form-actions.test.ts \
  apps/admin/tests/modules/certdrill/question-form-validation.test.ts
git commit -m "feat: validate dynamic question answers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 3: Enforce API Answer Bounds

**Files:**
- Create: `apps/api/src/modules/certdrill/question-schemas.ts`
- Create: `apps/api/tests/modules/certdrill/question-schemas.test.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/api/src/modules/certdrill/validation.ts`
- Modify: `apps/api/tests/modules/certdrill/validation.test.ts`

- [ ] **Step 1: Write failing schema and publish tests**

Create `question-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  questionCreateSchema,
  questionUpdateSchema,
} from "../../../src/modules/certdrill/question-schemas";

const ids = {
  certification: "11111111-1111-4111-8111-111111111111",
  category: "22222222-2222-4222-8222-222222222222",
};

function options(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    text: `Answer ${index + 1}`,
    isCorrect: index === 0,
    explanation: "Explanation",
    citationUrls: ["https://example.com"],
    sortOrder: index,
  }));
}

describe("question schemas", () => {
  it("accepts two and ten answers", () => {
    expect(questionCreateSchema.safeParse({
      certificationId: ids.certification,
      categoryId: ids.category,
      stem: "Question",
      options: options(2),
    }).success).toBe(true);
    expect(questionCreateSchema.safeParse({
      certificationId: ids.certification,
      categoryId: ids.category,
      stem: "Question",
      options: options(10),
    }).success).toBe(true);
  });

  it("rejects one and eleven answers when options are submitted", () => {
    expect(questionCreateSchema.safeParse({
      certificationId: ids.certification,
      categoryId: ids.category,
      stem: "Question",
      options: options(1),
    }).success).toBe(false);
    expect(questionUpdateSchema.safeParse({
      options: options(11),
    }).success).toBe(false);
  });
});
```

Add to `validation.test.ts`:

```ts
it("rejects more than ten answer options for publishing", () => {
  const options = Array.from({ length: 11 }, (_, index) => ({
    isCorrect: index === 0,
    explanation: "Explanation",
    citationUrls: ["https://example.com"],
    mediaAssets: [],
  }));

  expect(validateQuestionForPublish({
    mediaAssets: [],
    options,
  }).errors).toContain(
    "Published questions must have at most ten answer options.",
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-schemas.test.ts \
  tests/modules/certdrill/validation.test.ts
```

Expected: FAIL because schemas are inline and publish validation has no maximum.

- [ ] **Step 3: Extract bounded question schemas**

Create `question-schemas.ts`:

```ts
import { z } from "zod";

import { isSafeCitationUrl } from "./validation";

const mediaAssetSchema = z.object({
  url: z.string().url(),
  mimeType: z.string().optional(),
  mime_type: z.string().optional(),
});

export const questionOptionSchema = z.object({
  text: z.string().min(1),
  mediaAssets: z.array(mediaAssetSchema).optional(),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
  citationUrls: z.array(z.string().url().refine(isSafeCitationUrl)).optional(),
  sortOrder: z.number().int().optional(),
});

export const questionCreateSchema = z.object({
  certificationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  stem: z.string().min(1),
  mediaAssets: z.array(mediaAssetSchema).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  createdBy: z.enum(["ai", "admin"]).optional(),
  sourceResourceId: z.string().uuid().nullable().optional(),
  generationJobId: z.string().uuid().nullable().optional(),
  options: z.array(questionOptionSchema).min(2).max(10).optional(),
});

export const questionUpdateSchema = questionCreateSchema
  .omit({ certificationId: true, createdBy: true })
  .partial();
```

In `routes.ts`, delete the old inline media/question schemas and import:

```ts
import {
  questionCreateSchema,
  questionUpdateSchema,
} from "./question-schemas";
```

Also remove the now-unused `isSafeCitationUrl` import from `routes.ts`.

- [ ] **Step 4: Add maximum publish validation**

In `validateQuestionForPublish`:

```ts
if (input.options.length > 10) {
  errors.push("Published questions must have at most ten answer options.");
}
```

Place it immediately after the minimum check.

- [ ] **Step 5: Run API tests**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-schemas.test.ts \
  tests/modules/certdrill/validation.test.ts \
  tests/modules/certdrill/admin-service.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit API bounds**

```bash
git add \
  apps/api/src/modules/certdrill/question-schemas.ts \
  apps/api/src/modules/certdrill/routes.ts \
  apps/api/src/modules/certdrill/validation.ts \
  apps/api/tests/modules/certdrill/question-schemas.test.ts \
  apps/api/tests/modules/certdrill/validation.test.ts
git commit -m "feat: bound certdrill answer counts" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 4: Navigate Stable Keyed Answer Errors

**Files:**
- Modify: `apps/admin/src/modules/certdrill/question-form-navigation.ts`
- Modify: `apps/admin/tests/modules/certdrill/question-form-navigation.test.ts`

- [ ] **Step 1: Replace fixed-index navigation tests**

Use:

```ts
it("maps keyed answer fields to stable tabs", () => {
  expect(questionTabForField("answer.answer-a.explanation"))
    .toBe("answer:answer-a");
  expect(questionTabForField("answer.answer-z.citationUrls"))
    .toBe("answer:answer-z");
});

it("maps aggregate errors to overview", () => {
  expect(questionTabForField("correctAnswerKey")).toBe("overview");
  expect(questionTabForField("options")).toBe("overview");
});

it("builds stable keyed field ids", () => {
  expect(
    questionFieldId("question-create", "answer.answer-a.text"),
  ).toBe("question-create-answer-a-text");
  expect(
    questionFieldId("question-create", "correctAnswerKey"),
  ).toBe("question-create-correct-answer");
});
```

Remove fixed `option0` assertions.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-navigation.test.ts
```

Expected: FAIL because navigation only understands indexes 0–3.

- [ ] **Step 3: Implement keyed navigation**

Replace the tab type and mappings:

```ts
export type QuestionAnswerTab = "overview" | `answer:${string}`;

const answerFieldPattern =
  /^answer\.([A-Za-z0-9_-]+)\.(text|explanation|citationUrls)$/;

export function questionFieldId(idPrefix: string, fieldName: string) {
  if (fieldName === "categoryId") return `${idPrefix}-category-id`;
  if (fieldName === "stem") return `${idPrefix}-stem`;
  if (fieldName === "correctAnswerKey") {
    return `${idPrefix}-correct-answer`;
  }
  if (fieldName === "options") return `${idPrefix}-answers`;

  const match = fieldName.match(answerFieldPattern);
  if (!match) return `${idPrefix}-form`;

  const [, answerKey, field] = match;
  const suffix = field === "citationUrls" ? "citations" : field;
  return `${idPrefix}-${answerKey}-${suffix}`;
}

export function questionTabForField(
  fieldName: string,
): QuestionAnswerTab | undefined {
  if (fieldName === "correctAnswerKey" || fieldName === "options") {
    return "overview";
  }

  const match = fieldName.match(answerFieldPattern);
  return match ? `answer:${match[1]}` : undefined;
}
```

- [ ] **Step 4: Run navigation tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-navigation.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit keyed navigation**

```bash
git add \
  apps/admin/src/modules/certdrill/question-form-navigation.ts \
  apps/admin/tests/modules/certdrill/question-form-navigation.test.ts
git commit -m "feat: navigate keyed answer errors" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 5: Add Pure Dynamic Answer State

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-answer-state.ts`
- Create: `apps/admin/tests/modules/certdrill/question-answer-state.test.ts`

- [ ] **Step 1: Write state transition tests**

Create:

```ts
import { describe, expect, it } from "vitest";

import {
  addQuestionAnswer,
  cancelQuestionAnswerRemoval,
  confirmQuestionAnswerRemoval,
  createQuestionAnswerState,
  requestQuestionAnswerRemoval,
  updateQuestionAnswer,
} from "../../../src/modules/certdrill/question-answer-state";

describe("question answer state", () => {
  it("starts new questions with two blank answers", () => {
    const state = createQuestionAnswerState();
    expect(state.answers).toHaveLength(2);
    expect(state.answers.map((answer) => answer.key))
      .toEqual(["answer-0", "answer-1"]);
  });

  it("loads and orders up to ten existing answers", () => {
    const options = [13, 10, 12, 11].map((sortOrder) => ({
      text: `Answer ${sortOrder}`,
      explanation: "",
      citationUrls: [],
      isCorrect: sortOrder === 12,
      sortOrder,
    }));
    const state = createQuestionAnswerState(options);
    expect(state.answers.map((answer) => answer.text))
      .toEqual(["Answer 10", "Answer 11", "Answer 12", "Answer 13"]);
    expect(state.correctAnswerKey).toBe("answer-2");
  });

  it("adds answers until ten and reports the added key", () => {
    let state = createQuestionAnswerState();
    let addedKey: string | undefined;
    for (let index = 0; index < 8; index += 1) {
      const result = addQuestionAnswer(state);
      state = result.state;
      addedKey = result.addedKey;
    }
    expect(state.answers).toHaveLength(10);
    expect(addedKey).toBe("answer-9");
    expect(addQuestionAnswer(state).addedKey).toBeUndefined();
  });

  it("removes empty answers immediately but confirms populated answers", () => {
    const state = createQuestionAnswerState();
    expect(requestQuestionAnswerRemoval(state, "answer-1")).toMatchObject({
      removed: true,
      needsConfirmation: false,
    });

    const populated = updateQuestionAnswer(
      state,
      "answer-1",
      "text",
      "Second",
    );
    expect(requestQuestionAnswerRemoval(populated, "answer-1"))
      .toMatchObject({
        removed: false,
        needsConfirmation: true,
        state: { pendingRemovalKey: "answer-1" },
      });
  });

  it("does not remove below two and clears a removed correct answer", () => {
    const twoAnswers = createQuestionAnswerState();
    expect(confirmQuestionAnswerRemoval(twoAnswers, "answer-1").answers)
      .toHaveLength(2);

    const threeAnswers = addQuestionAnswer(twoAnswers).state;
    const selected = { ...threeAnswers, correctAnswerKey: "answer-2" };
    const removed = confirmQuestionAnswerRemoval(selected, "answer-2");
    expect(removed.answers).toHaveLength(2);
    expect(removed.correctAnswerKey).toBe("");
  });

  it("cancels populated-answer removal without changing answers", () => {
    const state = updateQuestionAnswer(
      addQuestionAnswer(createQuestionAnswerState()).state,
      "answer-2",
      "text",
      "Third",
    );
    const pending = requestQuestionAnswerRemoval(state, "answer-2").state;
    const cancelled = cancelQuestionAnswerRemoval(pending);

    expect(cancelled.answers).toEqual(state.answers);
    expect(cancelled.pendingRemovalKey).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-answer-state.test.ts
```

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement pure answer state**

Create `question-answer-state.ts` with:

```ts
import type { CertDrillAdminQuestionOptionInput } from "@/lib/api/certdrill.server";

import {
  MAX_QUESTION_ANSWERS,
  MIN_QUESTION_ANSWERS,
} from "./question-answer-fields";

export type QuestionAnswerDraft = {
  key: string;
  text: string;
  explanation: string;
  citationUrls: string;
};

export type QuestionAnswerEditorState = {
  answers: QuestionAnswerDraft[];
  correctAnswerKey: string;
  pendingRemovalKey?: string;
  nextAnswerNumber: number;
};

function blankAnswer(key: string): QuestionAnswerDraft {
  return { key, text: "", explanation: "", citationUrls: "" };
}

function orderedOptions(options: CertDrillAdminQuestionOptionInput[]) {
  return options
    .map((option, position) => ({ option, position }))
    .sort((left, right) => (
      (left.option.sortOrder ?? left.position)
      - (right.option.sortOrder ?? right.position)
      || left.position - right.position
    ))
    .slice(0, MAX_QUESTION_ANSWERS)
    .map(({ option }) => option);
}

export function createQuestionAnswerState(
  options: CertDrillAdminQuestionOptionInput[] = [],
): QuestionAnswerEditorState {
  const ordered = orderedOptions(options);
  const answers = ordered.map((option, index) => ({
    key: `answer-${index}`,
    text: option.text,
    explanation: option.explanation ?? "",
    citationUrls: option.citationUrls?.join(", ") ?? "",
  }));

  while (answers.length < MIN_QUESTION_ANSWERS) {
    answers.push(blankAnswer(`answer-${answers.length}`));
  }

  const correctIndex = ordered.findIndex(
    (option) => option.isCorrect && option.text.trim(),
  );

  return {
    answers,
    correctAnswerKey:
      correctIndex >= 0 ? answers[correctIndex]?.key ?? "" : "",
    nextAnswerNumber: answers.length,
  };
}

export function addQuestionAnswer(state: QuestionAnswerEditorState) {
  if (state.answers.length >= MAX_QUESTION_ANSWERS) {
    return { state, addedKey: undefined };
  }
  const addedKey = `answer-${state.nextAnswerNumber}`;
  return {
    state: {
      ...state,
      answers: [...state.answers, blankAnswer(addedKey)],
      nextAnswerNumber: state.nextAnswerNumber + 1,
      pendingRemovalKey: undefined,
    },
    addedKey,
  };
}

export function updateQuestionAnswer(
  state: QuestionAnswerEditorState,
  answerKey: string,
  field: "text" | "explanation" | "citationUrls",
  value: string,
) {
  return {
    ...state,
    answers: state.answers.map((answer) => (
      answer.key === answerKey ? { ...answer, [field]: value } : answer
    )),
    correctAnswerKey:
      field === "text"
      && !value.trim()
      && state.correctAnswerKey === answerKey
        ? ""
        : state.correctAnswerKey,
  };
}

function hasContent(answer: QuestionAnswerDraft) {
  return Boolean(
    answer.text.trim()
    || answer.explanation.trim()
    || answer.citationUrls.trim(),
  );
}

export function requestQuestionAnswerRemoval(
  state: QuestionAnswerEditorState,
  answerKey: string,
) {
  if (state.answers.length <= MIN_QUESTION_ANSWERS) {
    return { state, removed: false, needsConfirmation: false };
  }
  const answer = state.answers.find((item) => item.key === answerKey);
  if (!answer) {
    return { state, removed: false, needsConfirmation: false };
  }
  if (hasContent(answer)) {
    return {
      state: { ...state, pendingRemovalKey: answerKey },
      removed: false,
      needsConfirmation: true,
    };
  }
  return {
    state: confirmQuestionAnswerRemoval(state, answerKey),
    removed: true,
    needsConfirmation: false,
  };
}

export function confirmQuestionAnswerRemoval(
  state: QuestionAnswerEditorState,
  answerKey: string,
) {
  if (state.answers.length <= MIN_QUESTION_ANSWERS) return state;
  return {
    ...state,
    answers: state.answers.filter((answer) => answer.key !== answerKey),
    correctAnswerKey:
      state.correctAnswerKey === answerKey ? "" : state.correctAnswerKey,
    pendingRemovalKey: undefined,
  };
}

export function cancelQuestionAnswerRemoval(
  state: QuestionAnswerEditorState,
) {
  return { ...state, pendingRemovalKey: undefined };
}
```

- [ ] **Step 4: Run state tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-answer-state.test.ts
```

Expected: all state tests PASS.

- [ ] **Step 5: Commit state transitions**

```bash
git add \
  apps/admin/src/modules/certdrill/question-answer-state.ts \
  apps/admin/tests/modules/certdrill/question-answer-state.test.ts
git commit -m "feat: model dynamic answer editing" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 6: Render and Edit Dynamic Answer Tabs

**Files:**
- Modify: `apps/admin/src/modules/certdrill/question-form.tsx`
- Modify: `apps/admin/tests/modules/certdrill/question-form-editor.test.ts`

- [ ] **Step 1: Replace fixed-four render expectations**

Change the new-question markup test to expect:

```ts
expect(markup).toContain('name="answerKeys"');
expect(markup).toContain('value="answer-0,answer-1"');
expect(markup.match(/name="answer\.answer-[01]\.text"/g))
  .toHaveLength(2);
expect(markup.match(/name="answer\.answer-[01]\.explanation"/g))
  .toHaveLength(2);
expect(markup.match(/name="answer\.answer-[01]\.citationUrls"/g))
  .toHaveLength(2);
expect(markup.match(/name="correctAnswerKey"/g)).toHaveLength(2);
expect(markup.match(/role="tab"/g)).toHaveLength(3);
expect(markup.match(/role="tabpanel"/g)).toHaveLength(3);
expect(markup).toContain("Add answer");
expect(markup).not.toContain("Answer 3");
```

Add a ten-answer edit render test:

```ts
it("renders all ten existing answers and disables adding", () => {
  const options = Array.from({ length: 10 }, (_, index) => ({
    text: `Answer ${index + 1}`,
    explanation: "",
    citationUrls: [],
    isCorrect: index === 9,
    sortOrder: index,
  }));
  const markup = renderToStaticMarkup(createElement(QuestionForm, {
    action: harmlessAction,
    submitLabel: "Update question",
    categories,
    selectedCertificationId: categories[0].certificationId,
    idPrefix: "question-update",
    selectedQuestion: {
      id: "33333333-3333-4333-8333-333333333333",
      certificationId: categories[0].certificationId,
      categoryId: categories[0].id,
      stem: "Ten answers",
      options,
    },
  }));

  expect(markup.match(/name="answer\.answer-\d+\.text"/g))
    .toHaveLength(10);
  expect(markup).toContain("Answer 10");
  expect(markup).toMatch(/<button[^>]+disabled=""[^>]*>Add answer/);
});
```

Replace fixed source assertions with dynamic wiring assertions:

```ts
expect(questionFormSource).toContain(
  "setAnswerState(createQuestionAnswerState())",
);
expect(questionFormSource).toContain("addQuestionAnswer");
expect(questionFormSource).toContain("requestQuestionAnswerRemoval");
expect(questionFormSource).toContain("confirmQuestionAnswerRemoval");
expect(questionFormSource).toContain("cancelQuestionAnswerRemoval");
expect(questionFormSource).toContain('name="answerKeys"');
expect(questionFormSource).toContain('name="correctAnswerKey"');
expect(questionFormSource).toContain("pendingRemovalKey");
expect(questionFormSource).not.toContain("answerIndexes");
expect(questionFormSource).not.toContain("option${index}Text");
```

Replace the canonical-gap test with a contiguous keyed-rendering test. The persisted
answers are still sorted by `sortOrder`, but gaps are no longer rendered as blank
editor tabs:

```ts
it("renders persisted sort-order gaps as contiguous keyed answers", () => {
  const markup = renderToStaticMarkup(createElement(QuestionForm, {
    action: harmlessAction,
    submitLabel: "Update question",
    categories,
    selectedCertificationId: categories[0].certificationId,
    idPrefix: "question-update",
    selectedQuestion: {
      id: "33333333-3333-4333-8333-333333333333",
      certificationId: categories[0].certificationId,
      categoryId: categories[0].id,
      stem: "Saved question",
      options: [
        {
          text: "First answer",
          explanation: "First explanation",
          citationUrls: ["https://example.com/first"],
          isCorrect: false,
          sortOrder: 0,
        },
        {
          text: "Third answer",
          explanation: "Third explanation",
          citationUrls: ["https://example.com/third"],
          isCorrect: true,
          sortOrder: 2,
        },
      ],
    },
  }));

  expect(markup).toMatch(
    /<textarea[^>]+name="answer\.answer-0\.text"[^>]*>First answer<\/textarea>/,
  );
  expect(markup).toMatch(
    /<textarea[^>]+name="answer\.answer-1\.text"[^>]*>Third answer<\/textarea>/,
  );
  expect(markup).toMatch(
    /<input(?=[^>]*value="answer-1")(?=[^>]*checked="")[^>]*>/,
  );
});
```

Keep the legacy noncanonical-order test, but replace its fixed option-name loop:

```ts
for (const index of [0, 1, 2, 3]) {
  expect(markup).toMatch(
    new RegExp(
      `<textarea[^>]+name="answer\\.answer-${index}\\.text"[^>]*>` +
        `Legacy answer ${index + 1}</textarea>`,
    ),
  );
}
const correctRadio = markup.match(
  /<input[^>]*value="answer-2"[^>]*>/,
)?.[0];
expect(correctRadio).toContain('checked=""');
expect(correctRadio).not.toContain("disabled");
```

Replace the remaining fixed correct-answer and error-navigation source assertions:

```ts
expect(questionFormSource).toContain('name="correctAnswerKey"');
expect(questionFormSource).toContain(
  "checked={answerState.correctAnswerKey === answer.key}",
);
expect(questionFormSource).toContain("disabled={!answer.text.trim()}");
expect(questionFormSource).toContain(
  "activateField(answerFieldName(result.addedKey, \"text\"))",
);
expect(questionFormSource).toContain(
  "activateField(answerFieldName(answer.key, \"text\"))",
);
expect(questionFormSource).toContain(
  "setActiveTab(`answer:${nextKey}`)",
);
expect(questionFormSource).toContain(
  'input[name="correctAnswerKey"]:not(:disabled)',
);
expect(questionFormSource).not.toContain('name="correctOption"');
expect(questionFormSource).not.toContain("setCorrectOption");
expect(questionFormSource).not.toContain("setAnswers(initialAnswers())");
```

- [ ] **Step 2: Run editor tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-editor.test.ts
```

Expected: FAIL because the editor still renders four fixed answers.

- [ ] **Step 3: Replace fixed answer state**

In `question-form.tsx`, remove:

- `answerIndexes`
- `AnswerIndex`
- `AnswerValues`
- `answerOptions`
- `initialAnswers`
- `initialAnswerState`
- fixed-index update logic

Import:

```ts
import {
  addQuestionAnswer,
  cancelQuestionAnswerRemoval,
  confirmQuestionAnswerRemoval,
  createQuestionAnswerState,
  requestQuestionAnswerRemoval,
  updateQuestionAnswer,
  type QuestionAnswerEditorState,
} from "./question-answer-state";
import {
  answerFieldName,
  MAX_QUESTION_ANSWERS,
  MIN_QUESTION_ANSWERS,
} from "./question-answer-fields";
```

Initialize:

```ts
const [answerState, setAnswerState] = useState(
  () => createQuestionAnswerState(selectedQuestion?.options),
);
```

Update `resetNewQuestion`:

```ts
setAnswerState(createQuestionAnswerState());
```

- [ ] **Step 4: Add dynamic editor handlers**

Add:

```ts
function handleAddAnswer() {
  const result = addQuestionAnswer(answerState);
  setAnswerState(result.state);
  if (result.addedKey) {
    activateField(answerFieldName(result.addedKey, "text"));
  }
}

function nearestAnswerKey(
  answers: QuestionAnswerEditorState["answers"],
  removedKey: string,
) {
  const index = answers.findIndex((answer) => answer.key === removedKey);
  return answers[index + 1]?.key ?? answers[index - 1]?.key;
}

function removeAnswer(answerKey: string) {
  const nextKey = nearestAnswerKey(answerState.answers, answerKey);
  const nextState = confirmQuestionAnswerRemoval(answerState, answerKey);
  setAnswerState(nextState);
  if (nextKey) setActiveTab(`answer:${nextKey}`);
}

function handleRemoveRequest(answerKey: string) {
  const result = requestQuestionAnswerRemoval(answerState, answerKey);
  setAnswerState(result.state);
  if (result.removed) {
    const nextKey = nearestAnswerKey(answerState.answers, answerKey);
    if (nextKey) setActiveTab(`answer:${nextKey}`);
  }
}
```

Use `updateQuestionAnswer` for text/explanation/citation changes and direct state updates for correct selection.

- [ ] **Step 5: Render dynamic Overview and tabs**

Inside the Answers Card:

```tsx
<input
  type="hidden"
  name="answerKeys"
  value={answerState.answers.map((answer) => answer.key).join(",")}
/>
```

Header controls:

```tsx
<Button
  type="button"
  variant="outline"
  onClick={handleAddAnswer}
  disabled={answerState.answers.length >= MAX_QUESTION_ANSWERS}
>
  Add answer
</Button>
```

Render triggers and panels using:

```tsx
{answerState.answers.map((answer, index) => {
  const tabValue = `answer:${answer.key}` as QuestionAnswerTab;
  const hasError = Object.keys(state.fieldErrors)
    .some((fieldName) => fieldName.startsWith(`answer.${answer.key}.`));

  return (
    <TabsTrigger
      key={answer.key}
      value={tabValue}
      aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}
    >
      Answer {index + 1}
      {hasError ? <AlertCircle aria-hidden="true" /> : null}
    </TabsTrigger>
  );
})}
```

Overview radios:

```tsx
<fieldset
  id={`${idPrefix}-correct-answer`}
  tabIndex={-1}
  aria-describedby={
    overviewHasError ? `${idPrefix}-answer-errors` : undefined
  }
>
  <legend className="sr-only">Correct answer</legend>
  {answerState.answers.map((answer, index) => (
<input
  id={`${idPrefix}-correct-${answer.key}`}
  type="radio"
  name="correctAnswerKey"
  value={answer.key}
  aria-label={`Answer ${index + 1} is the correct answer`}
  checked={answerState.correctAnswerKey === answer.key}
  disabled={!answer.text.trim()}
  onChange={() => setAnswerState({
    ...answerState,
    correctAnswerKey: answer.key,
  })}
/>
  ))}
</fieldset>
```

Render each Overview summary as a button before its radio. This keeps the stable
key internal while displaying current order and opens/focuses the selected answer:

```tsx
<Button
  type="button"
  variant="ghost"
  className="min-w-0 justify-start text-left"
  onClick={() => activateField(answerFieldName(answer.key, "text"))}
>
  <span className="font-medium">Answer {index + 1}</span>
  <span className="truncate">
    {answer.text.trim() || "Not entered"}
  </span>
  <span className="text-muted-foreground">
    {answer.text.trim() ? "Entered" : "Empty"}
  </span>
</Button>
```

Each panel uses:

```tsx
<MarkdownTextarea
  id={`${idPrefix}-${answer.key}-text`}
  name={answerFieldName(answer.key, "text")}
  label={`Answer ${index + 1} text`}
  value={answer.text}
  onChange={(event) => setAnswerState(updateQuestionAnswer(
    answerState,
    answer.key,
    "text",
    event.currentTarget.value,
  ))}
  errorMessages={fieldErrors(
    state,
    answerFieldName(answer.key, "text"),
  )}
/>
```

Apply the same keyed pattern to explanation and citations.

- [ ] **Step 6: Add removal controls and inline confirmation**

In every Answer panel:

```tsx
<Button
  type="button"
  variant="destructive"
  onClick={() => handleRemoveRequest(answer.key)}
  disabled={answerState.answers.length <= MIN_QUESTION_ANSWERS}
>
  Remove answer
</Button>
```

When pending:

```tsx
{answerState.pendingRemovalKey === answer.key ? (
  <div role="alert" className="rounded-md border border-destructive/50 p-3">
    <p>This answer contains content. Remove it permanently?</p>
    <div className="mt-3 flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => setAnswerState(
          cancelQuestionAnswerRemoval(answerState),
        )}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        onClick={() => removeAnswer(answer.key)}
      >
        Remove answer
      </Button>
    </div>
  </div>
) : null}
```

Keep every `TabsContent` force-mounted with `data-[state=inactive]:hidden`.

- [ ] **Step 7: Update correct-answer focus fallback**

Handle correct-answer validation before the generic DOM target so focus lands on
the first enabled radio. Fall back to the aggregate fieldset when every answer is
empty:

```ts
if (fieldToFocus === "correctAnswerKey") {
  const correctAnswerInput = document
    .getElementById(`${idPrefix}-form`)
    ?.querySelector<HTMLInputElement>(
      'input[name="correctAnswerKey"]:not(:disabled)',
    );
  const correctAnswerGroup = document.getElementById(
    `${idPrefix}-correct-answer`,
  );
  (correctAnswerInput ?? correctAnswerGroup)?.focus();
  setFieldToFocus(undefined);
  return;
}
```

Keep the existing generic `questionFieldId` lookup for all other fields.

- [ ] **Step 8: Run focused dynamic editor tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-answer-fields.test.ts \
  tests/modules/certdrill/question-answer-state.test.ts \
  tests/modules/certdrill/question-form-navigation.test.ts \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts \
  tests/modules/certdrill/question-form-editor.test.ts
bun run --cwd apps/admin typecheck
```

Expected: all selected tests and typecheck PASS.

- [ ] **Step 9: Commit the dynamic UI**

```bash
git add \
  apps/admin/src/modules/certdrill/question-form.tsx \
  apps/admin/tests/modules/certdrill/question-form-editor.test.ts
git commit -m "feat: edit dynamic question answers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

## Task 7: Verify Dynamic Answer Integration

**Files:**
- Verify all files changed in Tasks 1–6.

- [ ] **Step 1: Run all focused admin tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/components/certdrill-questions-index.test.ts \
  tests/modules/certdrill/question-answer-fields.test.ts \
  tests/modules/certdrill/question-answer-state.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts \
  tests/modules/certdrill/question-form-editor.test.ts \
  tests/modules/certdrill/question-form-navigation.test.ts \
  tests/modules/certdrill/question-form-shell.test.ts \
  tests/modules/certdrill/question-form-state.test.ts \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-pagination.test.ts \
  tests/modules/certdrill/questions-index-filter-bar.test.ts \
  tests/modules/certdrill/questions-index-page.test.ts \
  tests/modules/certdrill/questions-index-query.test.ts \
  tests/modules/certdrill/questions-index-search-draft.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run focused API tests**

Run:

```bash
bun run --cwd apps/api test -- \
  tests/modules/certdrill/question-schemas.test.ts \
  tests/modules/certdrill/validation.test.ts \
  tests/modules/certdrill/admin-service.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 3: Run complete admin tests and typechecks**

Run:

```bash
bun run --cwd apps/admin test && \
bun run --cwd apps/admin typecheck && \
bun run --cwd apps/api typecheck
```

Expected: all commands exit successfully.

- [ ] **Step 4: Run changed-file lint**

From `apps/admin`:

```bash
bunx eslint \
  src/modules/certdrill/admin-actions.ts \
  src/modules/certdrill/question-answer-fields.ts \
  src/modules/certdrill/question-answer-state.ts \
  src/modules/certdrill/question-form-navigation.ts \
  src/modules/certdrill/question-form-validation.ts \
  src/modules/certdrill/question-form.tsx \
  tests/modules/certdrill/question-answer-fields.test.ts \
  tests/modules/certdrill/question-answer-state.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts \
  tests/modules/certdrill/question-form-editor.test.ts \
  tests/modules/certdrill/question-form-navigation.test.ts \
  tests/modules/certdrill/question-form-validation.test.ts \
  --max-warnings=0
```

Expected: ESLint exits successfully with zero warnings.

- [ ] **Step 5: Inspect final scope**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected:

- No whitespace errors.
- No database migrations.
- No import/export implementation.
- No filtering, sorting, pagination, row-action, or route behavior changes.
- Any pre-existing untracked plan files remain untouched.

- [ ] **Step 6: Commit only verification corrections if needed**

If verification required in-scope corrections, stage the exact corrected files and commit:

```bash
git commit -m "test: cover dynamic question answers" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
```

Do not create an empty commit.
