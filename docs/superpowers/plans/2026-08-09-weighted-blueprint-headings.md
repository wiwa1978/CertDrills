# Weighted Blueprint Headings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict AI blueprint proposals to weighted heading lines and preserve exact percentages and percentage ranges.

**Architecture:** Extend the structured proposal schema with minimum and maximum weights, then enforce weighted top-level heading rules during runtime validation. Tighten the Foundry prompt and update the admin wire model/dialog to display ranges while remaining compatible with existing persisted proposals.

**Tech Stack:** TypeScript 5.9, Zod, Microsoft Foundry Responses API, React 19, Vitest

---

## File Structure

- Modify `apps/api/src/modules/certdrill/blueprint-proposal.ts` — range fields and weighted-heading validation.
- Modify `apps/api/tests/modules/certdrill/blueprint-proposal.test.ts` — exact/range/invalid proposal tests.
- Modify `apps/api/src/modules/certdrill/blueprint-parser.ts` — weighted-heading-only system prompt.
- Modify `apps/api/tests/modules/certdrill/blueprint-parser.test.ts` — request and response fixtures.
- Modify `apps/api/tests/modules/certdrill/blueprint-parse-service.test.ts` — extended proposal fixtures.
- Modify `apps/admin/src/lib/api/certdrill.server.ts` — backward-compatible range wire fields.
- Modify `apps/admin/src/modules/certdrill/blueprint-analysis-control.tsx` — range formatting.
- Modify `apps/admin/tests/modules/certdrill/blueprint-analysis-control.test.ts` — exact/range/legacy rendering.

### Task 1: Weighted-heading proposal validation

**Files:**
- Modify: `apps/api/src/modules/certdrill/blueprint-proposal.ts`
- Modify: `apps/api/tests/modules/certdrill/blueprint-proposal.test.ts`

- [ ] **Step 1: Write failing exact and range tests**

Valid exact category:

```ts
{
  code: "AUTHOR-WORKFLOWS",
  name: "Author and manage workflows",
  parentCode: null,
  weightPct: 20,
  weightMinPct: 20,
  weightMaxPct: 20,
  sortOrder: 1,
  evidence: [{
    excerpt: "Author and manage workflows (20%)",
    location: "Skills at a glance",
  }],
}
```

Valid range category:

```ts
{
  code: "AUTHOR-WORKFLOWS",
  name: "Author and manage workflows",
  parentCode: null,
  weightPct: null,
  weightMinPct: 20,
  weightMaxPct: 25,
  sortOrder: 1,
  evidence: [{
    excerpt: "Author and manage workflows (20–25%)",
    location: "Skills at a glance",
  }],
}
```

Assert both pass and preserve their values without midpoint conversion.

- [ ] **Step 2: Write failing rejection tests**

Reject:

- all three weight fields null;
- only one range bound present;
- minimum greater than maximum;
- any value outside 0–100;
- exact `weightPct` differing from min/max;
- non-null `parentCode`;
- evidence without `%`;
- evidence containing a percentage but not the normalized category title.

- [ ] **Step 3: Verify RED**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-proposal.test.ts
```

Expected: FAIL because the new fields and constraints do not exist.

- [ ] **Step 4: Extend the strict schema**

Add required nullable fields:

```ts
weightPct: z.number().min(0).max(100).nullable(),
weightMinPct: z.number().min(0).max(100).nullable(),
weightMaxPct: z.number().min(0).max(100).nullable(),
```

All fields remain required in structured output even though their values may be null.

- [ ] **Step 5: Replace hierarchy/missing-weight validation**

Every category must have `parentCode === null`. Add custom issues with these messages:

```text
Weighted blueprint categories must be top-level.
Category must define an exact percentage or percentage range.
Percentage range requires both minimum and maximum values.
Percentage range minimum must not exceed maximum.
Exact percentage must equal both percentage range bounds.
Evidence must include the weighted category title and percentage.
```

Use:

```ts
function normalizeEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();
}
```

A category has weighted-heading evidence when one excerpt's normalized text includes the normalized category name and the original excerpt contains `%`.

Remove missing-weight warning generation and child hierarchy/cycle validation. Keep code uniqueness and uppercase normalization.

- [ ] **Step 6: Verify schema output**

Assert `blueprintProposalJsonSchema` includes `weightMinPct` and `weightMaxPct` in category properties and required fields, while unsupported numeric constraints remain sanitized.

- [ ] **Step 7: Verify and commit**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-proposal.test.ts
bun run typecheck:api
git add apps/api/src/modules/certdrill/blueprint-proposal.ts apps/api/tests/modules/certdrill/blueprint-proposal.test.ts
git commit -m "feat: validate weighted blueprint headings"
```

