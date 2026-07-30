# Category-to-Question Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CertDrill admin category links open the Questions tab with that category selected as the question filter.

**Architecture:** Persist only this deep-link destination in the certification detail URL with a `tab=questions` query parameter. The server route normalizes the parameter and the existing server-rendered page validates it against the known tab names before choosing the initial Radix tab; category code and name links pass both the filter and destination tab.

**Tech Stack:** Next.js 16 App Router, React 19, Radix Tabs, TypeScript, Vitest.

---

### Task 1: Deep-link category rows to filtered Questions

**Files:**
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx:15-50`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx:45-95, 130-215, 1360-1380`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts:99-102`

- [ ] **Step 1: Write the failing regression test**

Replace the category-navigation assertion with assertions that require both the URL
parameter emitted by the category links and its route/page handling:

```ts
  it("opens filtered questions when selecting a category", () => {
    expect(source).toContain('selectedCertificationHref({ questionCategoryId: category.id, tab: "questions" })');
    expect(source).toContain("selectedTab?: string;");
    expect(source).toContain('selectedTab === "questions"');
    expect(detailRouteSource).toContain("tab?: SearchParamValue");
    expect(detailRouteSource).toContain("selectedTab={firstSearchParamString(tab)}");
  });
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because neither the route/page tab contract nor the category-link
`tab: "questions"` parameter exists.

- [ ] **Step 3: Extend the route and page tab contract**

In `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx`,
add `tab?: SearchParamValue` to `searchParams`, destructure `tab`, and pass it:

```tsx
    { categoryId, questionId, examFormId, resourceId, questionSearch, questionStatus, questionDifficulty, questionCategoryId, questionSort, feedbackStatus, tab },
```

```tsx
        selectedTab={firstSearchParamString(tab)}
```

In `apps/admin/src/modules/certdrill/admin-page.tsx`, add `selectedTab?: string`
to `CertDrillAdminPageProps`, add `tab?: string` to `CertDrillAdminHrefParams`,
and destructure the new page prop:

```tsx
  selectedTab,
```

Immediately before `defaultTab`, validate the value against the defined tab names
and prioritize only a valid value:

```tsx
  const defaultTab = selectedTab === "categories"
    || selectedTab === "questions"
    || selectedTab === "exam-forms"
    || selectedTab === "resources"
    || selectedTab === "generate"
    || selectedTab === "feedback"
    ? selectedTab
    : requestedCategoryId || requestedQuestionId || hasQuestionFilters ? "questions" : "categories";
```

- [ ] **Step 4: Emit the Questions tab from category links**

Update both links in `CategoryTable` in
`apps/admin/src/modules/certdrill/admin-page.tsx`:

```tsx
<Link href={selectedCertificationHref({ questionCategoryId: category.id, tab: "questions" })} className="hover:underline">
```

The two links must remain otherwise identical so category code and category name
behave the same way.

- [ ] **Step 5: Run the focused regression test to verify it passes**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: PASS, including `opens filtered questions when selecting a category`.

- [ ] **Step 6: Run the affected type check**

Run:

```bash
bun run typecheck:admin
```

Expected: exits with status 0.

- [ ] **Step 7: Commit the implementation**

```bash
git add apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/certdrill/[certificationId]/page.tsx apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "fix: open category questions tab" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 238767f7-eea0-43aa-8bce-0fd5ade2bbaa"
```
