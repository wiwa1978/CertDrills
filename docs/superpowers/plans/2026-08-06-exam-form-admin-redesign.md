# Exam Form Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual exam-form question picking with backend-generated weighted assignments and a focused admin list/editor workflow.

**Architecture:** A pure allocation module owns strict blueprint validation, integer quota allocation, weighted random selection, and same-category replacement checks. The admin service persists generated assignments and exposes create, metadata update, regeneration, replacement, and activation operations through focused routes. The admin list stays in the certification detail tab, while a dedicated editor route owns allocation widgets, category tabs, replacement, regeneration, and activation.

**Tech Stack:** TypeScript 5.9, Hono, Drizzle ORM/PostgreSQL, Zod, Next.js 16 App Router, React 19 server actions, Radix/shadcn UI, Vitest, Bun.

---

## Execution Prerequisite

The repository currently has an unfinished merge with unrelated staged resource-ingestion work. Before executing this plan, finish that merge without altering its staged files, then use `superpowers:using-git-worktrees` to create an isolated feature worktree. Do not implement this plan in the unfinished merge state.

## File Structure

### New Files

- `apps/api/src/modules/certdrill/exam-form-assignment.ts`: pure blueprint validation, quota calculation, generation, ancestry lookup, and assignment validation.
- `apps/api/tests/modules/certdrill/exam-form-assignment.test.ts`: deterministic unit tests for allocation and shortages.
- `packages/platform-db/drizzle/0026_certdrill_exam_form_assignments.sql`: exam-form metadata migration and legacy backfill.
- `apps/admin/src/modules/certdrill/exam-form-href.ts`: list/editor URL builders.
- `apps/admin/src/modules/certdrill/exam-form-actions.ts`: focused server actions and structured action state.
- `apps/admin/src/modules/certdrill/exam-form-create-dialog.tsx`: client dialog with action-state validation.
- `apps/admin/src/modules/certdrill/exam-form-list.tsx`: canonical list table and activation controls.
- `apps/admin/src/modules/certdrill/exam-form-editor-page.tsx`: server data loader and editor page composition.
- `apps/admin/src/modules/certdrill/exam-form-editor.tsx`: client confirmations, widgets, category tabs, and replacement dialogs.
- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/exam-forms/[examFormId]/page.tsx`: editor route.
- `apps/admin/tests/components/certdrill-exam-form-admin.test.ts`: focused source-level admin workflow assertions consistent with the current admin test suite.

### Modified Files

- `packages/platform-db/src/schema/certdrill.ts`: persisted target count, allocation snapshot, assignment version, generated timestamp, and positive checks.
- `apps/api/src/modules/certdrill/admin-service.ts`: generated CRUD operations, activation validation, concurrency, and active-form question protection.
- `apps/api/src/modules/certdrill/routes.ts`: new request schemas/endpoints and HTTP 409 mapping.
- `apps/api/src/modules/certdrill/service.ts`: advertise the persisted target count.
- `apps/api/tests/modules/certdrill/admin-service.test.ts`: persistence, replacement, regeneration, activation, and question-status tests.
- `apps/api/tests/certdrill.admin.routes.test.ts`: route validation/delegation tests.
- `apps/api/tests/modules/certdrill/service.test.ts`: learner catalog count regression test.
- `apps/admin/src/lib/api/certdrill.server.ts`: richer types and API helpers.
- `apps/admin/tests/lib/certdrill-admin-api.test.ts`: helper request tests.
- `apps/admin/src/modules/certdrill/admin-actions.ts`: remove obsolete manual question-ID exam-form actions and parsers.
- `apps/admin/src/modules/certdrill/admin-page.tsx`: replace the inline picker with list/create components and remove obsolete helpers.
- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx`: remove the obsolete `examFormId` list-page selection parameter.
- `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`: remove assertions for obsolete inline controls.
- `apps/web/tests/components/certdrill-modes-copy.test.ts`: retain learner rendering coverage for active forms.

## Task 1: Pure Weighted Assignment Planner

**Files:**
- Create: `apps/api/src/modules/certdrill/exam-form-assignment.ts`
- Create: `apps/api/tests/modules/certdrill/exam-form-assignment.test.ts`

- [ ] **Step 1: Write failing tests for exact allocation, rounding, ancestry, and capacity**

Create tests using a deterministic RNG and these explicit cases:

