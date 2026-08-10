# Question Editor Focused Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded CertDrill question form with an accessible focused-tab editor, preserve the existing validation work and source-resource relationship, and display compact question IDs in admin question tables.

**Architecture:** Keep data loading in the existing server page and move the complete question form into a focused client component that owns answer values, tab state, correct-answer selection, and field focus. Extend the existing action-state shell with a render-prop interface so the editor receives structured server errors, while pure navigation and ID-formatting helpers keep behavior directly testable.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Radix UI Tabs, Tailwind CSS, server actions with `useActionState`, Vitest, Bun workspaces.

---

## File Structure

### Create

- `apps/admin/src/modules/certdrill/question-id.ts`
  - Formats full question UUIDs for compact visual display without changing identifiers.
- `apps/admin/src/modules/certdrill/question-form-navigation.ts`
  - Maps validation fields to editor tabs and DOM field IDs.
- `apps/admin/src/modules/certdrill/question-form.tsx`
  - Owns the focused Question details and Answers tab UI.
- `apps/admin/tests/modules/certdrill/question-id.test.ts`
  - Covers UUID compaction and non-UUID fallback behavior.
- `apps/admin/tests/modules/certdrill/question-form-navigation.test.ts`
  - Covers field-to-tab and field-to-ID navigation behavior.
- `apps/admin/tests/modules/certdrill/question-form-editor.test.ts`
  - Protects the focused editor structure and accessibility contract.

### Modify

- `apps/admin/src/modules/certdrill/question-form-validation.ts`
  - Requires at least two answer texts for drafts and rejects supporting content without answer text.
- `apps/admin/src/modules/certdrill/question-form-shell.tsx`
  - Exposes action state to the client editor and routes summary-link clicks through tab activation.
- `apps/admin/src/modules/certdrill/markdown.tsx`
  - Adds a reusable Markdown textarea without a preview panel.
- `apps/admin/src/modules/certdrill/admin-page.tsx`
  - Uses the focused form, removes the inline editor, and compacts drill-specific table IDs.
- `apps/admin/src/modules/certdrill/questions-index-table.tsx`
  - Compacts centralized question IDs while retaining the full accessible identifier.
- `apps/admin/tests/modules/certdrill/question-form-validation.test.ts`
  - Replaces the permissive draft expectation with the approved two-answer requirement.
- `apps/admin/tests/modules/certdrill/question-form-actions.test.ts`
  - Supplies valid draft answers and verifies the server action payload.
- `apps/admin/tests/modules/certdrill/question-form-shell.test.ts`
  - Covers render-prop state and error-link activation.
- `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
  - Replaces preview/source-control expectations with focused-editor wiring expectations.
- `apps/admin/tests/components/certdrill-questions-index.test.ts`
  - Verifies compact centralized IDs.
- `apps/api/src/modules/certdrill/validation.ts`
  - Retains the existing uncommitted minimum-two-options publish guard.
- `apps/api/tests/modules/certdrill/validation.test.ts`
  - Retains the existing publish regression test.

## Task 1: Finish the Shared Draft Validation Baseline

**Files:**
- Modify: `apps/admin/src/modules/certdrill/question-form-validation.ts`
- Modify: `apps/admin/tests/modules/certdrill/question-form-validation.test.ts`
- Modify: `apps/admin/tests/modules/certdrill/question-form-actions.test.ts`
- Preserve: `apps/api/src/modules/certdrill/validation.ts`
- Preserve: `apps/api/tests/modules/certdrill/validation.test.ts`

- [ ] **Step 1: Replace the permissive draft test with the approved requirement**

In `apps/admin/tests/modules/certdrill/question-form-validation.test.ts`, replace `allows an incomplete answer set when saving a draft` with:

```ts
it("requires at least two answer texts when saving a draft", () => {
  const result = validateQuestionForm(questionFormData({
    categoryId,
    stem: "Draft question",
    status: "draft",
    option0Text: "Only answer",
  }));

  expect(result.valid).toBe(false);
  expect(result.fieldErrors.options).toEqual([
    "Add at least two answer options.",
  ]);
});

it("allows a draft without a correct-answer selection", () => {
  const result = validateQuestionForm(questionFormData({
    categoryId,
    stem: "Draft question",
    status: "draft",
    option0Text: "First answer",
    option1Text: "Second answer",
  }));

  expect(result).toEqual({ valid: true, fieldErrors: {} });
});

it("rejects an explanation without answer text", () => {
  const result = validateQuestionForm(questionFormData({
    categoryId,
    stem: "Draft question",
    status: "draft",
    option0Text: "First answer",
    option1Text: "Second answer",
    option2Explanation: "Orphan explanation",
  }));

  expect(result.fieldErrors.option2Text).toEqual([
    "Add answer text for option 3.",
  ]);
});
```

- [ ] **Step 2: Update action tests so valid drafts include two answers**

In `apps/admin/tests/modules/certdrill/question-form-actions.test.ts`, import `updateCertDrillQuestionAction`, add a `questionId`, and replace valid draft form data with:

```ts
const questionId = "44444444-4444-4444-8444-444444444444";

