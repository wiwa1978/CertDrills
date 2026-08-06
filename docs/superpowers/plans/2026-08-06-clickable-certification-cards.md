# Clickable Certification Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each CertDrill certification overview card navigate to its detail page and remove redundant overview actions.

**Architecture:** Keep the existing server-rendered overview and detail-route helper. Wrap each card in a normal Next.js link for native keyboard, browser, and accessibility behavior; remove nested action controls so the linked card remains valid interactive markup.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Make Certification Cards Clickable

**Files:**
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts:52-80`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx:1269-1312`
- Test: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing overview-card contract test**

In `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`, derive the
overview-card function source and replace the global button assertions:

```ts
const certificationOverviewSource = source.slice(
  source.indexOf("function AdminCertificationOverviewTable"),
  source.indexOf("function CategoryTable"),
);
```

Inside the existing primary-label test, assert:

```ts
expect(certificationOverviewSource).toContain(
  '<Link key={certification.id} href={certdrillAdminDetailHref(certification.id)}',
);
expect(certificationOverviewSource).toContain("<Card");
expect(certificationOverviewSource).not.toContain("Open details");
expect(certificationOverviewSource).not.toContain("Archive certification");
expect(certificationOverviewSource).not.toContain(
  '<form action={archiveCertDrillCertificationAction}>',
);
expect(certificationOverviewSource).toContain("certification.logoUrl");
expect(certificationOverviewSource).toContain("publishedQuestionCount");
```

Remove the old global expectations that require `Open details` and `Archive
certification`, while retaining assertions for the detail-page archive
functionality elsewhere in the file.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because the overview card is not yet wrapped in a link and still
contains both action buttons.

- [ ] **Step 3: Replace overview actions with a linked card**

In `AdminCertificationOverviewTable`, replace the returned card markup with:

```tsx
return (
  <Link
    key={certification.id}
    href={certdrillAdminDetailHref(certification.id)}
    className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  >
    <Card className="h-full transition-colors group-hover:border-foreground/30 group-hover:bg-muted/20">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-semibold">
            {logoUrl ? <img src={logoUrl} alt={`${certification.code} logo`} className="size-full object-contain p-1" /> : certification.code.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{certification.code}</CardTitle>
            <CardDescription className="line-clamp-2">{certification.name}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{certification.vendor}</Badge>
          <Badge variant="outline">{visibility}</Badge>
          <Badge variant="secondary">{publishedQuestionCount.toLocaleString()} questions</Badge>
        </div>
      </CardContent>
    </Card>
  </Link>
);
```

Do not change the detail route helper, archive server action, detail-page
archive button, or certification content.

- [ ] **Step 4: Run the focused test**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run admin tests and typecheck**

Run:

```bash
bun run --cwd apps/admin test
bun run --cwd apps/admin typecheck
```

Expected: all admin tests and the typecheck pass.

- [ ] **Step 6: Commit the change**

```bash
git add \
  apps/admin/src/modules/certdrill/admin-page.tsx \
  apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "feat: make certification cards clickable" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 604b49be-e651-415f-81ab-de8b4a757c92"
```