```ts
import { describe, expect, it } from "vitest";

import { ExamFormAssignmentError, planExamFormAssignment } from "../../../src/modules/certdrill/exam-form-assignment";

const categories = [
  { id: "domain-a", name: "Domain A", parentCategoryId: null, weightPct: "33.33", sortOrder: 1, archivedAt: null },
  { id: "domain-b", name: "Domain B", parentCategoryId: null, weightPct: "66.67", sortOrder: 2, archivedAt: null },
  { id: "child-a", name: "Child A", parentCategoryId: "domain-a", weightPct: null, sortOrder: 1, archivedAt: null },
];

const questions = [
  { id: "a-1", categoryId: "domain-a" },
  { id: "a-2", categoryId: "child-a" },
  { id: "b-1", categoryId: "domain-b" },
  { id: "b-2", categoryId: "domain-b" },
  { id: "b-3", categoryId: "domain-b" },
  { id: "b-4", categoryId: "domain-b" },
];

describe("planExamFormAssignment", () => {
  it("allocates the exact total with largest remainders and includes descendants", () => {
    const result = planExamFormAssignment({ categories, questions, targetQuestionCount: 3, rng: () => 0.5 });

    expect(result.allocations.map(({ categoryId, assignedCount }) => ({ categoryId, assignedCount }))).toEqual([
      { categoryId: "domain-a", assignedCount: 1 },
      { categoryId: "domain-b", assignedCount: 2 },
    ]);
    expect(result.questionIds).toHaveLength(3);
    expect(result.questionIds.filter((id) => id.startsWith("a-"))).toHaveLength(1);
  });

  it("blocks rather than redistributing a category shortage", () => {
    expect(() => planExamFormAssignment({
      categories,
      questions: questions.filter((question) => question.id !== "a-1" && question.id !== "a-2"),
      targetQuestionCount: 3,
      rng: () => 0.5,
    })).toThrowError(expect.objectContaining({
      code: "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      details: [{ categoryId: "domain-a", categoryName: "Domain A", requiredCount: 1, availableCount: 0 }],
    }));
  });

  it.each([
    ["40.00", "Weights total 90.00%; exactly 100.00% is required."],
    ["60.00", "Weights total 110.00%; exactly 100.00% is required."],
  ])("rejects an invalid top-level total", (secondWeight, message) => {
    const invalid = categories.map((category) => {
      if (category.id === "domain-a") return { ...category, weightPct: "50.00" };
      if (category.id === "domain-b") return { ...category, weightPct: secondWeight };
      return category;
    });
    expect(() => planExamFormAssignment({ categories: invalid, questions, targetQuestionCount: 3 })).toThrow(message);
  });

  it.each([null, "0", "-1", "invalid"])("rejects unusable top-level weight %s", (weightPct) => {
    const invalid = categories.map((category) => category.id === "domain-a" ? { ...category, weightPct } : category);
    expect(() => planExamFormAssignment({ categories: invalid, questions, targetQuestionCount: 3 }))
      .toThrowError(expect.objectContaining({ code: "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS" }));
  });

  it("breaks equal allocation remainders by category sort order", () => {
    const equal = categories.slice(0, 2).map((category) => ({ ...category, weightPct: "50.00" }));
    const result = planExamFormAssignment({ categories: equal, questions, targetQuestionCount: 3, rng: () => 0.5 });
    expect(result.allocations.map((allocation) => allocation.assignedCount)).toEqual([2, 1]);
  });

  it("never assigns a duplicated question id twice", () => {
    const result = planExamFormAssignment({ categories, questions: [...questions, questions[0]], targetQuestionCount: 3, rng: () => 0.5 });
    expect(new Set(result.questionIds).size).toBe(result.questionIds.length);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the module is missing**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/exam-form-assignment.test.ts`

Expected: FAIL with `Cannot find module '../../../src/modules/certdrill/exam-form-assignment'`.

- [ ] **Step 3: Implement the pure planner**

Create the module with stable exported types and no database dependency:

```ts
export type ExamFormAssignmentCategory = {
  id: string;
  name: string;
  parentCategoryId: string | null;
  weightPct: string | number | null;
  sortOrder: number;
  archivedAt?: Date | string | null;
};

export type ExamFormAssignmentQuestion = { id: string; categoryId: string };

export type ExamFormAllocationSnapshotItem = {
  categoryId: string;
  categoryName: string;
  weightPct: string;
  allocatedCount: number;
  assignedCount: number;
};

export type ExamFormAssignmentPlan = {
  questionIds: string[];
  allocations: ExamFormAllocationSnapshotItem[];
};

export class ExamFormAssignmentError extends Error {
  constructor(
    public readonly code: "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS" | "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ExamFormAssignmentError";
  }
}
```

Implement `planExamFormAssignment({ categories, questions, targetQuestionCount, rng = Math.random })` to:

1. Select non-archived top-level categories and require each weight to be finite and greater than zero.
2. Require the two-decimal numeric sum to equal exactly `100.00`.
3. Calculate floors and distribute remainders by descending fraction, then `sortOrder`, then ID.
4. Walk arbitrary-depth descendants with a parent-to-children map.
5. De-duplicate questions by ID.
6. Report all capacity shortages before selecting anything.
7. Fisher-Yates shuffle each top-level pool and append exactly its quota in top-level sort order.

Represent weights as integer basis points while validating and allocating, so `33.33 + 66.67` equals exactly 100% without floating-point equality errors.

Also export:

```ts
export function topLevelCategoryId(categoryId: string, categories: ExamFormAssignmentCategory[]): string | null;
export function validateExamFormAssignment(input: {
  categories: ExamFormAssignmentCategory[];
  questions: ExamFormAssignmentQuestion[];
  targetQuestionCount: number;
  questionIds: string[];
  allocationSnapshot: ExamFormAllocationSnapshotItem[];
}): void;
```

`validateExamFormAssignment` recalculates quotas with current weights, rejects duplicates/missing questions, and requires actual top-level counts and snapshot counts to equal those quotas.

- [ ] **Step 4: Run the focused tests and all existing selection tests**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/exam-form-assignment.test.ts tests/modules/certdrill/selection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the planner**

```bash
git add apps/api/src/modules/certdrill/exam-form-assignment.ts apps/api/tests/modules/certdrill/exam-form-assignment.test.ts
git commit -m "feat: add strict exam form assignment planner"
```

## Task 2: Persist Assignment Metadata And Backfill Existing Forms

**Files:**
- Modify: `packages/platform-db/src/schema/certdrill.ts:255-276`
- Create: `packages/platform-db/drizzle/0026_certdrill_exam_form_assignments.sql`
- Modify: `packages/platform-db/drizzle/meta/_journal.json`
- Create: `apps/api/tests/modules/certdrill/exam-form-schema.test.ts`

- [ ] **Step 1: Add a failing schema-shape test**

```ts
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { certdrillExamForms } from "@platform/platform-db";

describe("CertDrill exam form assignment schema", () => {
  it("exposes persisted assignment metadata", () => {
    const columns = getTableColumns(certdrillExamForms);

    expect(columns.targetQuestionCount.name).toBe("target_question_count");
    expect(columns.assignmentVersion.name).toBe("assignment_version");
    expect(columns.allocationSnapshot.name).toBe("allocation_snapshot");
    expect(columns.generatedAt.name).toBe("generated_at");
  });
});
```

