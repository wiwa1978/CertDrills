# CertDrill Usability And Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve CertDrill usability before Foundry integration with question filtering, exam form building, feedback resolution, readiness/coverage basics, spaced review queue, and resume buttons.

**Architecture:** Keep data-generation external. Use existing CertDrill questions/attempts/feedback data to improve admin and learner workflows. Add small helper APIs where needed, but prioritize UI and service-level improvements over large new systems.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, Next.js App Router, Tailwind/shadcn, Vitest.

---

## Scope

Included:

- Admin question table search/filter/sort by category/status/difficulty/text.
- Exam form builder from selectable question IDs with duplicate prevention and category distribution summary.
- Feedback/dispute status update workflow.
- Basic readiness dashboard from completed attempts.
- Spaced review queue foundation from missed/low-confidence answers.
- Visible resume attempt buttons in web catalog/history.

Deferred:

- Foundry generation.
- Full spaced repetition algorithm tuning.
- Rich charting beyond basic cards/tables.

## Tasks

### Task 1: Admin Question Filters And Sort

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

Steps:
- [ ] Add source test expectations for `Search questions`, `Filter by category`, `Filter by status`, `Filter by difficulty`, and `Sort by`.
- [ ] Add query params `questionSearch`, `questionStatus`, `questionDifficulty`, `questionCategoryId`, `questionSort` to the detail route.
- [ ] Filter/sort loaded questions in the server component before rendering.
- [ ] Add filter form above the question table.
- [ ] Keep question editor modal behavior intact.
- [ ] Run admin focused tests/typecheck.

### Task 2: Exam Form Builder

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

Steps:
- [ ] Add source tests for `Question picker`, `Selected questions`, `Category distribution`, and duplicate prevention text.
- [ ] Add visible question picker table under Exam Forms tab.
- [ ] Add textarea still accepted for IDs, plus checkboxes that submit selected question IDs.
- [ ] Add category distribution summary for selected/current form questions.
- [ ] Ensure action de-duplicates submitted question IDs before send.
- [ ] Run admin tests/typecheck.

### Task 3: Feedback Resolution Workflow

**Files:**
- Modify: `apps/api/src/modules/certdrill/admin-service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/api/tests/modules/certdrill/admin-service.test.ts`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

Steps:
- [ ] Add API test for updating feedback status to reviewed/resolved.
- [ ] Add admin service `updateQuestionFeedback(id, { status })`.
- [ ] Add route `PATCH /api/admin/certdrill/question-feedback/:id`.
- [ ] Add admin helper/action.
- [ ] Add status filter and action buttons in Feedback tab.
- [ ] Run API/admin focused tests/typechecks.

### Task 4: Readiness Dashboard Basics

**Files:**
- Modify: `apps/api/src/modules/certdrill/service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/web/src/lib/api/certdrill.server.ts`
- Modify: `apps/web/src/modules/certdrill/catalog-page.tsx`
- Test: `apps/api/tests/modules/certdrill/service.test.ts`
- Test: `apps/web/tests/components/certdrill-modes-copy.test.ts`

Steps:
- [ ] Add service test for readiness summary: completed attempts, average score, missed count, weak category count.
- [ ] Add `GET /api/certdrill/readiness`.
- [ ] Add web helper and render readiness cards on `/exams`.
- [ ] Run API/web focused tests/typechecks.

### Task 5: Spaced Review Queue Foundation

**Files:**
- Modify: `packages/platform-db/src/schema/certdrill.ts`
- Create: `packages/platform-db/drizzle/0025_certdrill_review_queue.sql`
- Modify: `packages/platform-db/drizzle/meta/_journal.json`
- Modify: `apps/api/src/modules/certdrill/service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Test: `apps/api/tests/modules/certdrill/service.test.ts`

Steps:
- [ ] Add `certdrill_review_queue` table with userId, certificationId, questionId, dueAt, reason, intervalDays, ease, status.
- [ ] On submit, upsert queue rows for incorrect answers and low confidence.
- [ ] Add `GET /api/certdrill/review-queue/due`.
- [ ] Run migration checks and tests.

### Task 6: Resume Buttons

**Files:**
- Modify: `apps/web/src/modules/certdrill/catalog-page.tsx`
- Modify: `apps/web/src/modules/certdrill/attempt-history-page.tsx`
- Test: `apps/web/tests/components/certdrill-runner-resume.test.ts`

Steps:
- [ ] Add source tests for `Resume attempt` button copy.
- [ ] Show in-progress attempts on catalog page when available.
- [ ] Ensure attempt history has `Resume attempt` for in-progress attempts.
- [ ] Run web focused tests/typecheck.

### Task 7: Final Verification

Steps:
- [ ] Run focused API/admin/web tests.
- [ ] Run `bun run db:check`.
- [ ] Run `bun run typecheck:all`.
- [ ] Apply migration with `DRIZZLE_REQUIRE_DATABASE_URL=1 bun run db:migrate`.

## Self-Review

This plan avoids Foundry and keeps implementation local. It provides useful admin and learner workflow improvements that can be reviewed independently tomorrow.
