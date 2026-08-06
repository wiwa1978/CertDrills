# Certification Card Tag Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make certification overview cards equal height and align their badge rows by reserving two subtitle lines.

**Architecture:** Keep the existing responsive card grid and locale-aware links. Use Tailwind flex layout utilities on each card and its content area, plus a two-line minimum height on the clamped certification name.

**Tech Stack:** React 19, Next.js 16, Tailwind CSS 4, Vitest

---

### Task 1: Align certification card badges

**Files:**
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx:1286-1304`

- [ ] **Step 1: Write the failing layout contract test**

Add these expectations to the existing `links overview cards to certification details without nested actions` test:

```ts
expect(certificationOverviewSource).toContain(
  '<Card className="flex h-full flex-col transition-colors group-hover:border-primary/40">',
);
expect(certificationOverviewSource).toContain(
  '<CardDescription className="min-h-10 line-clamp-2">',
);
expect(certificationOverviewSource).toContain(
  '<CardContent className="flex flex-1 flex-col justify-end">',
);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun run --cwd apps/admin test -- tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because the card does not yet contain the vertical flex, reserved subtitle height, and expanding content classes.

- [ ] **Step 3: Implement the aligned card layout**

In `AdminCertificationOverviewTable`, update the card, description, and content classes:

```tsx
<Card className="flex h-full flex-col transition-colors group-hover:border-primary/40">
```

```tsx
<CardDescription className="min-h-10 line-clamp-2">{certification.name}</CardDescription>
```

```tsx
<CardContent className="flex flex-1 flex-col justify-end">
```

Keep the existing badge wrapper unchanged:

```tsx
<div className="flex flex-wrap gap-2">
  <Badge variant="outline">{certification.vendor}</Badge>
  <Badge variant="outline">{visibility}</Badge>
  <Badge variant="secondary">{publishedQuestionCount.toLocaleString()} questions</Badge>
</div>
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
bun run --cwd apps/admin test -- tests/components/certdrill-admin-page-copy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run admin verification**

Run:

```bash
bun run test:admin && bun run typecheck:admin
```

Expected: all admin tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the implementation**

```bash
git add apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "fix: align certification card badges"
```