- [ ] **Step 2: Run the schema test and verify the missing columns fail**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/exam-form-schema.test.ts`

Expected: FAIL because `targetQuestionCount` and the other assignment columns are undefined.

- [ ] **Step 3: Add the Drizzle schema fields**

Use this target shape:

```ts
export type CertDrillExamFormAllocation = {
  categoryId: string;
  categoryName: string;
  weightPct: string;
  allocatedCount: number;
  assignedCount: number;
};

// Inside certdrillExamForms
targetQuestionCount: integer("target_question_count").notNull(),
assignmentVersion: integer("assignment_version").default(1).notNull(),
allocationSnapshot: jsonb("allocation_snapshot")
  .$type<CertDrillExamFormAllocation[]>()
  .default(sql`'[]'::jsonb`)
  .notNull(),
generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
```

Add table checks:

```ts
check("certdrill_exam_forms_target_count_positive", sql`${table.targetQuestionCount} > 0`),
check("certdrill_exam_forms_duration_positive", sql`${table.durationMinutes} > 0`),
check("certdrill_exam_forms_assignment_version_positive", sql`${table.assignmentVersion} > 0`),
```

- [ ] **Step 4: Write migration 0026 and register it in the journal**

The repository's CertDrill migrations after the initial generated snapshots are checked-in SQL plus journal entries, so add `0026_certdrill_exam_form_assignments.sql` directly rather than generating a broad snapshot diff. The migration performs a safe legacy backfill before adding `NOT NULL`:

```sql
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "target_question_count" integer;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "assignment_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "allocation_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "certdrill_exam_forms" ADD COLUMN "generated_at" timestamp with time zone;

UPDATE "certdrill_exam_forms"
SET "target_question_count" = GREATEST(cardinality("question_ids"), 1),
    "generated_at" = COALESCE("updated_at", "created_at", now());

ALTER TABLE "certdrill_exam_forms" ALTER COLUMN "target_question_count" SET NOT NULL;
ALTER TABLE "certdrill_exam_forms" ALTER COLUMN "generated_at" SET NOT NULL;
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_target_count_positive" CHECK ("target_question_count" > 0);
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_duration_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "certdrill_exam_forms" ADD CONSTRAINT "certdrill_exam_forms_assignment_version_positive" CHECK ("assignment_version" > 0);
```

After adding the columns and before adding checks, derive legacy allocation snapshots from current question/category ancestry:

```sql
WITH RECURSIVE "category_roots" AS (
  SELECT "id", "id" AS "root_id"
  FROM "certdrill_exam_categories"
  WHERE "parent_category_id" IS NULL
  UNION ALL
  SELECT child."id", roots."root_id"
  FROM "certdrill_exam_categories" child
  JOIN "category_roots" roots ON child."parent_category_id" = roots."id"
), "legacy_allocations" AS (
  SELECT
    form."id" AS "form_id",
    root."id" AS "category_id",
    root."name" AS "category_name",
    root."weight_pct"::text AS "weight_pct",
    root."sort_order",
    count(*)::integer AS "assigned_count"
  FROM "certdrill_exam_forms" form
  CROSS JOIN LATERAL unnest(form."question_ids") AS assigned("question_id")
  JOIN "certdrill_questions" question ON question."id" = assigned."question_id"
  JOIN "category_roots" roots ON roots."id" = question."category_id"
  JOIN "certdrill_exam_categories" root ON root."id" = roots."root_id"
  GROUP BY form."id", root."id", root."name", root."weight_pct", root."sort_order"
), "legacy_snapshots" AS (
  SELECT
    "form_id",
    jsonb_agg(jsonb_build_object(
      'categoryId', "category_id",
      'categoryName', "category_name",
      'weightPct', COALESCE("weight_pct", '0.00'),
      'allocatedCount', "assigned_count",
      'assignedCount', "assigned_count"
    ) ORDER BY "sort_order", "category_id") AS "snapshot"
  FROM "legacy_allocations"
  GROUP BY "form_id"
)
UPDATE "certdrill_exam_forms" form
SET "allocation_snapshot" = snapshots."snapshot"
FROM "legacy_snapshots" snapshots
WHERE snapshots."form_id" = form."id";
```

Forms with empty assignments or unmappable questions retain `[]` and are stale until regenerated. Empty legacy forms use target count `1` because the new target-count invariant is positive.

Deactivate only legacy forms whose snapshot assigned-count sum does not equal `cardinality(question_ids)`, because those assignments contain unmappable questions and cannot satisfy the activation invariant. Preserve active status for fully mapped legacy forms; subsequent explicit activation and regeneration use current strict quota validation.

```sql
UPDATE "certdrill_exam_forms" form
SET "is_active" = false
WHERE COALESCE((
  SELECT sum((allocation ->> 'assignedCount')::integer)
  FROM jsonb_array_elements(form."allocation_snapshot") allocation
), 0) <> cardinality(form."question_ids");
```

Append journal entry index 26 with tag `0026_certdrill_exam_form_assignments`, version `7`, `breakpoints: true`, and a current monotonically increasing `when` timestamp. Do not create a partial snapshot file because this repository has not checked in snapshots for migrations 0006-0025.

- [ ] **Step 5: Verify the test, schema, and package types**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/exam-form-schema.test.ts && bun run db:check && bun run --cwd packages/platform-db typecheck`

Expected: all commands PASS.

- [ ] **Step 6: Commit schema and migration**

```bash
git add packages/platform-db/src/schema/certdrill.ts packages/platform-db/drizzle apps/api/tests/modules/certdrill/exam-form-schema.test.ts
git commit -m "feat: persist exam form assignment metadata"
```

## Task 3: Generated Exam Form Service Operations

**Files:**
- Modify: `apps/api/src/modules/certdrill/admin-service.ts:41-130,453-488`
- Modify: `apps/api/tests/modules/certdrill/admin-service.test.ts:378-424`

- [ ] **Step 1: Replace old manual-form tests with failing generated-assignment tests**

Add focused tests for:

```ts
it("creates an inactive generated form at the next sort order", async () => {
  const { db, inserts } = createAdminDb({
    categories: weightedCategories,
    questions: publishedQuestions,
    examForms: [{ id: ids.otherExamForm, certificationId: ids.cert, sortOrder: 2 }],
    returningByTable: { certdrill_exam_forms: [{ id: ids.examForm, assignmentVersion: 1 }] },
  });
  const service = createCertDrillAdminService({ db, rng: () => 0.5 });

  await service.createExamForm({
    certificationId: ids.cert,
    name: "Form A",
    durationMinutes: 120,
    targetQuestionCount: 10,
  });

  expect(inserts.find((entry) => entry.table === "certdrill_exam_forms")?.values).toMatchObject({
    name: "Form A",
    isActive: false,
    sortOrder: 3,
    targetQuestionCount: 10,
    assignmentVersion: 1,
  });
});

it("replaces a question in place and rejects a stale assignment version", async () => {
  const form = generatedExamForm({ questionIds: [ids.question, ids.otherQuestion], assignmentVersion: 4 });
  const { db, updates } = createAdminDb({
    categories: weightedCategories,
    questions: [
      { id: ids.question, certificationId: ids.cert, categoryId: ids.category, status: "published" },
      { id: ids.otherQuestion, certificationId: ids.cert, categoryId: ids.siblingCategory, status: "published" },
      { id: ids.replacementQuestion, certificationId: ids.cert, categoryId: ids.category, status: "published" },
    ],
    examForms: [form],
    returningByTable: { certdrill_exam_forms: [{ ...form, questionIds: [ids.replacementQuestion, ids.otherQuestion], assignmentVersion: 5 }] },
  });
  const service = createCertDrillAdminService({ db });

  await service.replaceExamFormQuestion(ids.examForm, {
    currentQuestionId: ids.question,
    replacementQuestionId: ids.replacementQuestion,
    expectedAssignmentVersion: 4,
  });

  expect(updates.at(-1)?.values).toMatchObject({
    questionIds: [ids.replacementQuestion, ids.otherQuestion],
    assignmentVersion: 5,
  });

  await expect(service.replaceExamFormQuestion(ids.examForm, {
    currentQuestionId: ids.question,
    replacementQuestionId: ids.replacementQuestion,
    expectedAssignmentVersion: 3,
  })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT" });
});

it("regenerates atomically and increments assignment version", async () => {
  const form = generatedExamForm({ assignmentVersion: 2 });
  const { db, updates, transactions } = createAdminDb({
    categories: weightedCategories,
    questions: publishedQuestions,
    examForms: [form],
    returningByTable: { certdrill_exam_forms: [{ ...form, assignmentVersion: 3, targetQuestionCount: 4 }] },
  });
  const service = createCertDrillAdminService({ db, rng: () => 0.5 });

  await service.regenerateExamForm(ids.examForm, { targetQuestionCount: 4, expectedAssignmentVersion: 2 });

  expect(transactions).toHaveLength(1);
  expect(updates.at(-1)?.values).toMatchObject({
    targetQuestionCount: 4,
    assignmentVersion: 3,
    questionIds: expect.arrayContaining([expect.any(String)]),
    allocationSnapshot: expect.any(Array),
    generatedAt: expect.any(Date),
  });
});

it("activates only a complete current assignment", async () => {
  const stale = generatedExamForm({ allocationSnapshot: [] });
  const staleDb = createAdminDb({ categories: weightedCategories, questions: publishedQuestions, examForms: [stale] });
  await expect(createCertDrillAdminService({ db: staleDb.db }).setExamFormActive(ids.examForm, true))
    .rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_INVALID" });

  const current = generatedExamForm();
  const currentDb = createAdminDb({
    categories: weightedCategories,
    questions: publishedQuestions,
    examForms: [current],
    returningByTable: { certdrill_exam_forms: [{ ...current, isActive: true }] },
  });
  await createCertDrillAdminService({ db: currentDb.db }).setExamFormActive(ids.examForm, true);
  expect(currentDb.updates.at(-1)?.values).toMatchObject({ isActive: true });
});

it("requires regeneration when current weights change an integer quota", async () => {
  const form = generatedExamForm();
  const changedWeights = weightedCategories.map((category) => ({
    ...category,
    weightPct: category.id === ids.category ? "75.00" : "25.00",
  }));
  const { db } = createAdminDb({ categories: changedWeights, questions: publishedQuestions, examForms: [form] });

  await expect(createCertDrillAdminService({ db }).setExamFormActive(ids.examForm, true))
    .rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_INVALID" });
});
```

Add `replacementQuestion` and `otherExamForm` UUIDs to the existing `ids` fixture. Define `weightedCategories`, `publishedQuestions`, and `generatedExamForm` immediately above these tests with 50/50 top-level categories and a valid two-question snapshot. Expand `createAdminDb` with queued exam-form `findFirst` results and configurable conditional-update return rows so the stale-version branch can return `[]` without changing production code.

- [ ] **Step 2: Run focused service tests and verify the old service contract fails**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/admin-service.test.ts`

Expected: FAIL because `targetQuestionCount`, `rng`, regeneration, replacement, and activation are not implemented.

- [ ] **Step 3: Implement focused service methods**

Change dependencies and inputs to:

```ts
type CertDrillAdminServiceDeps = {
  db: any;
  rng?: () => number;
  questionIndex?: CertDrillAdminQuestionIndex;
  questionImport?: CertDrillAdminQuestionImportService;
  resourceIngestor?: ResourceIngestor;
};

type ExamFormCreateInput = {
  certificationId: string;
  name: string;
  durationMinutes: number;
  targetQuestionCount: number;
};