const validDraft = {
  certificationId,
  categoryId,
  stem: "Question?",
  status: "draft",
  option0Text: "First answer",
  option1Text: "Second answer",
};
```

Use `validDraft` in the API-error and successful-create tests. Add:

```ts
it("creates a draft with two answer options and no implicit correct answer", async () => {
  createQuestion.mockResolvedValueOnce({});

  await createCertDrillQuestionAction(
    initialQuestionFormActionState,
    formData(validDraft),
  );

  expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
    options: [
      expect.objectContaining({ text: "First answer", isCorrect: false }),
      expect.objectContaining({ text: "Second answer", isCorrect: false }),
    ],
  }));
});

it("preserves a submitted source resource when updating", async () => {
  updateQuestion.mockResolvedValueOnce({});
  const sourceResourceId = "55555555-5555-4555-8555-555555555555";

  await updateCertDrillQuestionAction(
    initialQuestionFormActionState,
    formData({ ...validDraft, questionId, sourceResourceId }),
  );

  expect(updateQuestion).toHaveBeenCalledWith(
    questionId,
    expect.objectContaining({ sourceResourceId }),
  );
});
```

- [ ] **Step 3: Run the focused tests and verify the new draft test fails**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts
```

Expected: FAIL because a draft with fewer than two populated answer texts is currently valid.

- [ ] **Step 4: Enforce the answer minimum for every status**

In `validateQuestionForm`, calculate populated options before the publish-only block:

```ts
const populatedOptions = options.filter((option) => option.text);

if (populatedOptions.length < 2) {
  addError(fieldErrors, "options", "Add at least two answer options.");
}

if (status === "published") {
  const selectedCorrectOption = /^[0-3]$/.test(correctOption)
    ? options[Number(correctOption)]
    : undefined;
```

Remove the old publish-only minimum:

```ts
if (populatedOptions.length < 2) {
  addError(fieldErrors, "options", "Add at least two answer options before publishing.");
}
```

Keep the existing supporting-content check and publish-only explanation, citation, and correct-answer checks unchanged.

- [ ] **Step 5: Run admin and API validation tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts && \
bun run --cwd apps/api test -- tests/modules/certdrill/validation.test.ts
```

Expected: all selected tests PASS, including the API minimum-two-options publish regression.

- [ ] **Step 6: Commit the completed validation baseline**

```bash
git add \
  apps/admin/src/modules/certdrill/question-form-validation.ts \
  apps/admin/src/modules/certdrill/question-form-state.ts \
  apps/admin/src/modules/certdrill/admin-actions.ts \
  apps/admin/tests/modules/certdrill/question-form-validation.test.ts \
  apps/admin/tests/modules/certdrill/question-form-state.test.ts \
  apps/admin/tests/modules/certdrill/question-form-actions.test.ts \
  apps/api/src/modules/certdrill/validation.ts \
  apps/api/tests/modules/certdrill/validation.test.ts
git commit -m "feat: validate certdrill question drafts"
```

## Task 2: Compact Question IDs in Both Admin Tables

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-id.ts`
- Create: `apps/admin/tests/modules/certdrill/question-id.test.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/src/modules/certdrill/questions-index-table.tsx`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
- Modify: `apps/admin/tests/components/certdrill-questions-index.test.ts`

- [ ] **Step 1: Write direct tests for compact ID formatting**

Create `apps/admin/tests/modules/certdrill/question-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { compactQuestionId } from "@/modules/certdrill/question-id";

describe("compactQuestionId", () => {
  it("returns the first UUID sequence", () => {
    expect(compactQuestionId("f59b5caa-dc5a-4d79-9ba8-b81643c1ef9f"))
      .toBe("f59b5caa");
  });

  it("uses the first segment of a legacy identifier", () => {
    expect(compactQuestionId("legacy-id")).toBe("legacy");
  });
});
```

Use `"legacy-id" -> "legacy"` deliberately: the display rule is the first hyphen-delimited sequence for every identifier.

- [ ] **Step 2: Add table source expectations**

In `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`, add:

```ts
it("shows compact question IDs while retaining the full accessible ID", () => {
  expect(source).toContain("compactQuestionId(question.id)");
  expect(source).toContain("aria-label={`Open question ${question.id}`}");
});
```

In `apps/admin/tests/components/certdrill-questions-index.test.ts`, add:

```ts
it("shows a compact ID with the full identifier available to assistive technology", () => {
  expect(tableSource).toContain("compactQuestionId(question.questionId)");
  expect(tableSource).toContain("Question ID {question.questionId}");
  expect(tableSource).toContain('aria-hidden="true"');
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-id.test.ts \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/components/certdrill-questions-index.test.ts
```

Expected: FAIL because `compactQuestionId` and compact table rendering do not exist.

- [ ] **Step 4: Add the formatter**

Create `apps/admin/src/modules/certdrill/question-id.ts`:

```ts
export function compactQuestionId(questionId: string) {
  return questionId.split("-", 1)[0] ?? questionId;
}
```

- [ ] **Step 5: Use compact visual IDs without changing links or action payloads**

In `admin-page.tsx`, import `compactQuestionId` and change the drill-specific ID cell to:

