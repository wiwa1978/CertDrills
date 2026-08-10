# Questions Index and Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide immediate full-space question filtering, row-level question actions, and a spacious answer editor.

**Architecture:** A client filter bar updates the existing URL-backed filters without an Apply button. The server-rendered index retains filtering and table data; each row offers Edit, conditional Publish, and Archive actions. The shared form expands each answer row into a two-column editing/preview layout.

**Tech Stack:** Next.js App Router, React, Radix Dropdown Menu, TypeScript, Vitest.

---

### Task 1: Make question filters immediate

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-filter-bar.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] Write a failing test requiring `QuestionFilterBar`, `useRouter`, and no `Apply filters` text; run the focused admin page test and observe failure.
- [ ] Implement a client filter bar using `usePathname`, `useRouter`, and `useSearchParams`. On select changes, set or delete the matching `questionCategoryId`, `questionStatus`, `questionDifficulty`, or `questionSort` parameter and `router.replace` the query. Debounce text search by 250 ms before setting/deleting `questionSearch`.
- [ ] Render this component in place of `QuestionFilterForm`; preserve filter normalization and the Clear filters link.
- [ ] Extend `filterCertDrillAdminQuestions` to match normalized search text against stem, option text, category ID/name/code, status, and difficulty.
- [ ] Re-run the focused test and `bun run typecheck:admin`; commit with `feat: filter questions immediately`.

### Task 2: Move question actions into the table

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] Write failing assertions for `Question actions`, `Edit`, `Publish`, `Archive`, and removal of the standalone `Publish question` card; run the focused test and observe failure.
- [ ] Add `archiveCertDrillQuestionAction`, requiring `questionId` and calling the existing question update server helper with `{ status: "archived" }`, then revalidate the admin CertDrill path.
- [ ] Add an Actions column to `QuestionTable` using the project DropdownMenu component. Edit is a localized link, Publish is a form action only for drafts, and Archive is a form action only for non-archived questions.
- [ ] Remove the standalone publish card. Pass the action-link callback and actions into `QuestionTable` from the index.
- [ ] Re-run focused test and typecheck; commit with `feat: add question table actions`.

### Task 3: Widen answer editing and preview

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/src/modules/certdrill/markdown.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] Write a failing source-contract test for the wide answer row and explanation preview layout; run it and observe failure.
- [ ] Update `MarkdownTextareaWithPreview` to accept an optional layout class. In each answer row, render answer text and citations in one half and the explanation editor/preview in an equal-width half on `lg` screens; stack on smaller screens.
- [ ] Replace the existing three-column option grid with this wide two-column answer layout without changing any field name, default, Markdown preview, or validation.
- [ ] Run focused test, `bun run test:admin`, and `bun run typecheck:admin`; commit with `feat: widen question answer editor`.