type ExamFormMetadataInput = { name?: string; durationMinutes?: number };
type ExamFormRegenerateInput = { targetQuestionCount: number; expectedAssignmentVersion: number };
type ExamFormReplaceInput = {
  currentQuestionId: string;
  replacementQuestionId: string;
  expectedAssignmentVersion: number;
};
```

Add service error codes:

```ts
| "CERTDRILL_ADMIN_EXAM_FORM_NOT_FOUND"
| "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS"
| "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY"
| "CERTDRILL_ADMIN_EXAM_FORM_INVALID"
| "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT"
| "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE"
```

Implement these public methods:

```ts
createExamForm(input: ExamFormCreateInput)
getExamForm(id: string)
listExamForms(certificationId: string)
updateExamFormMetadata(id: string, input: ExamFormMetadataInput)
regenerateExamForm(id: string, input: ExamFormRegenerateInput)
replaceExamFormQuestion(id: string, input: ExamFormReplaceInput)
setExamFormActive(id: string, isActive: boolean)
```

`updateExamFormMetadata` trims a supplied name, requires it to remain non-empty, requires positive integer duration, and deliberately ignores certification, description, sort order, active state, target count, and question IDs. It returns not-found when no row is updated.

Use `withTransaction` for creation and regeneration. Query non-archived categories and published questions, call `planExamFormAssignment`, and map `ExamFormAssignmentError` to matching service errors. Determine creation sort order as `max(existing sortOrder) + 1`.

Use a conditional update for assignment concurrency:

```ts
const [updated] = await db.update(certdrillExamForms).set({
  questionIds: plan.questionIds,
  targetQuestionCount: input.targetQuestionCount,
  allocationSnapshot: plan.allocations,
  assignmentVersion: input.expectedAssignmentVersion + 1,
  generatedAt: new Date(),
  updatedAt: new Date(),
}).where(and(
  eq(certdrillExamForms.id, id),
  eq(certdrillExamForms.assignmentVersion, input.expectedAssignmentVersion),
)).returning();
```

Throw the conflict error when no row returns. Replacement performs the same conditional update after verifying publication, certification, uniqueness, and equal top-level ancestry.

Activation calls `validateExamFormAssignment` with current published questions and current weights before setting `isActive: true`. Deactivation requires no assignment validation.

- [ ] **Step 4: Run service tests**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/admin-service.test.ts tests/modules/certdrill/exam-form-assignment.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit service operations**

```bash
git add apps/api/src/modules/certdrill/admin-service.ts apps/api/tests/modules/certdrill/admin-service.test.ts
git commit -m "feat: generate and manage exam form assignments"
```

## Task 4: Protect Active Forms And Stabilize Learner Counts

**Files:**
- Modify: `apps/api/src/modules/certdrill/admin-service.ts:330-450`
- Modify: `apps/api/tests/modules/certdrill/admin-service.test.ts`
- Modify: `apps/api/src/modules/certdrill/service.ts:1068-1095`
- Modify: `apps/api/tests/modules/certdrill/service.test.ts`

- [ ] **Step 1: Write failing protection and learner-count tests**

Add tests asserting:

```ts
it.each(["draft", "archived"] as const)("blocks changing an active-form question to %s", async (status) => {
  const { db, updates } = createAdminDb({
    questionById: createQuestion({ status: "published" }),
    activeExamFormsContainingQuestion: [{ id: ids.examForm, name: "Form A" }],
  });
  const service = createCertDrillAdminService({ db });

  await expect(service.updateQuestion(ids.question, { status })).rejects.toMatchObject({
    code: "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE",
    details: [{ id: ids.examForm, name: "Form A" }],
  });
  expect(updates).toEqual([]);
});

it("advertises the persisted target count for active forms", async () => {
  const db = {
    query: {
      certdrillExamForms: { findMany: vi.fn().mockResolvedValue([{
        id: ids.examForm,
        certificationId: ids.cert,
        name: "Form A",
        description: null,
        isActive: true,
        sortOrder: 1,
        durationMinutes: 120,
        targetQuestionCount: 10,
        questionIds: [ids.question1, ids.question2],
      }]) },
    },
    select: selectRows([{
      id: ids.cert,
      code: "AWS-SAA-C03",
      name: "AWS Architect",
      vendor: "AWS",
      description: null,
      questionCountDefault: 55,
      passThresholdPct: 72,
      publishedQuestionCount: "2",
      quickDrillQuestionCount: 10,
      categoryDrillQuestionCount: 10,
      examSimulationQuestionCount: 55,
      examSimulationDurationMinutes: 120,
    }]),
  };
  const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });
  const [certification] = await service.listCertifications(ids.user);
  expect(certification.examForms).toEqual([expect.objectContaining({ name: "Form A", questionCount: 10 })]);
});
```

- [ ] **Step 2: Run the tests and verify current behavior fails**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/admin-service.test.ts tests/modules/certdrill/service.test.ts`

Expected: FAIL because status changes are not protected and catalog count uses `questionIds.length`.

- [ ] **Step 3: Implement active-form protection and target count mapping**

Before changing a published question to draft or archived, query active exam forms containing the ID using PostgreSQL array containment:

```ts
const forms = await db.query.certdrillExamForms.findMany({
  where: and(
    eq(certdrillExamForms.isActive, true),
    sql`${certdrillExamForms.questionIds} @> ARRAY[${questionId}::uuid]`,
  ),
  columns: { id: true, name: true },
});
```

Reject with `CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE` and form details when non-empty. In the learner catalog mapping, replace `questionIds.length` with `targetQuestionCount`.

- [ ] **Step 4: Run focused and mode-selection tests**