```tsx
<TableCell className="font-mono text-xs">
  <LocalizedLink
    href={questionHref(question)}
    aria-label={`Open question ${question.id}`}
    className="hover:underline"
  >
    {compactQuestionId(question.id)}
  </LocalizedLink>
</TableCell>
```

In `questions-index-table.tsx`, import `compactQuestionId` and replace the full-ID paragraph with:

```tsx
<p className="font-mono text-xs text-muted-foreground">
  <span className="sr-only">Question ID {question.questionId}</span>
  <span aria-hidden="true">{compactQuestionId(question.questionId)}</span>
</p>
```

Do not change `questionHref`, `questionEditorHref`, row keys, hidden inputs, or action props.

- [ ] **Step 6: Run the compact-ID tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-id.test.ts \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/components/certdrill-questions-index.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit compact IDs**

```bash
git add \
  apps/admin/src/modules/certdrill/question-id.ts \
  apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/src/modules/certdrill/questions-index-table.tsx \
  apps/admin/tests/modules/certdrill/question-id.test.ts \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts \
  apps/admin/tests/components/certdrill-questions-index.test.ts
git commit -m "feat: compact admin question ids"
```

## Task 3: Add a Preview-Free Markdown Field

**Files:**
- Modify: `apps/admin/src/modules/certdrill/markdown.tsx`
- Create: `apps/admin/tests/modules/certdrill/question-form-editor.test.ts`

- [ ] **Step 1: Add the Markdown field source contract**

Create `apps/admin/tests/modules/certdrill/question-form-editor.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const markdownSource = readSource(
  "../../../src/modules/certdrill/markdown.tsx",
);
const formSource = readSource(
  "../../../src/modules/certdrill/question-form.tsx",
);

describe("focused question editor source", () => {
  it("provides a Markdown textarea without requiring a preview", () => {
    expect(markdownSource).toContain("export function MarkdownTextarea(");
    expect(markdownSource).toContain("Markdown supported");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-editor.test.ts
```

Expected: FAIL because `MarkdownTextarea` is not exported.

- [ ] **Step 3: Add the preview-free Markdown textarea**

In `markdown.tsx`, add this export above `MarkdownTextareaWithPreview`:

```tsx
type MarkdownTextareaProps = ComponentProps<typeof Textarea> & {
  id: string;
  label: string;
  helperText?: string;
  errorMessages?: string[];
};

export function MarkdownTextarea({
  id,
  label,
  helperText,
  errorMessages = [],
  className,
  required,
  ...props
}: MarkdownTextareaProps) {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const describedBy = [
    errorMessages.length > 0 ? errorId : undefined,
    helperText ? helperId : undefined,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}
        </Label>
        <span className="text-xs text-muted-foreground">Markdown supported</span>
      </div>
      <Textarea
        id={id}
        className={className}
        required={required}
        aria-invalid={errorMessages.length > 0 || undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {errorMessages.length > 0 ? (
        <div id={errorId} className="space-y-1 text-sm text-destructive">
          {errorMessages.map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}
      {helperText ? (
        <p id={helperId} className="text-xs text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
}
```

Keep `MarkdownTextareaWithPreview` and `MarkdownPreview` unchanged for other application surfaces.

- [ ] **Step 4: Run the focused Markdown test**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-editor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the reusable field**

```bash
git add \
  apps/admin/src/modules/certdrill/markdown.tsx \
  apps/admin/tests/modules/certdrill/question-form-editor.test.ts
git commit -m "feat: add focused markdown textarea"
```

## Task 4: Add Error-to-Tab Navigation

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-form-navigation.ts`
- Create: `apps/admin/tests/modules/certdrill/question-form-navigation.test.ts`
- Modify: `apps/admin/src/modules/certdrill/question-form-shell.tsx`
- Modify: `apps/admin/tests/modules/certdrill/question-form-shell.test.ts`

- [ ] **Step 1: Write navigation helper tests**

Create `apps/admin/tests/modules/certdrill/question-form-navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  firstQuestionFieldError,
  questionFieldId,
  questionTabForField,
} from "@/modules/certdrill/question-form-navigation";

