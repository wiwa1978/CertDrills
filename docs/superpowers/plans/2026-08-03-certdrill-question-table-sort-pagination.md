# CertDrill Question Table Sort and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move question stem sorting to a clickable table header and add URL-backed pagination with 50 questions per page.

**Architecture:** The client filter bar keeps its narrow responsibility of updating filter query parameters and stops rendering sort. The server-rendered page normalizes `questionSort` and `questionPage`, filters and sorts the full result list, then passes a 50-item page slice plus navigation metadata to `QuestionTable`. Header and pagination controls update query parameters while preserving active filters.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest.

---

## File structure

- `apps/admin/src/modules/certdrill/question-filter-bar.tsx` — removes the Sort by control and resets `questionPage` when filters change or clear.
- `apps/admin/src/modules/certdrill/admin-page.tsx` — accepts and normalizes `questionPage`, calculates the 50-item slice, creates sort/page links, and renders the sortable Stem header and pagination controls.
- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx` — accepts and forwards `questionPage` from the URL.
- `apps/admin/tests/components/certdrill-admin-page-copy.test.ts` — source-contract coverage for removed toolbar sort, Stem toggling, and pagination.

### Task 1: Remove toolbar sorting and reset pagination on filter changes

**Files:**
- Modify: `apps/admin/src/modules/certdrill/question-filter-bar.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing source-contract test**

  Replace the existing Sort by assertion in the question-filter test with:

  ```ts
  expect(questionFilterBarSource).not.toContain("Sort by");
  expect(questionFilterBarSource).not.toContain('id="question-sort"');
  expect(questionFilterBarSource).toContain('params.delete("questionPage");');
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: FAIL because the toolbar still contains Sort by and does not clear `questionPage`.

- [ ] **Step 3: Remove the toolbar sort control**

  In `question-filter-bar.tsx`, remove `questionSort` from `QuestionFilters` and `questionFilterNames`, then delete the complete `question-sort` `<div>` containing the label and select options.

  In both `replaceFilter` and `clearFilters`, after setting `tab=questions`, delete the current page:

  ```ts
  params.delete("questionPage");
  ```

  This ensures selecting a category/status/difficulty, entering text search, or clearing filters returns results to page 1. Preserve every existing query-race guard and category-ID canonicalization path.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Type-check the admin app**

  Run:

  ```bash
  bun run typecheck:admin
  ```

  Expected: exit code 0.

- [ ] **Step 6: Commit the toolbar change**

  ```bash
  git add apps/admin/src/modules/certdrill/question-filter-bar.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
  git commit -m "feat: move question sort to table" \
    -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
    -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
  ```

### Task 2: Add Stem-header sorting and URL-backed 50-row pagination

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing source-contract test**

  Add:

  ```ts
  it("sorts stem from the table header and paginates questions", () => {
    expect(source).toContain("questionPage?: string;");
    expect(source).toContain("normalizeQuestionPage");
    expect(source).toContain("slice(questionPageOffset, questionPageOffset + questionsPerPage)");
    expect(source).toContain("const questionsPerPage = 50;");
    expect(source).toContain("Stem A-Z");
    expect(source).toContain("Stem Z-A");
    expect(source).toContain("questionPage");
    expect(detailRouteSource).toContain("questionPage?: SearchParamValue");
    expect(detailRouteSource).toContain("questionPage={firstSearchParamString(questionPage)}");
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: FAIL because no page parameter, 50-row slice, or sortable Stem header exists.

- [ ] **Step 3: Normalize and slice question results server-side**

  Add `questionPage?: string` to `CertDrillAdminPageProps` and `questionPage?: string` to `CertDrillAdminHrefParams`. Accept `questionPage` from the detail route search params and pass its first normalized string to `CertDrillAdminPage`.

  Add:

  ```ts
  const questionsPerPage = 50;

  function normalizeQuestionPage(value?: string) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }
  ```

  After `filteredQuestions` is calculated:

  ```ts
  const requestedQuestionPage = normalizeQuestionPage(questionPage);
  const questionPageCount = Math.max(1, Math.ceil(filteredQuestions.length / questionsPerPage));
  const normalizedQuestionPage = Math.min(requestedQuestionPage, questionPageCount);
  const questionPageOffset = (normalizedQuestionPage - 1) * questionsPerPage;
  const pagedQuestions = filteredQuestions.slice(questionPageOffset, questionPageOffset + questionsPerPage);
  ```

  Pass `pagedQuestions`, `questionFilters.questionSort`, `normalizedQuestionPage`, and `questionPageCount` into the Questions-tab `QuestionTable`. The Generate-tab Draft questions table must remain unpaginated and must not receive sort/pagination controls.

- [ ] **Step 4: Add URL builders for sort and page state**

  Create a local `questionTableHref` callback beside `selectedCertificationHref`. It must use `certdrillAdminDetailHref(selectedCertificationId, params)` with `tab: "questions"` and preserve the active normalized question filters.

  Build the two Stem sort targets as follows:

  ```ts
  const nextStemSort = questionSort === "stem-desc" ? "stem-asc" : "stem-desc";
  const stemSortHref = questionTableHref({
    ...questionFilters,
    questionSort: nextStemSort,
  });
  ```

  Do not include `questionPage` in `stemSortHref`, which resets sort changes to page 1. Build Previous and Next hrefs with the same normalized filters, current `questionSort`, and `questionPage: String(normalizedQuestionPage - 1)` or `String(normalizedQuestionPage + 1)` respectively.

- [ ] **Step 5: Render the sortable header and pagination**

  Extend `QuestionTable` with optional props:

  ```ts
  sort?: "stem-asc" | "stem-desc";
  stemSortHref?: string;
  page?: number;
  pageCount?: number;
  previousPageHref?: string;
  nextPageHref?: string;
  ```

  When `stemSortHref` is present, replace the plain Stem header with a `LocalizedLink` labelled `Stem A-Z` for ascending and `Stem Z-A` for descending, using `aria-label="Toggle stem sort"` and a visible arrow icon/text. When absent, retain the plain `Stem` header for the Generate tab.

  After the `<Table>`, render pagination only when `page`, `pageCount`, `previousPageHref`, and `nextPageHref` props are provided. Show `Page {page} of {pageCount}`. Use disabled outline Buttons at the boundaries; otherwise render localized Previous and Next links. Do not render pagination controls for the Generate tab.

- [ ] **Step 6: Run focused test and full admin checks**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  bun run test:admin
  bun run typecheck:admin
  ```

  Expected: each command exits with code 0.

- [ ] **Step 7: Commit sorting and pagination**

  ```bash
  git add apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/certdrill/[certificationId]/page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
  git commit -m "feat: paginate certdrill questions" \
    -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
    -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
  ```
