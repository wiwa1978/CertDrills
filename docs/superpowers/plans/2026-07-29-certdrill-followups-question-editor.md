# CertDrill Followups And Markdown Question Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete key CertDrill hardening follow-ups and add a markdown-first rich question editor experience.

**Architecture:** Extend the existing CertDrill snapshot/attempt model so answer order and resume state are server-backed. Add user feedback reports as a separate admin-reviewable table. Keep markdown editing simple: textarea + live preview using a small markdown renderer, with no heavy editor dependency in this pass.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, Zod contracts, Next.js App Router, Tailwind/shadcn, Vitest.

---

## Scope

Included:

- Hard duplicate-question prevention for all selection variants.
- Randomize answer option order per attempt and persist it in the snapshot.
- Resume in-progress attempts from server-stored snapshots and answers.
- User question feedback/dispute reporting and admin read-only review.
- Markdown-based admin question editor with live preview.

Deferred:

- Full WYSIWYG editor.
- Media upload workflow.
- Admin feedback resolution workflow beyond status/comment updates.

## Tasks

### Task 1: Duplicate And Answer Randomization Hardening

**Files:**
- Modify: `apps/api/src/modules/certdrill/selection.ts`
- Modify: `apps/api/src/modules/certdrill/snapshot.ts`
- Modify: `apps/api/src/modules/certdrill/service.ts`
- Test: `apps/api/tests/modules/certdrill/mode-selection.test.ts`
- Test: `apps/api/tests/modules/certdrill/snapshot.test.ts`

Steps:

- [ ] Add tests proving every selection variant returns unique question IDs.
- [ ] Add tests proving snapshot option order can be randomized and then remains stable.
- [ ] Add a helper `uniqueOrderedIds(ids: string[]): string[]` in selection code and use it for all variants.
- [ ] Add option randomization to snapshot creation using injectable RNG.
- [ ] Ensure `createAttempt` uses option-randomized snapshots.
- [ ] Run `bun run --cwd apps/api test tests/modules/certdrill/mode-selection.test.ts tests/modules/certdrill/snapshot.test.ts tests/modules/certdrill/service.test.ts`.

### Task 2: Resume Attempts

**Files:**
- Modify: `packages/contracts/src/certdrill/responses.ts`
- Modify: `apps/api/src/modules/certdrill/service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Test: `apps/api/tests/modules/certdrill/service.test.ts`
- Test: `apps/api/tests/certdrill.routes.test.ts`
- Modify: `apps/web/src/lib/api/certdrill.server.ts`
- Modify: `apps/web/src/modules/certdrill/exam-runner.tsx`
- Modify: `apps/web/src/app/[locale]/(backend)/exams/[id]/page.tsx`

Steps:

- [ ] Add service test for `getAttemptForResume(userId, attemptId)` returning snapshot questions without correctness plus recorded selected answers.
- [ ] Add route test for `GET /api/certdrill/exams/:id`.
- [ ] Implement service method and route.
- [ ] Add web server helper `getCertDrillAttemptServer(attemptId)`.
- [ ] Update exam route to use server resume payload when sessionStorage is absent.
- [ ] Update runner to hydrate selected answers/current index from resume payload.
- [ ] Run API and web focused tests/typechecks.

### Task 3: User Question Feedback And Disputes

**Files:**
- Modify: `packages/platform-db/src/schema/certdrill.ts`
- Create: `packages/platform-db/drizzle/0021_certdrill_question_feedback.sql`
- Modify: `packages/platform-db/drizzle/meta/_journal.json`
- Modify: `packages/contracts/src/certdrill/requests.ts`
- Modify: `apps/api/src/modules/certdrill/service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Test: `apps/api/tests/modules/certdrill/service.test.ts`
- Test: `apps/api/tests/certdrill.routes.test.ts`

Steps:

- [ ] Add `certdrill_question_feedback` table with user, question, attempt, rating, dispute flag, message, status, timestamps.
- [ ] Add migration/journal entry.
- [ ] Add request schema `{ questionId, attemptId?, rating: 1|2|3|4|5, disputeCorrectAnswer?: boolean, message?: string }`.
- [ ] Add `POST /api/certdrill/questions/:id/feedback` route.
- [ ] Add admin list route `GET /api/admin/certdrill/question-feedback`.
- [ ] Add service tests for creating feedback and admin listing.
- [ ] Run db check, API tests, typechecks.

### Task 4: Admin Feedback Review UI

**Files:**
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

Steps:

- [ ] Add admin helper for question feedback list.
- [ ] Add Feedback tab to admin CertDrill page.
- [ ] Render rating, dispute flag, message, question ID, user ID, status.
- [ ] Run admin focused tests/typecheck.

### Task 5: Markdown Question Editor

**Files:**
- Create: `apps/admin/src/modules/certdrill/markdown.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-markdown-editor.test.ts`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

Steps:

- [ ] Add tests for markdown preview converting headings, bold, code, and links.
- [ ] Implement lightweight markdown renderer with escaping.
- [ ] Replace plain question stem/option explanation textareas with markdown-labeled fields and preview panels.
- [ ] Keep stored values as markdown text in existing DB fields.
- [ ] Add copy indicating “Markdown supported”.
- [ ] Run admin tests/typecheck.

### Task 6: Final Verification

Steps:

- [ ] Run focused API tests.
- [ ] Run focused admin/web tests.
- [ ] Run `bun run db:check`.
- [ ] Run `bun run typecheck:all`.
- [ ] Apply migration with `DRIZZLE_REQUIRE_DATABASE_URL=1 bun run db:migrate`.

## Plan Self-Review

This plan covers the explicit follow-ups and markdown editor request. It intentionally avoids full feedback resolution workflows and heavy editor dependencies to keep the pass shippable overnight.
