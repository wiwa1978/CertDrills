# Question Editor UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline CertDrill question editor with dedicated create and edit
pages that separate Question and Answers content.

**Architecture:** Keep validation and persistence in the existing server actions. Export a
focused reusable question-editor page from the CertDrill module, then add thin App
Router routes for `/questions/new` and `/questions/[questionId]`. The certification
detail Questions tab becomes an index that links into those pages.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Add dedicated question editor routes

**Files:**
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/new/page.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/[questionId]/page.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write failing route-contract assertions**

Add source fixtures for both new route files to
`apps/admin/tests/components/certdrill-admin-page-copy.test.ts` and add this test:

```ts
  it("uses dedicated routes to create and edit questions", () => {
    expect(source).toContain('questionEditorNewHref(selectedCertificationId)');
    expect(source).toContain('questionEditorHref(selectedCertificationId, question.id)');
    expect(newQuestionRouteSource).toContain("CertDrillQuestionEditorPage");
    expect(editQuestionRouteSource).toContain("questionId");
    expect(editQuestionRouteSource).toContain("CertDrillQuestionEditorPage");
  });
```

- [ ] **Step 2: Run the route-contract test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because neither dedicated route file nor route helper exists.

- [ ] **Step 3: Add the reusable editor page export**

In `apps/admin/src/modules/certdrill/admin-page.tsx`, export a
`CertDrillQuestionEditorPage` server component. It receives:

```ts
{
  certificationId: string;
  questionId?: string;
}
```

It loads the certification catalog, admin certifications, categories, and questions
using the existing server helpers. It must locate an edit target only within the
loaded certification questions:

```ts
const selectedQuestion = questionId
  ? questions.find((question) => question.id === questionId)
  : undefined;
```

Render `EmptyState` with `Question not found.` when `questionId` is supplied but no
question is found. Otherwise render the shared question form with
`createCertDrillQuestionAction` for a new question and
`updateCertDrillQuestionAction` for an existing one.

- [ ] **Step 4: Add the App Router pages**

Create the new-question route with:

```tsx
import { Container } from "@/components/ui/container";
import { CertDrillQuestionEditorPage } from "@/modules/certdrill/admin-page";

export default async function NewCertDrillQuestionPage({
  params,
}: {
  params: Promise<{ certificationId: string }>;
}) {
  const { certificationId } = await params;

  return (
    <Container className="py-6">
      <CertDrillQuestionEditorPage certificationId={certificationId} />
    </Container>
  );
}
```

Create the edit route identically, passing both `certificationId` and `questionId`
from its awaited params.

- [ ] **Step 5: Add URL helpers and replace index editor links**

Add these helpers in `apps/admin/src/modules/certdrill/admin-page.tsx`:

```ts
function questionEditorNewHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}/questions/new`;
}

function questionEditorHref(certificationId: string, questionId: string) {
  return `/admin/certdrill/${certificationId}/questions/${questionId}`;
}
```

Replace the Questions-tab inline `QuestionForm` and `SelectionLinks` usage with:

```tsx
<Button asChild disabled={!selectedCertificationId}>
  <Link href={questionEditorNewHref(selectedCertificationId)}>Create question</Link>
</Button>
```

and make each question-table or index link use:

```tsx
<Link href={questionEditorHref(selectedCertificationId, question.id)}>
```

Keep filters, publish, and the Questions table in the tab.

- [ ] **Step 6: Run the route-contract test and verify it passes**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the dedicated route work**

```bash
git add apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/certdrill/[certificationId]/questions \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "feat: add dedicated question editor routes"
```

### Task 2: Separate Question and Answers sections

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing editor-layout assertion**

Extend the dedicated-editor test with:

```ts
    expect(source).toContain("<CardTitle>Question</CardTitle>");
    expect(source).toContain("<CardTitle>Answers</CardTitle>");
    expect(source.indexOf("<CardTitle>Question</CardTitle>"))
      .toBeLessThan(source.indexOf("<CardTitle>Answers</CardTitle>"));
```

- [ ] **Step 2: Run the editor-layout test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because the current editor uses an undifferentiated form and an
`Answer options` bordered div.

- [ ] **Step 3: Reorganize the shared question form**

Keep the hidden certification/question IDs, action, and submit button in
`QuestionForm`. Replace the body from `QuestionFormFields` with two `Card`
sections:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Question</CardTitle>
    <CardDescription>Choose the category and define the question prompt.</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* category, stem, difficulty, status, optional source resource */}
  </CardContent>
</Card>
```

```tsx
<Card>
  <CardHeader>
    <CardTitle>Answers</CardTitle>
    <CardDescription>Select one correct answer and provide the supporting details for every option.</CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* correct-option radio control and all four option groups */}
  </CardContent>
</Card>
```

Place `CategorySelect` first in the Question card, followed by the stem. Preserve
all existing field names (`categoryId`, `stem`, `difficulty`, `status`,
`correctOption`, `option${index}Text`, `option${index}Explanation`, and
`option${index}CitationUrls`) so existing server actions continue to parse data.

- [ ] **Step 4: Run the editor-layout test and verify it passes**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the affected type check**

Run:

```bash
bun run typecheck:admin
```

Expected: exits with status 0.

- [ ] **Step 6: Commit the editor layout**

```bash
git add apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "feat: separate question editor answers"
```

### Task 3: Validate the complete admin behavior

**Files:**
- Modify: none
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Run the complete admin suite**

Run:

```bash
bun run test:admin
```

Expected: all admin Vitest suites pass.

- [ ] **Step 2: Run the complete admin type check**

Run:

```bash
bun run typecheck:admin
```

Expected: exits with status 0.

- [ ] **Step 3: Confirm the expected routes manually**

Open the new-question route and an existing-question route while authenticated:

```text
/admin/certdrill/<certificationId>/questions/new
/admin/certdrill/<certificationId>/questions/<questionId>
```

Expected: each route shows the two editor cards; the edit route prepopulates the
question and answers, while a foreign or missing question ID displays `Question not
found.`.

- [ ] **Step 4: Commit any test-only correction**

If the final verification required a test-only correction:

```bash
git add apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "test: cover question editor routes"
```
