# Phase 5 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 5 by removing unsupported selected-user discount semantics and hardening the remaining voucher redemption behavior with tests.

**Architecture:** Discounts are provider-wide percentage discounts only. Vouchers remain the user-specific credit mechanism. Existing discount provider sync behavior stays in place; unsupported assignment APIs and UI paths are removed instead of adding an unimplemented checkout discount flow.

**Tech Stack:** Hono API, Bun/Vitest, Zod contracts, React admin UI, Drizzle schema.

---

## Files

- Modify: `packages/contracts/src/wire/discounts/common.ts` to remove `userIds` from discount create/update schemas and remove assignment schema if unused.
- Modify: `packages/contracts/src/ts/api/routes.ts` to remove discount assignment route builders.
- Modify: `apps/api/src/routes/admin.ts` to remove discount assignment endpoints and stop forwarding `userIds` in create/update.
- Modify: `apps/api/src/modules/discounts/service.ts` to remove assignment mutation helpers from public service return and create/update flows.
- Modify: `apps/api/tests/contracts/discounts.test.ts` to prove discount mutation schemas strip unsupported user assignment fields.
- Modify: `apps/api/tests/app.functional.test.ts` to remove assignment route expectations and assert assignment routes are not app-owned.
- Modify: `apps/api/tests/modules/discounts/service.test.ts` to remove assignment tests and add create/update no-user-assignment expectations.
- Modify: `apps/admin/src/components/layout/backend/admin/billing/discount-form.tsx` to remove selected-user controls.
- Modify: `apps/admin/src/components/layout/backend/admin/billing/discount-dialog.tsx` if it still passes user assignment state.
- Modify: `apps/admin/src/components/layout/backend/admin/billing/discounts-section.tsx` if it still maps `selectedUsers` into forms.
- Modify: `apps/admin/src/lib/api/admin.ts`, `apps/admin/src/lib/services/discounts.ts`, `apps/admin/src/schemas/discounts.ts`, and `apps/admin/src/types/discounts.ts` to remove assignment API helpers/types.
- Modify: `apps/api/tests/modules/vouchers/service.test.ts` to add duplicate/concurrent redemption coverage using existing mocks.

## Task 1: Remove Discount Assignment Contract Surface

- [ ] **Step 1: Write failing contract assertions**

Add to `apps/api/tests/contracts/discounts.test.ts`:

```ts
it("strips unsupported selected-user fields from discount mutations", () => {
  const createResult = createDiscountSchema.parse({
    code: "SAVE-ABC-1234",
    type: "percentage",
    value: 10,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-02-01"),
    userIds: ["11111111-1111-4111-8111-111111111111"],
  });

  const updateResult = updateDiscountSchema.parse({
    userIds: ["11111111-1111-4111-8111-111111111111"],
  });

  expect(createResult).not.toHaveProperty("userIds");
  expect(updateResult).not.toHaveProperty("userIds");
});
```

- [ ] **Step 2: Verify RED**

Run: `bun run --cwd apps/api test tests/contracts/discounts.test.ts`

Expected: FAIL because `userIds` is currently preserved by at least one schema.

- [ ] **Step 3: Implement contract removal**

Remove `userIds` from `createDiscountSchema` and `updateDiscountSchema` in `packages/contracts/src/wire/discounts/common.ts`. Remove `discountUserAssignmentSchema` and `AssignDiscountInput` only after route/admin usage is removed.

- [ ] **Step 4: Verify GREEN**

Run: `bun run --cwd apps/api test tests/contracts/discounts.test.ts`

Expected: PASS.

## Task 2: Remove Discount Assignment API Routes

- [ ] **Step 1: Write failing route expectation**

Update `apps/api/tests/app.functional.test.ts` so the discount CRUD route test no longer calls `/assign` or `/remove`, and add assertions:

```ts
const assignRes = await app.request(`/admin/discounts/${discountId}/assign`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userIds }),
});
const removeRes = await app.request(`/admin/discounts/${discountId}/remove`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userIds }),
});
expect(assignRes.status).toBe(404);
expect(removeRes.status).toBe(404);
```

