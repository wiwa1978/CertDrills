# CertDrill Exam Modes And Adaptive Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CertDrill Phase 1 learning modes: Quick Drill, Category Drill, Exam Simulation, Exam Forms, optional confidence tracking, Missed Questions Review, and Weak Areas Drill.

**Architecture:** Extend the existing CertDrill foundation without touching billing. Keep legacy `feedbackMode` and `selectionMode` columns for compatibility, while adding new `testMode` and `testVariant` fields that drive the user-facing model. Implement selection rules in pure helpers first, then wire contracts, service, seed data, and UI.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, Zod contracts, Next.js App Router, Tailwind/shadcn, Vitest.

---

## Scope

This plan implements the approved spec `docs/superpowers/specs/2026-07-28-certdrill-exam-modes-adaptive-practice-design.md`.

Included:

- DB schema/migration for mode defaults, exam forms, confidence, and timers.
- Contract changes for `testMode`, `testVariant`, `confidence`, `expiresAt`, and exam forms.
- Selection helpers for Quick Drill, Category Drill, Exam Simulation, Exam Form, Missed Review, and Weak Areas Drill.
- API service changes for attempt creation, answer confidence, timer expiry, and review/history responses.
- Seeder updates for certification defaults and Exam Form A/B/C.
- Web start page and runner updates.
- Admin read-only display of defaults/forms.

Deferred:

- Admin CRUD editing of defaults/forms.
- Spaced repetition scheduling.
- Readiness score and objective coverage dashboard.

## File Structure