Run: `bun run --cwd apps/api test -- tests/modules/certdrill/admin-service.test.ts tests/modules/certdrill/service.test.ts tests/modules/certdrill/mode-selection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit runtime safeguards**

```bash
git add apps/api/src/modules/certdrill/admin-service.ts apps/api/src/modules/certdrill/service.ts apps/api/tests/modules/certdrill/admin-service.test.ts apps/api/tests/modules/certdrill/service.test.ts
git commit -m "fix: protect active exam form assignments"
```

## Task 5: Expose Focused Admin API Endpoints

**Files:**
- Modify: `apps/api/src/modules/certdrill/routes.ts:61-70,218-226,586-602`
- Modify: `apps/api/tests/certdrill.admin.routes.test.ts:252-303`

- [ ] **Step 1: Write failing route validation and delegation tests**

Replace the old manual `questionIds` request test with exact requests:

```ts
await app.request("/api/admin/certdrill/exam-forms", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ certificationId, name: "Form A", durationMinutes: 120, targetQuestionCount: 60 }),
});
await app.request(`/api/admin/certdrill/exam-forms/${examFormId}/regenerate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ targetQuestionCount: 60, expectedAssignmentVersion: 2 }),
});
await app.request(`/api/admin/certdrill/exam-forms/${examFormId}/questions/replace`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ currentQuestionId: questionId, replacementQuestionId: otherQuestionId, expectedAssignmentVersion: 2 }),
});
await app.request(`/api/admin/certdrill/exam-forms/${examFormId}/activation`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ isActive: true }),
});
```

Assert exact service calls. Add a test that a service conflict returns status `409`, and invalid positive integers/UUIDs return `400` without delegation.

- [ ] **Step 2: Run route tests and verify missing routes fail**

Run: `bun run --cwd apps/api test -- tests/certdrill.admin.routes.test.ts`

Expected: FAIL with 404 responses or unmet service mock assertions.

- [ ] **Step 3: Implement schemas, routes, and conflict status**

Use these schemas:

```ts
const examFormCreateSchema = z.object({
  certificationId: z.string().uuid(),
  name: z.string().trim().min(1),
  durationMinutes: z.number().int().positive(),
  targetQuestionCount: z.number().int().positive(),
});
const examFormMetadataSchema = z.object({
  name: z.string().trim().min(1).optional(),
  durationMinutes: z.number().int().positive().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required.");
const examFormRegenerateSchema = z.object({
  targetQuestionCount: z.number().int().positive(),
  expectedAssignmentVersion: z.number().int().positive(),
});
const examFormReplaceSchema = z.object({
  currentQuestionId: z.string().uuid(),
  replacementQuestionId: z.string().uuid(),
  expectedAssignmentVersion: z.number().int().positive(),
});
const examFormActivationSchema = z.object({ isActive: z.boolean() });
```

Expose:

```text
GET   /certifications/:certificationId/exam-forms
GET   /exam-forms/:id
POST  /exam-forms
PATCH /exam-forms/:id
POST  /exam-forms/:id/regenerate
POST  /exam-forms/:id/questions/replace
PATCH /exam-forms/:id/activation
```

Map `CERTDRILL_ADMIN_EXAM_FORM_CONFLICT` to HTTP 409; other service validation remains HTTP 400.

- [ ] **Step 4: Run route and service tests**

Run: `bun run --cwd apps/api test -- tests/certdrill.admin.routes.test.ts tests/modules/certdrill/admin-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API endpoints**

```bash
git add apps/api/src/modules/certdrill/routes.ts apps/api/tests/certdrill.admin.routes.test.ts
git commit -m "feat: expose exam form assignment endpoints"
```

## Task 6: Add Admin API Helpers And Server Actions

**Files:**
- Modify: `apps/admin/src/lib/api/certdrill.server.ts:136-147,358-380`
- Modify: `apps/admin/tests/lib/certdrill-admin-api.test.ts`
- Create: `apps/admin/src/modules/certdrill/exam-form-href.ts`
- Create: `apps/admin/src/modules/certdrill/exam-form-actions.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts:133-146,390-417`

- [ ] **Step 1: Write failing helper tests**

Add helper expectations for exact paths and payloads:

```ts
const createPayload = { certificationId: "cert-1", name: "Form A", durationMinutes: 120, targetQuestionCount: 60 };
const metadataPayload = { name: "Form B", durationMinutes: 90 };
const regeneratePayload = { targetQuestionCount: 50, expectedAssignmentVersion: 2 };
const replacePayload = {
  currentQuestionId: "11111111-1111-4111-8111-111111111111",
  replacementQuestionId: "22222222-2222-4222-8222-222222222222",
  expectedAssignmentVersion: 2,
};

await expectHelperCall("listCertDrillAdminExamFormsServer", ["cert-1"], "/api/admin/certdrill/certifications/cert-1/exam-forms");
await expectHelperCall("getCertDrillAdminExamFormServer", ["form-1"], "/api/admin/certdrill/exam-forms/form-1");
await expectHelperCall("createCertDrillAdminExamFormServer", [createPayload], "/api/admin/certdrill/exam-forms", {
  method: "POST",
  body: JSON.stringify(createPayload),
});
await expectHelperCall("updateCertDrillAdminExamFormMetadataServer", ["form-1", metadataPayload], "/api/admin/certdrill/exam-forms/form-1", {
  method: "PATCH",
  body: JSON.stringify(metadataPayload),
});
await expectHelperCall("regenerateCertDrillAdminExamFormServer", ["form-1", regeneratePayload], "/api/admin/certdrill/exam-forms/form-1/regenerate", {
  method: "POST",
  body: JSON.stringify(regeneratePayload),
});
await expectHelperCall("replaceCertDrillAdminExamFormQuestionServer", ["form-1", replacePayload], "/api/admin/certdrill/exam-forms/form-1/questions/replace", {
  method: "POST",
  body: JSON.stringify(replacePayload),
});
await expectHelperCall("setCertDrillAdminExamFormActiveServer", ["form-1", false], "/api/admin/certdrill/exam-forms/form-1/activation", {
  method: "PATCH",
  body: JSON.stringify({ isActive: false }),
});
```

Replace the current `lists, creates, and updates admin exam forms` test rather than keeping duplicate expectations for the removed manual `questionIds` helper contract.

- [ ] **Step 2: Run helper tests and verify missing exports fail**

Run: `bun run --cwd apps/admin test -- tests/lib/certdrill-admin-api.test.ts`

Expected: FAIL because the new helper exports do not exist.

- [ ] **Step 3: Implement types, helpers, hrefs, and action state**

Define the admin response shape:

```ts
export type CertDrillAdminExamFormAllocation = {
  categoryId: string;
  categoryName: string;
  weightPct: string;
  allocatedCount: number;
  assignedCount: number;
};

export type CertDrillAdminExamForm = {
  id: string;
  certificationId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  durationMinutes: number;
  targetQuestionCount: number;
  questionIds: string[];
  assignmentVersion: number;
  allocationSnapshot: CertDrillAdminExamFormAllocation[];
  generatedAt: string;
};
```

Implement helpers for all Task 5 endpoints. Extend `jsonRequestInit` to accept `"POST" | "PATCH"` as it already does.

Add href builders:

```ts
export function examFormListHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}?tab=exam-forms`;
}
export function examFormEditorHref(certificationId: string, examFormId: string) {
  return `/admin/certdrill/${certificationId}/exam-forms/${examFormId}`;
}
```