### Task 2: Foundry weighted-heading extraction

**Files:**
- Modify: `apps/api/src/modules/certdrill/blueprint-parser.ts`
- Modify: `apps/api/tests/modules/certdrill/blueprint-parser.test.ts`
- Modify: `apps/api/tests/modules/certdrill/blueprint-parse-service.test.ts`

- [ ] **Step 1: Update failing parser expectations**

Every proposal fixture must contain:

```ts
weightPct: 100,
weightMinPct: 100,
weightMaxPct: 100,
```

For a range fixture use:

```ts
weightPct: null,
weightMinPct: 20,
weightMaxPct: 25,
```

Update parse-service fixtures so completed runs persist the extended proposal unchanged.

- [ ] **Step 2: Add prompt contract assertions**

Assert the system prompt states:

```text
Only return headings whose own title line is immediately associated with a percentage or percentage range.
Preserve percentage ranges using weightMinPct and weightMaxPct; never choose or calculate a midpoint.
Every returned category must be top-level with parentCode set to null.
Detailed subsection headings may be used as evidence but must not be returned as categories.
Exclude headings without an adjacent percentage from categories.
```

- [ ] **Step 3: Verify RED**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-parser.test.ts tests/modules/certdrill/blueprint-parse-service.test.ts
```

- [ ] **Step 4: Replace the system prompt**

Retain the existing untrusted-document and schema-only instructions. Replace the old missing-weight instruction with the five weighted-heading rules from Step 2.

- [ ] **Step 5: Verify and commit**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-parser.test.ts tests/modules/certdrill/blueprint-parse-service.test.ts
bun run typecheck:api
git add apps/api/src/modules/certdrill/blueprint-parser.ts apps/api/tests/modules/certdrill/blueprint-parser.test.ts apps/api/tests/modules/certdrill/blueprint-parse-service.test.ts
git commit -m "feat: extract weighted blueprint headings"
```

### Task 3: Admin percentage-range display

**Files:**
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Modify: `apps/admin/src/modules/certdrill/blueprint-analysis-control.tsx`
- Modify: `apps/admin/tests/modules/certdrill/blueprint-analysis-control.test.ts`

- [ ] **Step 1: Write failing display tests**

Add completed proposal rows for:

- new range: `weightPct: null`, `weightMinPct: 20`, `weightMaxPct: 25` → `20–25%`;
- new exact: `weightPct: 20`, `weightMinPct: 20`, `weightMaxPct: 20` → `20%`;
- legacy exact: `weightPct: 15`, range fields absent → `15%`;
- malformed legacy/missing: all null/absent → `Not provided`.

- [ ] **Step 2: Extend the wire type compatibly**

```ts
weightPct: Nullable<number>;
weightMinPct?: Nullable<number>;
weightMaxPct?: Nullable<number>;
```

Optional range fields allow existing stored proposal JSON to remain readable.

- [ ] **Step 3: Add the formatter**

Export:

```ts
export function formatBlueprintWeight(
  category: Pick<
    CertDrillBlueprintCategoryProposal,
    "weightPct" | "weightMinPct" | "weightMaxPct"
  >,
) {
  const { weightPct, weightMinPct, weightMaxPct } = category;

  if (weightMinPct != null && weightMaxPct != null) {
    return weightMinPct === weightMaxPct
      ? `${weightMinPct}%`
      : `${weightMinPct}–${weightMaxPct}%`;
  }

  return weightPct == null ? "Not provided" : `${weightPct}%`;
}
```

Use it in the Weight table cell.

- [ ] **Step 4: Verify targeted admin behavior**

```bash
bun run --cwd apps/admin test -- tests/modules/certdrill/blueprint-analysis-control.test.ts
bun run typecheck:admin
```

- [ ] **Step 5: Run full validation**

```bash
bun run typecheck:all
bun run test:api
bun run test:admin
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/api/certdrill.server.ts apps/admin/src/modules/certdrill/blueprint-analysis-control.tsx apps/admin/tests/modules/certdrill/blueprint-analysis-control.test.ts
git commit -m "feat: display blueprint weight ranges"
```
