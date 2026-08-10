# CertDrill Questions Table Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Questions tab's submitted filter form and standalone publishing panel with a large, URL-backed table that filters in real time and exposes contextual row actions.

**Architecture:** A new client-only filter toolbar owns debounced search and immediate select query-string updates. `CertDrillAdminPage` remains the server-rendered source of normalized filters and table data. Row-level Publish and Archive actions reuse the existing server-action and API patterns, keeping state validation on the server.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Radix Dropdown Menu, Tailwind CSS, Vitest.

---

## File structure

- `apps/admin/src/modules/certdrill/question-filter-bar.tsx` — client-side toolbar which synchronizes question filters to the URL.
- `apps/admin/src/modules/certdrill/admin-page.tsx` — renders the new toolbar and wide table, includes category content in search, and adds row action menus.
- `apps/admin/src/modules/certdrill/admin-actions.ts` — provides the archive server action by updating a question to `archived`.
- `apps/admin/tests/components/certdrill-admin-page-copy.test.ts` — source-contract coverage for the toolbar, search scope, actions, and removed publishing panel.

### Task 1: Replace submitted filters with a real-time toolbar

**Files:**
- Create: `apps/admin/src/modules/certdrill/question-filter-bar.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing source-contract test**

  Add this test after the existing question-filter test:

  ```ts
  it("uses a URL-backed real-time question filter toolbar", () => {
    expect(source).toContain('import { QuestionFilterBar } from "./question-filter-bar";');
    expect(source).toContain("<QuestionFilterBar");
    expect(source).not.toContain("QuestionFilterForm");
    expect(source).not.toContain("Apply filters");
    expect(filterBarSource).toContain('"use client"');
    expect(filterBarSource).toContain("useRouter");
    expect(filterBarSource).toContain("usePathname");
    expect(filterBarSource).toContain("useSearchParams");
    expect(filterBarSource).toContain("setTimeout");
    expect(filterBarSource).toContain("250");
    expect(filterBarSource).toContain('router.replace(');
    expect(filterBarSource).toContain('scroll: false');
  });
  ```

  At the test file's top level, load the new source:

  ```ts
  const filterBarSource = readFileSync(
    new URL("../../src/modules/certdrill/question-filter-bar.tsx", import.meta.url),
    "utf8",
  );
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: FAIL because `question-filter-bar.tsx` does not exist and `admin-page.tsx` does not import or render `QuestionFilterBar`.

- [ ] **Step 3: Create the client filter toolbar**

  Create `apps/admin/src/modules/certdrill/question-filter-bar.tsx`. Accept `categories` as `Array<Pick<CertDrillAdminCategory, "id" | "code" | "name">>` and `filters` as the five existing question-filter properties. Use `usePathname`, `useRouter`, and `useSearchParams` from `next/navigation`.

  Implement a `replaceFilter(name, value)` helper that:

  ```ts
  const params = new URLSearchParams(searchParams.toString());
  params.set("tab", "questions");
  if (value.trim()) params.set(name, value.trim());
  else params.delete(name);
  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  ```

  Use native `<Input>` and `<select>` controls in a responsive, single-row-capable toolbar. Give the search input `value={search}`, update local state in `onChange`, and synchronize it when `filters.questionSearch` changes. A `useEffect` must schedule `replaceFilter("questionSearch", search)` after 250 ms only when `search !== (filters.questionSearch ?? "")`; clear the timer in the effect cleanup. Each select invokes `replaceFilter` directly on change. The Clear button must remove all five `question*` parameters, retain `tab=questions`, and call the same `router.replace(..., { scroll: false })` pattern.

- [ ] **Step 4: Wire the toolbar into the server page and expand search text**

  In `apps/admin/src/modules/certdrill/admin-page.tsx`:

  ```tsx
  import { QuestionFilterBar } from "./question-filter-bar";
  ```

  Replace:

  ```tsx
  <QuestionFilterForm categories={categories} filters={questionFilters} />
  ```

  with:

  ```tsx
  <QuestionFilterBar categories={categories} filters={questionFilters} />
  ```

  Delete `QuestionFilterForm`.

  Change `filterCertDrillAdminQuestions` to accept `categories` as its second argument and `filters` as its third. Build a category lookup before filtering:

  ```ts
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  ```

  Then include this in each question's `searchableText`:

  ```ts
  const category = categoriesById.get(question.categoryId);
  const searchableText = [
    question.id,
    question.stem,
    question.status ?? "draft",
    question.difficulty ?? "medium",
    category?.id ?? "",
    category?.code ?? "",
    category?.name ?? "",
    ...(question.options ?? []).flatMap((option) => [option.text, option.explanation ?? ""]),
  ].join(" ").toLowerCase();
  ```

  Update the caller to `filterCertDrillAdminQuestions(questions, categories, questionFilters)`.