In `exam-form-actions.ts`, define:

```ts
export type ExamFormActionState = {
  status: "idle" | "error" | "success";
  formError?: string;
  fieldErrors: Partial<Record<"name" | "durationMinutes" | "targetQuestionCount", string[]>>;
};
export const initialExamFormActionState: ExamFormActionState = { status: "idle", fieldErrors: {} };
```

Implement create, metadata update, regeneration, replacement, and activation actions. Parse positive integers locally, map API validation details to fields, call `revalidatePath(examFormListHref(certificationId))`, and redirect successful creation to `examFormEditorHref(certificationId, created.id)`. Return a form-level conflict message: `This assignment changed after the page loaded. Reload and try again.`

Also export a direct `deactivateCertDrillExamFormAction(formData)` for active list rows; it calls the activation endpoint with `false`, revalidates the list path, and does not perform assignment validation. Remove `examFormQuestionIds`, `submittedExamFormQuestionIds`, `createCertDrillExamFormAction`, `updateCertDrillExamFormAction`, and now-unused imports from `admin-actions.ts`.

- [ ] **Step 4: Run helper tests and admin typecheck**

Run: `bun run --cwd apps/admin test -- tests/lib/certdrill-admin-api.test.ts && bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 5: Commit admin data layer**

```bash
git add apps/admin/src/lib/api/certdrill.server.ts apps/admin/tests/lib/certdrill-admin-api.test.ts apps/admin/src/modules/certdrill/exam-form-href.ts apps/admin/src/modules/certdrill/exam-form-actions.ts apps/admin/src/modules/certdrill/admin-actions.ts
git commit -m "feat: add exam form admin actions"
```

## Task 7: Replace The Inline Exam Forms Tab

**Files:**
- Create: `apps/admin/src/modules/certdrill/exam-form-create-dialog.tsx`
- Create: `apps/admin/src/modules/certdrill/exam-form-list.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx:220-255,480-519,858-1015,1471-1496`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx:5-39`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
- Create: `apps/admin/tests/components/certdrill-exam-form-admin.test.ts`

- [ ] **Step 1: Write failing UI structure tests**

Use the suite's existing source-file test convention to assert:

```ts
expect(adminPageSource).toContain("<ExamFormCreateDialog");
expect(adminPageSource).toContain("<ExamFormList");
expect(adminPageSource).not.toContain("QuestionPickerTable");
expect(adminPageSource).not.toContain("Manual question ID fallback");
expect(createDialogSource).toContain("Create Form");
expect(createDialogSource).toContain('name="targetQuestionCount"');
expect(createDialogSource).not.toContain('name="isActive"');
expect(listSource).toContain("Target questions");
expect(listSource).toContain("Duration");
expect(listSource).toContain("Status");
expect(listSource).toContain("examFormEditorHref");
expect(listSource).toContain("Deactivate");
```

Update the broad copy test to remove the obsolete `selectedQuestionIds` and `Create or update exam form` assertions.

- [ ] **Step 2: Run UI tests and verify the old inline UI fails expectations**

Run: `bun run --cwd apps/admin test -- tests/components/certdrill-admin-page-copy.test.ts tests/components/certdrill-exam-form-admin.test.ts`

Expected: FAIL because the focused components do not exist and the picker remains.

- [ ] **Step 3: Implement the create dialog and canonical list**

`ExamFormCreateDialog` is a client component using `useActionState(createCertDrillExamFormAction, initialExamFormActionState)`. Render name, duration defaulting to 120, target count, inline field errors, and a pending **Creating...** button. Keep the dialog open on action errors.

`ExamFormList` renders:

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Target questions</TableHead>
      <TableHead>Duration</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>{examForms.map((form) => (
    <TableRow key={form.id}>
      <TableCell>{form.name}</TableCell>
      <TableCell>{form.targetQuestionCount}</TableCell>
      <TableCell>{form.durationMinutes} minutes</TableCell>
      <TableCell><Badge variant={form.isActive ? "default" : "secondary"}>{form.isActive ? "Active" : "Inactive"}</Badge></TableCell>
      <TableCell className="text-right">
        <Button asChild variant="outline" size="sm"><LocalizedLink href={examFormEditorHref(certificationId, form.id)}>Edit</LocalizedLink></Button>
        {form.isActive ? (
          <form action={deactivateCertDrillExamFormAction} className="inline">
            <input type="hidden" name="certificationId" value={certificationId} />
            <input type="hidden" name="examFormId" value={form.id} />
            <Button type="submit" variant="outline" size="sm">Deactivate</Button>
          </form>
        ) : null}
      </TableCell>
    </TableRow>
  ))}</TableBody>
</Table>
```

In `admin-page.tsx`, remove `requestedExamFormId`, selected-form calculations, `ExamFormForm`, picker/distribution helpers, and the duplicate table. The tab renders one card header with list title and create dialog, then the list or empty state. Remove `examFormId` from the detail route's search-param type and `CertDrillAdminPage` props because list rows now use dedicated editor routes.

- [ ] **Step 4: Run focused tests and admin typecheck**

Run: `bun run --cwd apps/admin test -- tests/components/certdrill-admin-page-copy.test.ts tests/components/certdrill-exam-form-admin.test.ts && bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the simplified list UI**