- Modify: `packages/platform-db/src/schema/certdrill.ts`.
- Create: `packages/platform-db/drizzle/0019_certdrill_exam_modes_adaptive_practice.sql`.
- Modify: `packages/platform-db/drizzle/meta/_journal.json`.
- Modify: `packages/contracts/src/certdrill/common.ts`.
- Modify: `packages/contracts/src/certdrill/requests.ts`.
- Modify: `packages/contracts/src/certdrill/responses.ts`.
- Modify: `apps/api/src/modules/certdrill/selection.ts`.
- Create: `apps/api/tests/modules/certdrill/mode-selection.test.ts`.
- Modify: `apps/api/src/modules/certdrill/snapshot.ts`.
- Modify: `apps/api/src/modules/certdrill/service.ts`.
- Modify: `apps/api/tests/modules/certdrill/service.test.ts`.
- Modify: `apps/api/src/modules/certdrill/seed-demo.ts`.
- Modify: `apps/api/tests/modules/certdrill/seed-demo.test.ts`.
- Modify: `apps/web/src/modules/certdrill/start-page.tsx`.
- Modify: `apps/web/src/modules/certdrill/exam-runner.tsx`.
- Modify: `apps/web/src/modules/certdrill/results-page.tsx`.
- Modify: `apps/web/src/modules/certdrill/attempt-history-page.tsx`.
- Modify: `apps/web/tests/lib/certdrill-api.test.ts`.
- Create: `apps/web/tests/components/certdrill-modes-copy.test.ts`.
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`.
- Modify: `README.md`.

## Task 1: Schema And Migration

**Files:**
- Modify: `packages/platform-db/src/schema/certdrill.ts`
- Create: `packages/platform-db/drizzle/0019_certdrill_exam_modes_adaptive_practice.sql`
- Modify: `packages/platform-db/drizzle/meta/_journal.json`

- [ ] **Step 1: Extend schema types and columns**

In `packages/platform-db/src/schema/certdrill.ts`, add:

```ts
export type CertDrillTestMode = "practice" | "exam";
export type CertDrillTestVariant = "quick_drill" | "category_drill" | "exam_simulation" | "exam_form" | "missed_review" | "weak_areas";
export type CertDrillConfidence = "guessed" | "somewhat_sure" | "confident";
```

Extend `certdrillCertifications`:

```ts
quickDrillQuestionCount: integer("quick_drill_question_count").default(10).notNull(),
categoryDrillQuestionCount: integer("category_drill_question_count").default(10).notNull(),
examSimulationQuestionCount: integer("exam_simulation_question_count"),
examSimulationDurationMinutes: integer("exam_simulation_duration_minutes").default(120).notNull(),
```

Extend `certdrillExamCategories`:

```ts
drillQuestionCount: integer("drill_question_count"),
```

Create `certdrillExamForms` table:

```ts
export const certdrillExamForms = pgTable(
  "certdrill_exam_forms",
  {
    id,
    certificationId: uuid("certification_id").references(() => certdrillCertifications.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    durationMinutes: integer("duration_minutes").default(120).notNull(),
    questionIds: uuid("question_ids").array().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_exam_forms_certification_id_idx").on(table.certificationId),
    index("certdrill_exam_forms_active_idx").on(table.isActive),
    uniqueIndex("certdrill_exam_forms_cert_sort_idx").on(table.certificationId, table.sortOrder),
  ],
);
```

Extend `certdrillExamAttempts`:

```ts
testMode: text("test_mode").$type<CertDrillTestMode>().default("practice").notNull(),
testVariant: text("test_variant").$type<CertDrillTestVariant>().default("quick_drill").notNull(),
examFormId: uuid("exam_form_id").references(() => certdrillExamForms.id, { onDelete: "set null" }),
confidenceEnabled: boolean("confidence_enabled").default(false).notNull(),
expiresAt: timestamp("expires_at", { withTimezone: true }),
```

Extend `certdrillExamAttemptAnswers`:

```ts
confidence: text("confidence").$type<CertDrillConfidence>(),
```

Add relations:

- Certification has many exam forms.
- Exam form belongs to certification.
- Exam attempt optionally belongs to exam form.

- [ ] **Step 2: Add migration SQL**

Create `packages/platform-db/drizzle/0019_certdrill_exam_modes_adaptive_practice.sql`:

```sql
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "quick_drill_question_count" integer DEFAULT 10 NOT NULL;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "category_drill_question_count" integer DEFAULT 10 NOT NULL;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "exam_simulation_question_count" integer;
ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "exam_simulation_duration_minutes" integer DEFAULT 120 NOT NULL;

ALTER TABLE "certdrill_exam_categories" ADD COLUMN IF NOT EXISTS "drill_question_count" integer;

CREATE TABLE IF NOT EXISTS "certdrill_exam_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "certification_id" uuid NOT NULL REFERENCES "certdrill_certifications"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "duration_minutes" integer DEFAULT 120 NOT NULL,
  "question_ids" uuid[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "certdrill_exam_forms_certification_id_idx" ON "certdrill_exam_forms" ("certification_id");
CREATE INDEX IF NOT EXISTS "certdrill_exam_forms_active_idx" ON "certdrill_exam_forms" ("is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "certdrill_exam_forms_cert_sort_idx" ON "certdrill_exam_forms" ("certification_id", "sort_order");

ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "test_mode" text DEFAULT 'practice' NOT NULL;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "test_variant" text DEFAULT 'quick_drill' NOT NULL;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "exam_form_id" uuid REFERENCES "certdrill_exam_forms"("id") ON DELETE set null;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "confidence_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "certdrill_exam_attempts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

UPDATE "certdrill_exam_attempts"
SET
  "test_mode" = CASE WHEN "feedback_mode" = 'exam' THEN 'exam' ELSE 'practice' END,
  "test_variant" = CASE
    WHEN "feedback_mode" = 'exam' THEN 'exam_simulation'
    WHEN "selection_mode" = 'category_focus' THEN 'category_drill'
    ELSE 'quick_drill'
  END;

ALTER TABLE "certdrill_exam_attempt_answers" ADD COLUMN IF NOT EXISTS "confidence" text;
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_test_mode_variant_idx" ON "certdrill_exam_attempts" ("test_mode", "test_variant");
CREATE INDEX IF NOT EXISTS "certdrill_exam_attempts_expires_at_idx" ON "certdrill_exam_attempts" ("expires_at");
```

Update `packages/platform-db/drizzle/meta/_journal.json` by appending entry index after the current last migration:

```json
{
  "idx": 19,
  "version": "7",
  "when": 1785283200000,
  "tag": "0019_certdrill_exam_modes_adaptive_practice",
  "breakpoints": true
}
```

Use the next actual `idx` if the journal has moved forward.

- [ ] **Step 3: Verify schema**

Run:

```bash
bun run db:check
bun run typecheck:packages
```

Expected: PASS.

## Task 2: Contracts

**Files:**
- Modify: `packages/contracts/src/certdrill/common.ts`
- Modify: `packages/contracts/src/certdrill/requests.ts`
- Modify: `packages/contracts/src/certdrill/responses.ts`

- [ ] **Step 1: Add contract tests by extending API test coverage**

In `apps/api/tests/certdrill.routes.test.ts`, add a test for invalid mode/variant combinations:

```ts
it("rejects invalid exam form practice attempts", async () => {
  const response = await createApp().request("/api/certdrill/exams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      certificationId,
      testMode: "practice",
      testVariant: "exam_form",
      examFormId: certificationId,
    }),
  });

  expect(response.status).toBe(400);
  expect(service.createAttempt).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run route test and verify red**

Run: `bun run --cwd apps/api test tests/certdrill.routes.test.ts`

Expected: FAIL because the request schema does not yet understand `testMode`/`testVariant` rules.

- [ ] **Step 3: Add common schemas**

In `packages/contracts/src/certdrill/common.ts`, add:

```ts
export const certdrillTestModeSchema = z.enum(["practice", "exam"]);
export const certdrillTestVariantSchema = z.enum(["quick_drill", "category_drill", "exam_simulation", "exam_form", "missed_review", "weak_areas"]);
export const certdrillConfidenceSchema = z.enum(["guessed", "somewhat_sure", "confident"]);
```

Export corresponding types.

Add exam form response schema:

```ts
export const certdrillExamFormSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  durationMinutes: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
});
```

- [ ] **Step 4: Replace create attempt request schema**

In `packages/contracts/src/certdrill/requests.ts`, keep legacy fields optional but add new mode fields:

```ts
export const createCertDrillExamAttemptRequestSchema = z.object({
  certificationId: z.string().uuid(),
  testMode: certdrillTestModeSchema,
  testVariant: certdrillTestVariantSchema,
  categoryIds: z.array(z.string().uuid()).optional(),
  examFormId: z.string().uuid().optional(),
  confidenceEnabled: z.boolean().default(false).optional(),
  feedbackMode: certdrillFeedbackModeSchema.optional(),
  selectionMode: certdrillSelectionModeSchema.optional(),
  questionCount: z.number().int().positive().max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.testVariant === "category_drill" && (!value.categoryIds || value.categoryIds.length !== 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "category_drill requires exactly one category", path: ["categoryIds"] });
  }
  if (value.testVariant === "exam_form" && !value.examFormId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exam_form requires examFormId", path: ["examFormId"] });
  }
  if (value.testMode === "practice" && ["exam_simulation", "exam_form"].includes(value.testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exam variants require testMode=exam", path: ["testVariant"] });
  }
  if (value.testMode === "exam" && ["quick_drill", "category_drill", "missed_review", "weak_areas"].includes(value.testVariant)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "practice variants require testMode=practice", path: ["testVariant"] });
  }
});
```

Extend answer request:

```ts
confidence: certdrillConfidenceSchema.optional(),
```

- [ ] **Step 5: Extend responses**

In `packages/contracts/src/certdrill/responses.ts`:

- Add certification fields: quick/category/exam counts, exam duration, active exam forms.
- Add create attempt response fields: `testMode`, `testVariant`, `confidenceEnabled`, `expiresAt`.
- Add attempt history fields: `testMode`, `testVariant`, `expiresAt`.
- Add review question/answer confidence where applicable.

- [ ] **Step 6: Verify contracts**

Run:

```bash
bun run --cwd packages/contracts typecheck
bun run typecheck:packages
bun run --cwd apps/api test tests/certdrill.routes.test.ts
```

Expected: PASS.

## Task 3: Mode Selection Helpers

**Files:**
- Modify: `apps/api/src/modules/certdrill/selection.ts`
- Create: `apps/api/tests/modules/certdrill/mode-selection.test.ts`

- [ ] **Step 1: Write failing mode selection tests**

Create `apps/api/tests/modules/certdrill/mode-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { selectQuestionIdsForVariant } from "../../../src/modules/certdrill/selection";

const categories = [
  { id: "domain-1", parentCategoryId: null, weightPct: "60.00", drillQuestionCount: 3 },
  { id: "task-1", parentCategoryId: "domain-1", weightPct: null, drillQuestionCount: null },
  { id: "domain-2", parentCategoryId: null, weightPct: "40.00", drillQuestionCount: null },
];
const questions = [
  { id: "q1", categoryId: "domain-1" },
  { id: "q2", categoryId: "task-1" },
  { id: "q3", categoryId: "domain-1" },
  { id: "q4", categoryId: "domain-2" },
  { id: "q5", categoryId: "domain-2" },
];

describe("CertDrill mode selection", () => {
  it("selects quick drill questions using certification count", () => {
    const result = selectQuestionIdsForVariant({ testVariant: "quick_drill", categories, questions, quickDrillCount: 2, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false });
    expect(result.questionIds).toEqual(["q1", "q2"]);
  });

  it("selects category drill questions using category override count", () => {
    const result = selectQuestionIdsForVariant({ testVariant: "category_drill", selectedCategoryIds: ["domain-1"], categories, questions, quickDrillCount: 10, categoryDrillCount: 2, examSimulationCount: 5, shuffle: false });
    expect(result.questionIds).toEqual(["q1", "q2", "q3"]);
  });

  it("selects exam form questions in stored order", () => {
    const result = selectQuestionIdsForVariant({ testVariant: "exam_form", examFormQuestionIds: ["q5", "q1"], categories, questions, quickDrillCount: 10, categoryDrillCount: 10, examSimulationCount: 5, shuffle: false });
    expect(result.questionIds).toEqual(["q5", "q1"]);
  });
});
```

- [ ] **Step 2: Run and verify red**

Run: `bun run --cwd apps/api test tests/modules/certdrill/mode-selection.test.ts`

Expected: FAIL because `selectQuestionIdsForVariant` does not exist.

- [ ] **Step 3: Implement `selectQuestionIdsForVariant`**

Add function to `apps/api/src/modules/certdrill/selection.ts`:

```ts
export function selectQuestionIdsForVariant(input: {
  testVariant: "quick_drill" | "category_drill" | "exam_simulation" | "exam_form" | "missed_review" | "weak_areas";
  selectedCategoryIds?: string[];
  examFormQuestionIds?: string[];
  missedQuestionIds?: string[];
  weakCategoryIds?: string[];
  categories: Array<CategoryInput & { drillQuestionCount?: number | null }>;
  questions: QuestionInput[];
  quickDrillCount: number;
  categoryDrillCount: number;
  examSimulationCount: number;
  shuffle?: boolean;
  rng?: () => number;
}) {
  // quick_drill: first/random N from all questions
  // category_drill: category subtree with category override count
  // exam_simulation: existing weighted_random
  // exam_form: ordered intersection of examFormQuestionIds and available questions
  // missed_review: ordered intersection of missedQuestionIds and available questions, limited to quickDrillCount
  // weak_areas: category_focus over weakCategoryIds, limited to quickDrillCount
}
```

Use existing `selectQuestionIds` internally where possible. Return same shape `{ questionIds, warnings }`.

- [ ] **Step 4: Verify helper tests**

Run: `bun run --cwd apps/api test tests/modules/certdrill/mode-selection.test.ts tests/modules/certdrill/selection.test.ts`

Expected: PASS.

## Task 4: Service Behavior

**Files:**
- Modify: `apps/api/src/modules/certdrill/service.ts`
- Modify: `apps/api/tests/modules/certdrill/service.test.ts`

- [ ] **Step 1: Add failing service tests**

Add tests in `apps/api/tests/modules/certdrill/service.test.ts`:

```ts
it("creates quick drill attempts with immediate-feedback legacy modes", async () => {
  const service = createCertDrillService({ db: createAttemptDb(), accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }) });
  const result = await service.createAttempt(ids.user, { certificationId: ids.cert, testMode: "practice", testVariant: "quick_drill", confidenceEnabled: true });
  expect(result).toMatchObject({ testMode: "practice", testVariant: "quick_drill", confidenceEnabled: true, expiresAt: null });
});

it("creates exam simulation attempts with expiry", async () => {
  const service = createCertDrillService({ db: createAttemptDb({ examSimulationDurationMinutes: 120 }), accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }) });
  const result = await service.createAttempt(ids.user, { certificationId: ids.cert, testMode: "exam", testVariant: "exam_simulation" });
  expect(result.testMode).toBe("exam");
  expect(result.expiresAt).toEqual(expect.any(String));
});

it("stores answer confidence when enabled", async () => {
  const db = createAnswerDb({ feedbackMode: "practice", status: "in_progress", guardedRows: [{ id: ids.attempt }] });
  const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });
  await service.answerQuestion(ids.user, ids.attempt, { questionId: ids.question1, selectedOptionId: ids.option1Correct, confidence: "guessed" });
  expect(db.insert.mock.calls[0]).toBeDefined();
});
```

Adapt helper names to existing test utilities in the file.

- [ ] **Step 2: Run and verify red**

Run: `bun run --cwd apps/api test tests/modules/certdrill/service.test.ts`

Expected: FAIL because service does not yet return new fields or store confidence.

- [ ] **Step 3: Extend service catalog responses**

In `listCertifications`, select and return:

- `quickDrillQuestionCount`.
- `categoryDrillQuestionCount`.
- `examSimulationQuestionCount`.
- `examSimulationDurationMinutes`.
- `examForms` from active forms.

- [ ] **Step 4: Extend `createAttempt`**

In `createAttempt`:

- Accept new request shape.
- Derive legacy `feedbackMode`/`selectionMode` from mode/variant.
- Load exam forms when needed.
- Load missed question IDs for `missed_review` from prior wrong answers.
- Load weak categories for `weak_areas` from completed attempts.
- Use `selectQuestionIdsForVariant`.
- Set `expiresAt` for `exam_simulation` and `exam_form`.
- Insert new attempt fields.
- Return new response fields.

- [ ] **Step 5: Extend answer and submit behavior**

In `answerQuestion`:

- Reject answer updates when `attempt.expiresAt` is in the past and attempt is still in progress.
- Store `confidence` when provided.

In submit:

- Allow submit after expiry using recorded answers.
- Include confidence in review output if available.

- [ ] **Step 6: Verify service tests**

Run:

```bash
bun run --cwd apps/api test tests/modules/certdrill/service.test.ts tests/modules/certdrill/mode-selection.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

## Task 5: Seeder And Exam Forms

**Files:**
- Modify: `apps/api/src/modules/certdrill/seed-demo.ts`
- Modify: `apps/api/tests/modules/certdrill/seed-demo.test.ts`

- [ ] **Step 1: Add failing seed test for forms**

Extend seed test to assert an insert into `certdrill_exam_forms`.

```ts
expect(inserts.some((entry) => entry.table === "certdrill_exam_forms")).toBe(true);
```

- [ ] **Step 2: Run and verify red**

Run: `bun run --cwd apps/api test tests/modules/certdrill/seed-demo.test.ts`

Expected: FAIL because forms are not seeded.

- [ ] **Step 3: Seed defaults and forms**

Update seed data:

- Set certification quick/category drill counts to 10.
- Set exam simulation count and duration.
- Create three active exam forms per certification when enough question IDs exist.
- For the demo dataset with few questions, create one form with available question IDs and name `Exam Form A`.

- [ ] **Step 4: Verify seed test**

Run: `bun run --cwd apps/api test tests/modules/certdrill/seed-demo.test.ts`

Expected: PASS.

## Task 6: Web UI Modes And Timer

**Files:**
- Modify: `apps/web/src/modules/certdrill/start-page.tsx`
- Modify: `apps/web/src/modules/certdrill/exam-runner.tsx`
- Modify: `apps/web/src/modules/certdrill/results-page.tsx`
- Modify: `apps/web/src/modules/certdrill/attempt-history-page.tsx`
- Modify: `apps/web/src/lib/api/certdrill.ts`
- Test: `apps/web/tests/components/certdrill-modes-copy.test.ts`
- Test: `apps/web/tests/lib/certdrill-api.test.ts`

- [ ] **Step 1: Add failing UI copy test**

Create `apps/web/tests/components/certdrill-modes-copy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/modules/certdrill/start-page.tsx", import.meta.url), "utf8");

describe("CertDrill mode copy", () => {
  it("shows the approved practice and exam options", () => {
    expect(source).toContain("Quick Drill");
    expect(source).toContain("Category Drill");
    expect(source).toContain("Missed Questions Review");
    expect(source).toContain("Weak Areas Drill");
    expect(source).toContain("Exam Simulation");
    expect(source).toContain("Exam Form");
  });
});
```

- [ ] **Step 2: Run and verify red**

Run: `bun run --cwd apps/web test tests/components/certdrill-modes-copy.test.ts`

Expected: FAIL because current UI uses old labels.

- [ ] **Step 3: Update API helper test**

In `apps/web/tests/lib/certdrill-api.test.ts`, update create attempt helper expectations to include `testMode`, `testVariant`, and `confidenceEnabled`.

- [ ] **Step 4: Implement start page mode groups**

Update `StartPage`:

- Remove old independent mode/selection panels.
- Add Practice section cards: Quick Drill, Category Drill, Missed Questions Review, Weak Areas Drill.
- Add Exam section cards: Exam Simulation, active exam forms.
- Add confidence toggle.
- For Category Drill, show category select.
- On start, call `createCertDrillAttempt` with `testMode`, `testVariant`, `categoryIds`, `examFormId`, and `confidenceEnabled`.

- [ ] **Step 5: Implement runner timer/confidence**

Update `ExamRunner`:

- Display timer when `attempt.expiresAt` exists.
- Auto-submit when timer reaches zero.
- Show immediate feedback only for `testMode=practice`.
- Show confidence selector only when `confidenceEnabled=true`.
- Include confidence in answer payload.

- [ ] **Step 6: Update display pages**

Update results/history pages to show:

- `testMode` as `Practice` or `Exam`.
- `testVariant` using user labels such as `Quick Drill`, `Category Drill`, `Exam Simulation`, or the exam form name.
- `expiresAt`/timer metadata on exam attempts only.
- confidence labels on reviewed answers when confidence was recorded.

- [ ] **Step 7: Verify web**

Run:

```bash
bun run --cwd apps/web test tests/components/certdrill-modes-copy.test.ts tests/lib/certdrill-api.test.ts
bun run --cwd apps/web typecheck
```

Expected: PASS.

## Task 7: Admin Read-Only Visibility

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`

- [ ] **Step 1: Add read-only fields**

Update admin page to show for each certification:

- Quick Drill count.
- Category Drill count.
- Exam Simulation count.
- Exam Simulation duration.
- Active Exam Forms.

- [ ] **Step 2: Verify admin**

Run: `bun run --cwd apps/admin typecheck`

Expected: PASS.

## Task 8: Final Verification And Migration

**Files:**
- README optional update.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun run --cwd apps/api test tests/modules/certdrill/mode-selection.test.ts tests/modules/certdrill/service.test.ts tests/modules/certdrill/seed-demo.test.ts tests/certdrill.routes.test.ts
bun run --cwd apps/web test tests/components/certdrill-modes-copy.test.ts tests/lib/certdrill-api.test.ts tests/components/certdrill-theme.test.ts tests/messages-parity.test.ts
bun run --cwd apps/admin test tests/messages-parity.test.ts tests/config/certdrill-admin-nav.test.ts
bun run db:check
bun run typecheck:all
```

Expected: PASS except the known pre-existing full API TOTP failures are outside this focused set.

- [ ] **Step 2: Apply migration and reseed local DB**

Run:

```bash
DRIZZLE_REQUIRE_DATABASE_URL=1 bun run db:migrate
bun run --cwd apps/api seed:certdrill
```

Expected: migration succeeds and seeder skips existing certifications or adds forms/defaults idempotently.

## Plan Self-Review

Spec coverage:

- New mode model: Tasks 2, 4, 6.
- Admin defaults/forms: Tasks 1, 5, 7.
- Confidence: Tasks 1, 2, 4, 6.
- Missed review and weak areas: Tasks 3 and 4.
- Timers: Tasks 1, 2, 4, 6.
- Migration compatibility: Task 1.

Deferred per spec:

- Admin CRUD editing of defaults/forms.
- Spaced repetition.
- Readiness score and coverage dashboard.

No placeholder steps remain.