- [ ] **Step 5: Run the focused test to verify it passes**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Type-check the admin app**

  Run:

  ```bash
  bun run typecheck:admin
  ```

  Expected: exit code 0.

- [ ] **Step 7: Commit the toolbar change**

  ```bash
  git add apps/admin/src/modules/certdrill/question-filter-bar.tsx apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
  git commit -m "feat: filter questions immediately" \
    -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
    -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
  ```

### Task 2: Move publishing and archiving into table actions

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing source-contract test**

  Add this test:

  ```ts
  it("provides contextual question table actions without a publish panel", () => {
    expect(source).toContain("DropdownMenu");
    expect(source).toContain("<TableHead className=\"text-right\">Actions</TableHead>");
    expect(source).toContain("Edit");
    expect(source).toContain('const questionStatus = question.status ?? "draft";');
    expect(source).toContain('questionStatus === "draft"');
    expect(source).toContain("Publish");
    expect(source).toContain('questionStatus !== "archived"');
    expect(source).toContain("Archive");
    expect(source).not.toContain("<CardTitle>Publish question</CardTitle>");
    expect(actionsSource).toContain("archiveCertDrillQuestionAction");
    expect(actionsSource).toContain('status: "archived"');
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: FAIL because the table has no action menu, the publish card remains, and no archive action exists.

- [ ] **Step 3: Add the archive server action**

  In `apps/admin/src/modules/certdrill/admin-actions.ts`, add:

  ```ts
  export async function archiveCertDrillQuestionAction(formData: FormData) {
    const questionId = requiredString(formData, "questionId");
    if (!questionId) return;
    await updateCertDrillAdminQuestionServer(questionId, { status: "archived" });
    revalidateCertDrillAdminPage();
  }
  ```

  This deliberately uses the existing update endpoint rather than introducing a new API endpoint.

- [ ] **Step 4: Add row action menus and remove the standalone publish card**

  In `apps/admin/src/modules/certdrill/admin-page.tsx`, import `MoreHorizontal` from `lucide-react`, import `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, and `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`, and import `archiveCertDrillQuestionAction`.

  Extend `QuestionTable` props with:

  ```ts
  publishAction: (formData: FormData) => void | Promise<void>;
  archiveAction: (formData: FormData) => void | Promise<void>;
  ```

  Add the right-aligned `Actions` table header and an actions cell for every row. At the start of the `questions.map` callback, set:

  ```ts
  const questionStatus = question.status ?? "draft";
  ```

  Render a `Button` with `variant="ghost"`, `size="icon"`, and a `MoreHorizontal` icon as the dropdown trigger. Its content must include:

  ```tsx
  <DropdownMenuItem asChild>
    <LocalizedLink href={questionHref(question)}>Edit</LocalizedLink>
  </DropdownMenuItem>
  ```

  For drafts only, render this hidden form before its menu item:

  ```tsx
  <form id={`publish-question-${question.id}`} action={publishAction}>
    <input type="hidden" name="questionId" value={question.id} />
  </form>
  <DropdownMenuItem asChild>
    <button type="submit" form={`publish-question-${question.id}`}>Publish</button>
  </DropdownMenuItem>
  ```

  For non-archived questions, use the same pattern with an `archive-question-${question.id}` form ID, `archiveAction`, and a `DropdownMenuItem variant="destructive"` button labeled `Archive`. Use `DropdownMenuSeparator` between edit and state-changing actions when at least one state-changing action is present.

  Pass `publishCertDrillQuestionAction` and `archiveCertDrillQuestionAction` at both existing `QuestionTable` call sites. Delete the entire Questions-tab `Card` titled `Publish question`; leave the Generate tab's draft table intact.

- [ ] **Step 5: Run the focused test to verify it passes**

  Run:

  ```bash
  bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
  ```

  Expected: PASS.

- [ ] **Step 6: Run the admin test suite and type-check**

  Run:

  ```bash
  bun run test:admin && bun run typecheck:admin
  ```

  Expected: both commands exit with code 0.

- [ ] **Step 7: Commit the contextual actions**

  ```bash
  git add apps/admin/src/modules/certdrill/admin-actions.ts apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
  git commit -m "feat: add question table actions" \
    -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
    -m "Copilot-Session: 98608b57-dd6c-4c45-9710-1f53e3a75169"
  ```