```bash
git add apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/src/modules/certdrill/exam-form-create-dialog.tsx apps/admin/src/modules/certdrill/exam-form-list.tsx "apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx" apps/admin/tests/components/certdrill-admin-page-copy.test.ts apps/admin/tests/components/certdrill-exam-form-admin.test.ts
git commit -m "feat: simplify exam forms admin tab"
```

## Task 8: Build The Dedicated Exam Form Editor

**Files:**
- Create: `apps/admin/src/modules/certdrill/exam-form-editor-page.tsx`
- Create: `apps/admin/src/modules/certdrill/exam-form-editor.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/exam-forms/[examFormId]/page.tsx`
- Modify: `apps/admin/tests/components/certdrill-exam-form-admin.test.ts`

- [ ] **Step 1: Add failing editor route and behavior assertions**

Assert the route loads `CertDrillExamFormEditorPage`, and the editor source contains:

```ts
expect(editorSource).toContain("Back to Exam Forms");
expect(editorSource).toContain("Regenerate Questions");
expect(editorSource).toContain("Changing the question count replaces all assigned questions");
expect(editorSource).toContain("allocationSnapshot.map");
expect(editorSource).toContain("assignedQuestionsByTopLevelCategory");
expect(editorSource).toContain("Replace");
expect(editorSource).toContain("expectedAssignmentVersion");
expect(editorSource).toContain("window.confirm");
```

- [ ] **Step 2: Run the editor tests and verify missing files fail**

Run: `bun run --cwd apps/admin test -- tests/components/certdrill-exam-form-admin.test.ts`

Expected: FAIL because the route and editor do not exist.

- [ ] **Step 3: Implement server loading and editor interactions**

The route mirrors the question editor route and renders the page in `Container`. The server page loads, in parallel:

```ts
const [certifications, categories, questions, examForm] = await Promise.all([
  listCertDrillAdminCertificationsServer(),
  listCertDrillAdminCategoriesServer(certificationId),
  listCertDrillAdminQuestionsServer(certificationId),
  getCertDrillAdminExamFormServer(examFormId),
]);
```

Return not-found UI when the certification/form does not exist or IDs do not match. Pass only published replacement candidates to the client editor.

The editor must:

1. Render metadata fields and preserve assignments when only name/duration change.
2. Treat a changed target count as a regeneration submit and call `window.confirm` before dispatching.
3. Render one card per snapshot allocation with weight, assigned count, and `(assignedCount / targetQuestionCount) * 100` rounded to two decimals.
4. Resolve every question's top-level ancestor from the category map and group assigned questions without reordering the form's `questionIds` array.
5. Render top-level `Tabs` and an assigned-only table with stem, direct category, difficulty, status, and Replace.
6. In a replacement dialog, filter out currently assigned IDs and include only published questions resolving to the selected top-level category.
7. Include hidden `expectedAssignmentVersion` in replacement and regeneration forms.
8. Confirm full regeneration with: `Regenerating replaces all assigned questions and discards manual swaps. Continue?`
9. Render explicit Activate/Deactivate controls; activation errors remain visible.
10. Display the persisted description as read-only text when present; description and sort-order editing remain outside this streamlined workflow.

Use native `window.confirm` through a client submit handler for the two destructive assignment operations; do not add a second dialog framework or state library.

- [ ] **Step 4: Run editor tests, all admin tests, and typecheck**

Run: `bun run --cwd apps/admin test && bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the editor**

```bash
git add apps/admin/src/modules/certdrill/exam-form-editor-page.tsx apps/admin/src/modules/certdrill/exam-form-editor.tsx "apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/exam-forms/[examFormId]/page.tsx" apps/admin/tests/components/certdrill-exam-form-admin.test.ts
git commit -m "feat: add weighted exam form editor"
```

## Task 9: End-To-End Regression And Cleanup

**Files:**
- Modify: `apps/web/tests/components/certdrill-modes-copy.test.ts`
- Modify: files from Tasks 1-8 only when a verification failure identifies a defect in that task's implementation

- [ ] **Step 1: Strengthen the learner regression test before final verification**

Extend the existing source-level test to pin the active filtering and target count/duration rendering already supplied by the API:

```ts
it("renders only active exam forms with API-provided count and duration", () => {
  expect(source).toContain("certification.examForms?.filter((form) => form.isActive)");
  expect(source).toContain('{form.questionCount} questions · {form.durationMinutes} minutes');
});
```

- [ ] **Step 2: Run the learner copy test**

Run: `bun run --cwd apps/web test -- tests/components/certdrill-modes-copy.test.ts`

Expected: PASS.

- [ ] **Step 3: Run formatting-independent diff validation and database checks**

Run: `git diff --check && bun run db:check`

Expected: PASS with no whitespace errors or Drizzle consistency errors.

- [ ] **Step 4: Run all type checks and tests**

Run: `bun run typecheck:all && bun run test:all`

Expected: all package, API, web, and admin type checks and tests PASS.

- [ ] **Step 5: Run production builds for affected Next applications**

Run: `bun run --cwd apps/admin build && bun run --cwd apps/web build`

Expected: both builds PASS.

- [ ] **Step 6: Review the final diff against the acceptance criteria**

Run: `git status --short && git diff --stat && git diff --check`

Confirm:

- No inline all-question picker remains.
- Creation accepts only name, duration, and count and creates inactive forms.
- Weight/capacity failures are atomic and actionable.
- Editor widgets/tabs use top-level categories and descendant questions.
- Replacements are same-category one-for-one swaps.
- Regeneration/count changes require confirmation and concurrency versions.
- Activation validates current quotas and publication.
- Learner ordering, duration, active filtering, and three-form limit remain intact.

- [ ] **Step 7: Commit final regression coverage**

```bash
git add apps/web/tests/components/certdrill-modes-copy.test.ts
git commit -m "test: cover generated exam forms end to end"
```