describe("question form navigation", () => {
  it("maps answer fields and aggregate answer errors to tabs", () => {
    expect(questionTabForField("option2Explanation")).toBe("answer-2");
    expect(questionTabForField("option0CitationUrls")).toBe("answer-0");
    expect(questionTabForField("correctOption")).toBe("overview");
    expect(questionTabForField("options")).toBe("overview");
    expect(questionTabForField("stem")).toBeUndefined();
  });

  it("maps validation fields to stable DOM IDs", () => {
    expect(questionFieldId("question-editor", "option3Text"))
      .toBe("question-editor-option-3-text");
    expect(questionFieldId("question-editor", "correctOption"))
      .toBe("question-editor-correct-option-0");
    expect(questionFieldId("question-editor", "options"))
      .toBe("question-editor-answers");
  });

  it("returns the first field containing an error", () => {
    expect(firstQuestionFieldError({
      option1Text: ["Required"],
      option2Explanation: ["Required"],
    })).toBe("option1Text");
    expect(firstQuestionFieldError({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Extend the shell source test**

Add to `question-form-shell.test.ts`:

```ts
it("exposes action state and lets the editor activate linked fields", () => {
  expect(source).toContain("children(state)");
  expect(source).toContain("onFieldErrorLink");
  expect(source).toContain("event.preventDefault()");
  expect(source).toContain("onFieldErrorLink(fieldName)");
});
```

- [ ] **Step 3: Run the navigation and shell tests and verify failure**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-navigation.test.ts \
  tests/modules/certdrill/question-form-shell.test.ts
```

Expected: FAIL because the navigation helper and shell interface do not exist.

- [ ] **Step 4: Create the pure navigation helper**

Create `question-form-navigation.ts`:

```ts
import type { QuestionFormFieldErrors } from "./question-form-validation";

export type QuestionAnswerTab =
  | "overview"
  | "answer-0"
  | "answer-1"
  | "answer-2"
  | "answer-3";

export function questionFieldId(idPrefix: string, fieldName: string) {
  if (fieldName === "categoryId") return `${idPrefix}-category-id`;
  if (fieldName === "stem") return `${idPrefix}-stem`;
  if (fieldName === "correctOption") return `${idPrefix}-correct-option-0`;
  if (fieldName === "options") return `${idPrefix}-answers`;

  const match = fieldName.match(
    /^option([0-3])(Text|Explanation|CitationUrls)$/,
  );
  if (!match) return `${idPrefix}-form`;

  const [, index, suffix] = match;
  const fieldSuffix = suffix === "Text"
    ? "text"
    : suffix === "Explanation"
      ? "explanation"
      : "citations";
  return `${idPrefix}-option-${index}-${fieldSuffix}`;
}

export function questionTabForField(
  fieldName: string,
): QuestionAnswerTab | undefined {
  if (fieldName === "options" || fieldName === "correctOption") {
    return "overview";
  }

  const match = fieldName.match(/^option([0-3])/);
  return match ? `answer-${match[1]}` as QuestionAnswerTab : undefined;
}

export function firstQuestionFieldError(
  fieldErrors: QuestionFormFieldErrors,
) {
  return Object.keys(fieldErrors)[0];
}
```

- [ ] **Step 5: Update the shell to expose state and handle error links**

Replace the shell-local `questionFieldId` with an import from `question-form-navigation.ts`.

Change the shell props and child rendering to:

```tsx
type QuestionFormChildren =
  | ReactNode
  | ((state: QuestionFormActionState) => ReactNode);

export function QuestionFormShell({
  action,
  submitLabel,
  idPrefix,
  onFieldErrorLink,
  children,
}: {
  action: QuestionFormAction;
  submitLabel: string;
  idPrefix: string;
  onFieldErrorLink?: (fieldName: string) => void;
  children: QuestionFormChildren;
}) {
  const [state, formAction] = useActionState(
    action,
    initialQuestionFormActionState,
  );
  const fieldErrors = Object.entries(state.fieldErrors);

  return (
    <form id={`${idPrefix}-form`} action={formAction} className="space-y-4" noValidate>
      {/* Keep the existing alert and success blocks. */}
      {state.status === "error" ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold">Question could not be saved.</p>
          {state.formError ? <p className="mt-1">{state.formError}</p> : null}
          {fieldErrors.length > 0 ? (
            <>
              <p className="mt-1">Please correct the following:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {fieldErrors.flatMap(([fieldName, messages]) => messages.map((message) => {
                  const fieldId = questionFieldId(idPrefix, fieldName);
                  return (
                    <li key={`${fieldName}-${message}`}>
                      <a
                        className="underline underline-offset-2"
                        href={`#${fieldId}`}
                        onClick={(event) => {
                          if (!onFieldErrorLink) return;
                          event.preventDefault();
                          onFieldErrorLink(fieldName);
                        }}
                      >
                        {message}
                      </a>
                    </li>
                  );
                }))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {state.status === "success" && state.message ? (
        <div role="status" className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm">
          {state.message}
        </div>
      ) : null}
      {typeof children === "function" ? children(state) : children}
      <SubmitButton label={submitLabel} />
    </form>
  );
}
```

- [ ] **Step 6: Run navigation and shell tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-navigation.test.ts \
  tests/modules/certdrill/question-form-shell.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit navigation support**

```bash
git add \
  apps/admin/src/modules/certdrill/question-form-navigation.ts \
  apps/admin/src/modules/certdrill/question-form-shell.tsx \
  apps/admin/tests/modules/certdrill/question-form-navigation.test.ts \
  apps/admin/tests/modules/certdrill/question-form-shell.test.ts
git commit -m "feat: navigate question form errors"
```

## Task 5: Build the Focused Question Form

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-form.tsx`
- Modify: `apps/admin/tests/modules/certdrill/question-form-editor.test.ts`

- [ ] **Step 1: Add focused-editor source expectations**

Extend `question-form-editor.test.ts`:

```ts
it("renders overview and four answer tabs", () => {
  expect(formSource).toContain('"use client"');
  expect(formSource).toContain('useState<QuestionAnswerTab>("overview")');
  expect(formSource).toContain("Overview");
  expect(formSource).toContain("Answer {index + 1}");
  expect(formSource).toContain("TabsContent");
  expect(formSource).toContain("forceMount");
});

it("uses Markdown for Stem, answer text, and explanation without previews", () => {
  expect(formSource).toContain('label="Stem"');
  expect(formSource).toContain('label={`Answer ${index + 1} text`}');
  expect(formSource).toContain('label={`Answer ${index + 1} explanation`}');
  expect(formSource).toContain("<MarkdownTextarea");
  expect(formSource).not.toContain("MarkdownTextareaWithPreview");
  expect(formSource).not.toContain("Stem preview");
  expect(formSource).not.toContain("Explanation preview");
});

it("preserves source resources without showing source controls", () => {
  expect(formSource).toContain('type="hidden"');
  expect(formSource).toContain('name="sourceResourceId"');
  expect(formSource).not.toContain("Source resource ID");
  expect(formSource).not.toContain("Clear source resource");
});

it("keeps one optional correct answer and disables empty choices", () => {
  expect(formSource).toContain('name="correctOption"');
  expect(formSource).toContain("checked={correctOption === String(index)}");
  expect(formSource).toContain("disabled={!answer.text.trim()}");
  expect(formSource).not.toContain("selectedCorrectOption ?? 0");
});

it("marks invalid answer tabs and activates the first invalid field", () => {
  expect(formSource).toContain("questionTabForField");
  expect(formSource).toContain("firstQuestionFieldError");
  expect(formSource).toContain('aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}');
  expect(formSource).toContain("document.getElementById");
  expect(formSource).toContain(".focus()");
});
```

- [ ] **Step 2: Run the editor test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-editor.test.ts
```

Expected: FAIL because `question-form.tsx` does not exist.

- [ ] **Step 3: Create the focused client form**

Create `question-form.tsx` with this public interface and state model:

```tsx
"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from "react";
import { AlertCircle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  CertDrillAdminCategory,
  CertDrillAdminQuestion,
} from "@/lib/api/certdrill.server";

import { MarkdownTextarea } from "./markdown";
import {
  firstQuestionFieldError,
  questionFieldId,
  questionTabForField,
  type QuestionAnswerTab,
} from "./question-form-navigation";
import { QuestionFormShell } from "./question-form-shell";
import type { QuestionFormActionState } from "./question-form-state";

type QuestionFormAction = (
  previousState: QuestionFormActionState,
  formData: FormData,
) => Promise<QuestionFormActionState>;

type AnswerValue = {
  text: string;
  explanation: string;
  citationUrls: string;
};

const answerIndexes = [0, 1, 2, 3] as const;
type AnswerIndex = typeof answerIndexes[number];
type AnswerValues = Record<AnswerIndex, AnswerValue>;

function answerValue(
  question: CertDrillAdminQuestion | undefined,
  index: AnswerIndex,
): AnswerValue {
    const option = question?.options?.[index];
    return {
      text: option?.text ?? "",
      explanation: option?.explanation ?? "",
      citationUrls: option?.citationUrls?.join(", ") ?? "",
    };
}

function initialAnswers(question?: CertDrillAdminQuestion): AnswerValues {
  return {
    0: answerValue(question, 0),
    1: answerValue(question, 1),
    2: answerValue(question, 2),
    3: answerValue(question, 3),
  };
}

function fieldErrors(
  state: QuestionFormActionState,
  fieldName: string,
) {
  return state.fieldErrors[fieldName] ?? [];
}

function answerHasError(
  state: QuestionFormActionState,
  index: number,
) {
  return Object.keys(state.fieldErrors)
    .some((fieldName) => fieldName.startsWith(`option${index}`));
}

export function QuestionForm({
  action,
  submitLabel,
  categories,
  selectedCertificationId,
  selectedQuestion,
  idPrefix,
}: {
  action: QuestionFormAction;
  submitLabel: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedQuestion?: CertDrillAdminQuestion;
  idPrefix: string;
}) {
  const [activeTab, setActiveTab] =
    useState<QuestionAnswerTab>("overview");
  const [answers, setAnswers] =
    useState(() => initialAnswers(selectedQuestion));
  const selectedCorrectOption =
    selectedQuestion?.options?.findIndex((option) => option.isCorrect) ?? -1;
  const [correctOption, setCorrectOption] = useState(
    selectedCorrectOption >= 0 ? String(selectedCorrectOption) : "",
  );
  const [fieldToFocus, setFieldToFocus] = useState<string>();

  function activateField(fieldName: string) {
    const tab = questionTabForField(fieldName);
    if (tab) setActiveTab(tab);
    setFieldToFocus(fieldName);
  }

  useEffect(() => {
    if (!fieldToFocus) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(questionFieldId(idPrefix, fieldToFocus))
        ?.focus();
      setFieldToFocus(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, fieldToFocus, idPrefix]);

  function updateAnswer(
    index: AnswerIndex,
    key: keyof AnswerValue,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const value = event.currentTarget.value;
    setAnswers((current) => ({
      ...current,
      [index]: { ...current[index], [key]: value },
    }));
    if (key === "text" && !value.trim() && correctOption === String(index)) {
      setCorrectOption("");
    }
  }

  return (
    <QuestionFormShell
      action={action}
      submitLabel={submitLabel}
      idPrefix={idPrefix}
      onFieldErrorLink={activateField}
    >
      {(state) => (
        <QuestionFormContents
          state={state}
          idPrefix={idPrefix}
          categories={categories}
          selectedCertificationId={selectedCertificationId}
          selectedQuestion={selectedQuestion}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          answers={answers}
          updateAnswer={updateAnswer}
          correctOption={correctOption}
          setCorrectOption={setCorrectOption}
          activateField={activateField}
        />
      )}
    </QuestionFormShell>
  );
}
```

In the same file, add `QuestionFormContents`. It must activate the first invalid field once per new error state and render Question details:

```tsx
function QuestionFormContents({
  state,
  idPrefix,
  categories,
  selectedCertificationId,
  selectedQuestion,
  activeTab,
  setActiveTab,
  answers,
  updateAnswer,
  correctOption,
  setCorrectOption,
  activateField,
}: {
  state: QuestionFormActionState;
  idPrefix: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedQuestion?: CertDrillAdminQuestion;
  activeTab: QuestionAnswerTab;
  setActiveTab: (tab: QuestionAnswerTab) => void;
  answers: AnswerValues;
  updateAnswer: (
    index: AnswerIndex,
    key: keyof AnswerValue,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  correctOption: string;
  setCorrectOption: (value: string) => void;
  activateField: (fieldName: string) => void;
}) {
  useEffect(() => {
    if (state.status !== "error") return;
    const firstField = firstQuestionFieldError(state.fieldErrors);
    if (firstField) activateField(firstField);
  }, [state, activateField]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="certificationId" value={selectedCertificationId} />
      {selectedQuestion ? (
        <>
          <input type="hidden" name="questionId" value={selectedQuestion.id} />
          {selectedQuestion.sourceResourceId ? (
            <input
              type="hidden"
              name="sourceResourceId"
              value={selectedQuestion.sourceResourceId}
            />
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Question details</CardTitle>
          <CardDescription>Choose the category and define the question prompt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QuestionSelect
            id={`${idPrefix}-category-id`}
            name="categoryId"
            label="Category"
            required
            defaultValue={selectedQuestion?.categoryId ?? ""}
            errorMessages={fieldErrors(state, "categoryId")}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.code} - {category.name}
              </option>
            ))}
          </QuestionSelect>
          <MarkdownTextarea
            id={`${idPrefix}-stem`}
            name="stem"
            label="Stem"
            required
            className="min-h-40"
            placeholder="Which option best answers the scenario?"
            defaultValue={selectedQuestion?.stem}
            helperText="Question stem is required. Markdown is supported."
            errorMessages={fieldErrors(state, "stem")}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <QuestionSelect
              id={`${idPrefix}-difficulty`}
              name="difficulty"
              label="Difficulty"
              defaultValue={selectedQuestion?.difficulty ?? "medium"}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </QuestionSelect>
            <QuestionSelect
              id={`${idPrefix}-status`}
              name="status"
              label="Status"
              defaultValue={selectedQuestion?.status ?? "draft"}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </QuestionSelect>
          </div>
        </CardContent>
      </Card>

      <AnswerTabs
        state={state}
        idPrefix={idPrefix}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        answers={answers}
        updateAnswer={updateAnswer}
        correctOption={correctOption}
        setCorrectOption={setCorrectOption}
      />
    </div>
  );
}
```

Use `useCallback` for `activateField` before finalizing this file so the validation effect does not re-run on every render:

```tsx
const activateField = useCallback((fieldName: string) => {
  const tab = questionTabForField(fieldName);
  if (tab) setActiveTab(tab);
  setFieldToFocus(fieldName);
}, []);
```

Add `useCallback` to the React import.

- [ ] **Step 4: Add the Overview and answer tabs**

In the same file, add:

```tsx
function AnswerTabs({
  state,
  idPrefix,
  activeTab,
  setActiveTab,
  answers,
  updateAnswer,
  correctOption,
  setCorrectOption,
}: {
  state: QuestionFormActionState;
  idPrefix: string;
  activeTab: QuestionAnswerTab;
  setActiveTab: (tab: QuestionAnswerTab) => void;
  answers: AnswerValues;
  updateAnswer: (
    index: AnswerIndex,
    key: keyof AnswerValue,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  correctOption: string;
  setCorrectOption: (value: string) => void;
}) {
  return (
    <Card id={`${idPrefix}-answers`}>
      <CardHeader>
        <CardTitle>Answers</CardTitle>
        <CardDescription>
          Add at least two answers. Select the correct answer before publishing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as QuestionAnswerTab)}
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="overview">
                Overview
                {(fieldErrors(state, "options").length > 0
                  || fieldErrors(state, "correctOption").length > 0) ? (
                  <AlertCircle aria-hidden="true" className="text-destructive" />
                ) : null}
              </TabsTrigger>
              {answerIndexes.map((index) => {
                const hasError = answerHasError(state, index);
                return (
                  <TabsTrigger
                    key={index}
                    value={`answer-${index}`}
                    aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}
                  >
                    Answer {index + 1}
                    {hasError ? <AlertCircle aria-hidden="true" className="text-destructive" /> : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="overview" forceMount className="space-y-3 pt-3">
            {fieldErrors(state, "options").map((message) => (
              <p key={message} className="text-sm text-destructive">{message}</p>
            ))}
            {fieldErrors(state, "correctOption").map((message) => (
              <p key={message} className="text-sm text-destructive">{message}</p>
            ))}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Correct answer</legend>
              {answerIndexes.map((index) => {
                const answer = answers[index];
                const entered = Boolean(answer?.text.trim());
                return (
                  <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <input
                      id={`${idPrefix}-correct-option-${index}`}
                      type="radio"
                      name="correctOption"
                      value={String(index)}
                      checked={correctOption === String(index)}
                      disabled={!answer.text.trim()}
                      onChange={() => setCorrectOption(String(index))}
                    />
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => setActiveTab(`answer-${index}`)}
                    >
                      <span className="block font-medium">Answer {index + 1}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {entered ? answer.text : "Not entered"}
                      </span>
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {entered ? "Entered" : "Empty"}
                    </span>
                  </div>
                );
              })}
            </fieldset>
          </TabsContent>

          {answerIndexes.map((index) => {
            const answer = answers[index];
            return (
              <TabsContent key={index} value={`answer-${index}`} forceMount className="space-y-4 pt-3">
                <MarkdownTextarea
                  id={`${idPrefix}-option-${index}-text`}
                  name={`option${index}Text`}
                  label={`Answer ${index + 1} text`}
                  className="min-h-32"
                  value={answer.text}
                  onChange={(event) => updateAnswer(index, "text", event)}
                  helperText="At least two answer texts are required."
                  errorMessages={fieldErrors(state, `option${index}Text`)}
                />
                <MarkdownTextarea
                  id={`${idPrefix}-option-${index}-explanation`}
                  name={`option${index}Explanation`}
                  label={`Answer ${index + 1} explanation`}
                  className="min-h-32"
                  value={answer.explanation}
                  onChange={(event) => updateAnswer(index, "explanation", event)}
                  helperText="Required before publishing."
                  errorMessages={fieldErrors(state, `option${index}Explanation`)}
                />
                <QuestionTextarea
                  id={`${idPrefix}-option-${index}-citations`}
                  name={`option${index}CitationUrls`}
                  label={`Answer ${index + 1} citation URLs`}
                  value={answer.citationUrls}
                  onChange={(event) => updateAnswer(index, "citationUrls", event)}
                  helperText="Required before publishing. Use comma-separated http, https, or mailto URLs."
                  errorMessages={fieldErrors(state, `option${index}CitationUrls`)}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

`forceMount` is required on every tab panel so all answer inputs remain in the DOM and are included in every form submission. Radix Tabs supplies the required arrow-key behavior, tab semantics, and hidden inactive panels.

- [ ] **Step 5: Add focused local field wrappers**

In `question-form.tsx`, add wrappers that render inline errors and `aria-invalid`:

```tsx
type ErrorProps = {
  errorMessages?: string[];
  helperText?: string;
};

function QuestionSelect({
  id,
  label,
  errorMessages = [],
  helperText,
  children,
  ...props
}: ComponentProps<"select"> & ErrorProps & { id: string; label: string }) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
        aria-invalid={errorMessages.length > 0 || undefined}
        aria-describedby={errorMessages.length > 0 ? errorId : undefined}
        {...props}
      >
        {children}
      </select>
      {errorMessages.length > 0 ? (
        <div id={errorId} className="space-y-1 text-sm text-destructive">
          {errorMessages.map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

function QuestionTextarea({
  id,
  label,
  errorMessages = [],
  helperText,
  ...props
}: ComponentProps<typeof Textarea> & ErrorProps & { id: string; label: string }) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        aria-invalid={errorMessages.length > 0 || undefined}
        aria-describedby={errorMessages.length > 0 ? errorId : undefined}
        {...props}
      />
      {errorMessages.length > 0 ? (
        <div id={errorId} className="space-y-1 text-sm text-destructive">
          {errorMessages.map((message) => <p key={message}>{message}</p>)}
        </div>
      ) : null}
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}
```

Remove the unused `Input` import if the final component does not need it.

- [ ] **Step 6: Run the editor source test and typecheck**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/modules/certdrill/question-form-editor.test.ts && \
bun run --cwd apps/admin typecheck
```

Expected: the focused editor test PASS and TypeScript reports no errors. If `useEffect` reports an unstable dependency, keep `activateField` wrapped in `useCallback` rather than suppressing the rule or casting.

- [ ] **Step 7: Commit the focused editor**

```bash
git add \
  apps/admin/src/modules/certdrill/question-form.tsx \
  apps/admin/tests/modules/certdrill/question-form-editor.test.ts
git commit -m "feat: add focused question answer tabs"
```

## Task 6: Wire the Editor Into the Admin Page

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Replace obsolete preview expectations**

In `certdrill-admin-page-copy.test.ts`, read the new form source:

```ts
const questionFormSource = readSource(
  "../../src/modules/certdrill/question-form.tsx",
);
```

Replace `shows markdown-supported question editor copy and preview panels` with:

```ts
it("uses the focused question editor without preview or source controls", () => {
  expect(source).toContain('from "./question-form"');
  expect(source).toContain("<QuestionForm");
  expect(source).not.toContain("MarkdownTextareaWithPreview");
  expect(source).not.toContain("function QuestionFormFields");
  expect(questionFormSource).toContain("Question details");
  expect(questionFormSource).toContain("Overview");
  expect(questionFormSource).not.toContain("Stem preview");
  expect(questionFormSource).not.toContain("Explanation preview");
  expect(questionFormSource).not.toContain("Clear source resource");
  expect(questionFormSource).not.toContain("Source resource ID");
});
```

- [ ] **Step 2: Run the page source test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because `admin-page.tsx` still owns the old form and preview controls.

- [ ] **Step 3: Replace the inline form with the focused component**

In `admin-page.tsx`:

1. Replace:

```ts
import { MarkdownTextareaWithPreview } from "./markdown";
import { QuestionFormShell } from "./question-form-shell";
```

with:

```ts
import { QuestionForm } from "./question-form";
```

2. Delete the local `QuestionForm` and `QuestionFormFields` functions.
3. Keep the existing `CertDrillQuestionEditorPage` invocation unchanged:

```tsx
<QuestionForm
  action={selectedQuestion ? updateCertDrillQuestionAction : createCertDrillQuestionAction}
  submitLabel={selectedQuestion ? "Update question" : "Create question"}
  categories={categories}
  selectedCertificationId={certificationId}
  selectedQuestion={selectedQuestion}
  idPrefix="question-editor"
/>
```

4. Update the editor card description to:

```tsx
<CardDescription>
  Edit the question details, then review and complete each answer.
</CardDescription>
```

Do not remove the local generic `TextField`, `TextareaField`, `SelectField`, or `CategorySelect`; other admin forms still use them.

- [ ] **Step 4: Run editor, page, action, and validation tests**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/modules/certdrill/question-form-editor.test.ts \
  tests/modules/certdrill/question-form-shell.test.ts \
  tests/modules/certdrill/question-form-navigation.test.ts \
  tests/modules/certdrill/question-form-validation.test.ts \
  tests/modules/certdrill/question-form-actions.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit page integration**

```bash
git add \
  apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/src/modules/certdrill/question-form-shell.tsx \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts \
  apps/admin/tests/modules/certdrill/question-form-shell.test.ts
git commit -m "refactor: use focused certdrill question editor"
```

## Task 7: Run Focused Regression and Static Checks

**Files:**
- Verify all files changed in Tasks 1-6.

- [ ] **Step 1: Run the complete CertDrill admin test group**

Run:

```bash
bun run --cwd apps/admin test -- \
  tests/components/certdrill-admin-page-copy.test.ts \
  tests/components/certdrill-questions-index.test.ts \
  tests/modules/certdrill/question-id.test.ts \
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

- [ ] **Step 2: Run API publish validation tests**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/validation.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 3: Run TypeScript checks**

Run:

```bash
bun run --cwd apps/admin typecheck && \
bun run --cwd apps/api typecheck
```

Expected: both commands exit successfully with no TypeScript errors.

- [ ] **Step 4: Run the existing strict admin linter**

Run:

```bash
bun run --cwd apps/admin lint:strict
```

Expected: ESLint exits successfully with zero warnings.

- [ ] **Step 5: Inspect the final diff for accidental scope changes**

Run:

```bash
git --no-pager diff --check && \
git --no-pager diff --stat && \
git --no-pager status --short
```

Expected:

- No whitespace errors.
- No schema, migration, route, filtering, sorting, or pagination files changed outside the files listed in this plan.
- The previously untracked unrelated plan documents remain untouched.

- [ ] **Step 6: Commit any final test-only corrections**

Only if the verification steps required corrections:

```bash
git add \
  apps/admin/src/modules/certdrill/admin-actions.ts \
  apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/src/modules/certdrill/markdown.tsx \
  apps/admin/src/modules/certdrill/question-form-navigation.ts \
  apps/admin/src/modules/certdrill/question-form-shell.tsx \
  apps/admin/src/modules/certdrill/question-form-validation.ts \
  apps/admin/src/modules/certdrill/question-form.tsx \
  apps/admin/src/modules/certdrill/question-id.ts \
  apps/admin/src/modules/certdrill/questions-index-table.tsx \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts \
  apps/admin/tests/components/certdrill-questions-index.test.ts \
  apps/admin/tests/modules/certdrill/question-form-actions.test.ts \
  apps/admin/tests/modules/certdrill/question-form-editor.test.ts \
  apps/admin/tests/modules/certdrill/question-form-navigation.test.ts \
  apps/admin/tests/modules/certdrill/question-form-shell.test.ts \
  apps/admin/tests/modules/certdrill/question-form-validation.test.ts \
  apps/admin/tests/modules/certdrill/question-id.test.ts \
  apps/api/src/modules/certdrill/validation.ts \
  apps/api/tests/modules/certdrill/validation.test.ts
git commit -m "test: cover focused question editor"
```

Do not create an empty commit.