- [ ] **Step 2: Verify RED**

Run: `bun run --cwd apps/api test tests/app.functional.test.ts`

Expected: FAIL because assignment endpoints still return routed responses.

- [ ] **Step 3: Implement route removal**

Remove `/admin/discounts/:discountId/assign` and `/admin/discounts/:discountId/remove` handlers from `apps/api/src/routes/admin.ts`. Remove assignment route builders from `packages/contracts/src/ts/api/routes.ts` after admin callers are removed.

- [ ] **Step 4: Verify GREEN**

Run: `bun run --cwd apps/api test tests/app.functional.test.ts`

Expected: PASS.

## Task 3: Remove Discount Assignment Service Behavior

- [ ] **Step 1: Write failing service expectations**

Update `apps/api/tests/modules/discounts/service.test.ts` by removing assignment mutation tests and adding assertions that create/update do not insert/delete `userDiscounts` when payloads include unsupported extra properties passed through `as any`.

- [ ] **Step 2: Verify RED**

Run: `bun run --cwd apps/api test tests/modules/discounts/service.test.ts`

Expected: FAIL because current service still processes `userIds` in create/update or still exposes assignment methods.

- [ ] **Step 3: Implement service removal**

In `apps/api/src/modules/discounts/service.ts`, remove `userIds` from `CreateDiscountInput` and `UpdateDiscountInput`, remove `replaceDiscountAssignments`, remove assignment insert/delete paths from create/update, and stop returning `assignDiscountToUsers`/`removeDiscountFromUsers` from the service object.

- [ ] **Step 4: Verify GREEN**

Run: `bun run --cwd apps/api test tests/modules/discounts/service.test.ts`

Expected: PASS.

## Task 4: Remove Admin Selected-User Discount UI

- [ ] **Step 1: Remove selected-user form fields and types**

Edit admin discount form/types/schemas/services to remove `userIds`, selected-user search imports, selected-user form controls, and assignment API helpers.

- [ ] **Step 2: Verify admin typecheck**

Run: `bun run --cwd apps/admin typecheck`

Expected: PASS.

## Task 5: Add Voucher Duplicate/Concurrency Coverage

- [ ] **Step 1: Inspect existing voucher redemption test fixtures**

Read `apps/api/tests/modules/vouchers/service.test.ts` and `apps/api/src/modules/vouchers/service.ts`.

- [ ] **Step 2: Write failing tests**

Add tests proving duplicate redemption reservation happens before credit mutation and that failed duplicate insert does not call `addCredits`.

- [ ] **Step 3: Verify RED**

Run: `bun run --cwd apps/api test tests/modules/vouchers/service.test.ts`

Expected: FAIL if coverage reveals missing duplicate/concurrency behavior. If existing behavior already passes, keep the tests as regression coverage and note that RED was not possible because behavior was already implemented.

- [ ] **Step 4: Implement minimal fix if needed**

Only change `apps/api/src/modules/vouchers/service.ts` if the new tests reveal a real behavior gap.

- [ ] **Step 5: Verify GREEN**

Run: `bun run --cwd apps/api test tests/modules/vouchers/service.test.ts`

Expected: PASS.

## Task 6: Final Verification And PR

- [ ] **Step 1: Run focused checks**

Run:

```bash
bun run --cwd apps/api test tests/contracts/discounts.test.ts
bun run --cwd apps/api test tests/modules/discounts/service.test.ts
bun run --cwd apps/api test tests/modules/vouchers/service.test.ts
bun run --cwd apps/api test tests/app.functional.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run broad checks**

Run:

```bash
bun run --cwd apps/api test
bun run typecheck:all
```

Expected: all PASS.

- [ ] **Step 3: Commit implementation**

Commit message: `fix: complete phase 5 discount semantics`.

- [ ] **Step 4: Push and open PR**

Push branch `pr/3.14-complete-phase-5` and create a PR against `main` summarizing removed selected-user discounts and voucher concurrency coverage.
