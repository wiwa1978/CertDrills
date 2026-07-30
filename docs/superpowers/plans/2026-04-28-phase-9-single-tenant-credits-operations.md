# Phase 9 Single-Tenant Credits Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operational capabilities for a single-tenant credits-billing product: credit usage, admin adjustments, email/webhook operations, and account data lifecycle controls.

**Architecture:** Build on the existing credit ledger, audit, notification, and webhook-event-store patterns. Keep each operational slice independently testable, with database migrations and contracts landing before UI. Treat side effects such as notification/email delivery as best-effort unless the task explicitly marks them as required for correctness.

**Tech Stack:** Bun, TypeScript, Hono API, Drizzle, PostgreSQL, Zod contracts, Better Auth, Dodo Payments, Next.js admin/web apps.

---

## Scope Notes

This phase is single-tenant only. Do not add organizations, teams, tenant IDs, memberships, seat management, subscription plans, trials, upgrades, downgrades, cancellations, recurring billing, or renewal webhooks.

Credits remain the only billing model. Billing operations in this plan must adjust, consume, refund, or report credits only.

## File Structure

Expected files to inspect and modify:

- `packages/platform-db/src/schema/billing.ts`: credit usage idempotency, webhook retry/dead-letter columns.
- `packages/platform-db/src/schema/notifications.ts` or new `packages/platform-db/src/schema/email.ts`: email templates and delivery logs.
- `packages/platform-db/src/schema/auth.ts`: admin-forced password reset marker if supported.
- `packages/platform-db/src/schema/account-lifecycle.ts`: export/deletion/retention request tables.
- `packages/platform-db/src/schema/index.ts`: export new schema tables.
- `packages/platform-db/drizzle/*.sql`: ordered migrations after `0005_add_audit_entries.sql`.
- `packages/contracts/src/wire/billing/requests.ts`, `packages/contracts/src/wire/billing/responses.ts`: credit usage contracts.
- `packages/contracts/src/wire/admin/requests.ts`, `packages/contracts/src/wire/admin/responses.ts`: admin adjustment, webhook, email, lifecycle contracts.
- `packages/contracts/src/wire/email/requests.ts`, `packages/contracts/src/wire/email/responses.ts`: email template/log contracts if a separate namespace is cleaner.
- `packages/contracts/src/wire/index.ts`: export new contracts.
- `packages/contracts/src/ts/api/routes.ts`: route constants.
- `apps/api/src/modules/billing/service.ts`: credit ledger primitives, usage, admin adjustments.
- `apps/api/src/modules/admin/service.ts`: admin list/read helpers for operations.
- `apps/api/src/modules/email/service.ts`: template/log management.
- `apps/api/src/modules/payments/webhook-event-store.ts`: retry/dead-letter state.
- `apps/api/src/modules/account-lifecycle/service.ts`: export/deletion/retention operations.
- `apps/api/src/routes/me.ts`: user credit usage, data export, account deletion routes.
- `apps/api/src/routes/admin.ts`: admin adjustment, email, webhook, lifecycle routes.
- `apps/api/src/openapi.ts`: document new routes and schemas.
- `apps/admin/src/lib/api/admin.ts`, `apps/admin/src/lib/services/admin.ts`: admin frontend wrappers.
- `apps/web/src/lib/api/me.ts`, `apps/web/src/lib/services/credits.ts`: user frontend wrappers.
- `apps/admin/src/components/layout/backend/admin/**`: admin UI surfaces added after APIs land.
- `apps/web/src/components/layout/backend/**`: user lifecycle/export UI added after APIs land.

## Migration Naming

Use these migration names unless Drizzle generates different numeric prefixes:

- `0006_phase9_credit_usage_idempotency.sql`
- `0007_phase9_admin_credit_adjustments.sql`
- `0008_phase9_admin_security_controls.sql`
- `0009_phase9_email_templates_logs.sql`
- `0010_phase9_webhook_retries_dead_letter.sql`
- `0011_phase9_account_lifecycle.sql`

After each schema task, run: `PATH="/home/wim/.bun/bin:$PATH" bun run db:check`

## Task 1: Normalize Credit Ledger Primitives

**Files:**
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `packages/platform-db/src/schema/billing.ts` if an invalid transaction type migration is required
- Modify: `packages/contracts/src/wire/billing/responses.ts` if transaction type enum is stale
- Test: `apps/api/tests/modules/billing/service.test.ts`
- Test: `apps/api/tests/modules/billing/transactional.behavior.test.ts`

- [ ] **Step 1: Add failing regression test for invalid adjustment type**

In `apps/api/tests/modules/billing/service.test.ts`, add a test that verifies dispute/reversal paths write only transaction types accepted by the DB/schema contract:

```ts
it("uses the supported admin_adjustment transaction type for credit reversals", async () => {
  const insertedTransactions: Array<Record<string, unknown>> = [];
  const db = createBillingDbMock({
    onInsert(table, values) {
      if (table === creditTransactions) {
        insertedTransactions.push(values as Record<string, unknown>);
      }
    },
  });
  const service = createBillingService(createBillingDeps({ db }));

  await service.processCreditPurchase("user-1", "starter", "payment-1", "completed");
  await service.processCreditPurchase("user-1", "starter", "payment-1", "refunded");

  expect(insertedTransactions.map((item) => item.type)).not.toContain("adjustment");
  expect(insertedTransactions.map((item) => item.type)).toContain("admin_adjustment");
});
```

Adapt the mock helper names to the existing billing tests. The expected failure is a transaction insert with `type: "adjustment"` if that path still exists.

- [ ] **Step 2: Run test and verify it fails**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/billing/service.test.ts`

Expected: FAIL if the invalid `adjustment` type is still emitted; otherwise PASS and continue with Step 3 to add ledger primitives.

- [ ] **Step 3: Add internal ledger result types**

In `apps/api/src/modules/billing/service.ts`, add these local types near existing billing types:

```ts
type CreditLedgerTransactionType = "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment" | "voucher";
type CreditLedgerReferenceType = "payment" | "feature_usage" | "admin" | "bonus" | "voucher";

type ApplyCreditDeltaInput = {
  userId: string;
  amount: number;
  type: CreditLedgerTransactionType;
  description: string;
  referenceType?: CreditLedgerReferenceType;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  allowNegativeBalance?: boolean;
  createdAt?: Date;
};

type ApplyCreditDeltaResult = {
  transactionId: string;
  balanceBefore: string;
  balanceAfter: string;
};
```

- [ ] **Step 4: Implement decimal-safe ledger helper**

In `apps/api/src/modules/billing/service.ts`, add a helper inside `createBillingService` that runs within an existing transaction or normal DB object:

```ts
async function applyCreditDelta(db: typeof deps.db, input: ApplyCreditDeltaInput): Promise<ApplyCreditDeltaResult> {
  const current = await getOrInitializeCredits(db, input.userId);
  const balanceBefore = Number(current.balance);
  const balanceAfter = balanceBefore + input.amount;

  if (!input.allowNegativeBalance && balanceAfter < 0) {
    throw new Error("Insufficient credits");
  }

  const now = input.createdAt ?? new Date();

  await db
    .update(userCredits)
    .set({
      balance: balanceAfter.toFixed(2),
      totalSpent: input.type === "usage" ? (Number(current.totalSpent) + Math.abs(input.amount)).toFixed(2) : current.totalSpent,
      updatedAt: now,
    })
    .where(eq(userCredits.userId, input.userId));

  const [transaction] = await db.insert(creditTransactions).values({
    userId: input.userId,
    type: input.type,
    amount: input.amount.toFixed(2),
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    metadata: input.metadata,
    balanceAfter: balanceAfter.toFixed(2),
    createdAt: now,
  }).returning({ id: creditTransactions.id });

  return {
    transactionId: transaction.id,
    balanceBefore: balanceBefore.toFixed(2),
    balanceAfter: balanceAfter.toFixed(2),
  };
}
```

If Drizzle test mocks do not support `.returning()`, update the mocks in the focused tests so the helper can return `{ id: "transaction-1" }`.

- [ ] **Step 5: Replace existing purchase/refund delta code**

Use `applyCreditDelta` in purchase, bonus, refund, and voucher paths where it reduces duplicate credit balance update logic. Keep payment purchase idempotency behavior unchanged.

For a payment refund/reversal, use:

```ts
type: "admin_adjustment",
referenceType: "payment",
description: `Credit reversal for payment ${paymentId}`,
allowNegativeBalance: true,
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/billing/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/billing/transactional.behavior.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/billing/service.ts apps/api/tests/modules/billing/service.test.ts apps/api/tests/modules/billing/transactional.behavior.test.ts packages/platform-db/src/schema/billing.ts packages/contracts/src/wire/billing/responses.ts
git commit -m "fix: normalize credit ledger transactions"
```

## Task 2: Add Credit Usage API With Idempotency

**Files:**
- Modify: `packages/platform-db/src/schema/billing.ts`
- Modify: `packages/platform-db/src/schema/index.ts`
- Create: `packages/platform-db/drizzle/0006_phase9_credit_usage_idempotency.sql`
- Modify: `packages/contracts/src/wire/billing/requests.ts`
- Modify: `packages/contracts/src/wire/billing/responses.ts`
- Modify: `packages/contracts/src/wire/index.ts`
- Modify: `packages/contracts/src/ts/api/routes.ts`
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/openapi.ts`
- Test: `apps/api/tests/modules/billing/service.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Add credit usage idempotency table**

In `packages/platform-db/src/schema/billing.ts`, add:

```ts
export const creditUsageEvents = pgTable(
  "credit_usage_events",
  {
    id,
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    featureKey: text("feature_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    transactionId: uuid("transaction_id").references(() => creditTransactions.id, { onDelete: "restrict" }).notNull(),
    metadata: jsonb("metadata"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("credit_usage_events_user_id_idempotency_key_idx").on(table.userId, table.idempotencyKey),
    index("credit_usage_events_feature_key_created_at_idx").on(table.featureKey, table.createdAt),
    index("credit_usage_events_transaction_id_idx").on(table.transactionId),
  ],
);
```

Export relations if the schema file uses relation definitions for all billing tables.

- [ ] **Step 2: Add migration SQL**

Create `packages/platform-db/drizzle/0006_phase9_credit_usage_idempotency.sql`:

```sql
CREATE TABLE IF NOT EXISTS "credit_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "feature_key" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "transaction_id" uuid NOT NULL REFERENCES "credit_transactions"("id") ON DELETE restrict,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_usage_events_user_id_idempotency_key_idx" ON "credit_usage_events" ("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "credit_usage_events_feature_key_created_at_idx" ON "credit_usage_events" ("feature_key", "created_at");
CREATE INDEX IF NOT EXISTS "credit_usage_events_transaction_id_idx" ON "credit_usage_events" ("transaction_id");
```

- [ ] **Step 3: Add contracts**

In `packages/contracts/src/wire/billing/requests.ts`, add:

```ts
import { z } from "zod";

export const consumeCreditsRequestSchema = z.object({
  featureKey: z.string().trim().min(1).max(100),
  amount: z.number().positive().max(100_000),
  idempotencyKey: z.string().trim().min(8).max(128),
  description: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConsumeCreditsRequest = z.infer<typeof consumeCreditsRequestSchema>;
```

In `packages/contracts/src/wire/billing/responses.ts`, add:

```ts
export const consumeCreditsResponseSchema = z.object({
  transactionId: z.string(),
  idempotencyKey: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  alreadyProcessed: z.boolean(),
});

export type ConsumeCreditsResponse = z.infer<typeof consumeCreditsResponseSchema>;
```

Export these schemas from `packages/contracts/src/wire/index.ts`.

- [ ] **Step 4: Add failing service tests**

In `apps/api/tests/modules/billing/service.test.ts`, add tests for:

```ts
it("consumes credits and records an idempotency key", async () => {
  const service = createBillingService(createBillingDepsWithBalance("user-1", "10.00"));

  const result = await service.consumeCredits("user-1", {
    featureKey: "ai-summary",
    amount: 2,
    idempotencyKey: "usage-key-1",
    description: "AI summary",
  });

  expect(result).toMatchObject({
    idempotencyKey: "usage-key-1",
    balanceBefore: "10.00",
    balanceAfter: "8.00",
    alreadyProcessed: false,
  });
});

it("returns the original result for repeated usage idempotency keys", async () => {
  const service = createBillingService(createBillingDepsWithBalance("user-1", "10.00"));

  const first = await service.consumeCredits("user-1", { featureKey: "ai-summary", amount: 2, idempotencyKey: "usage-key-1" });
  const second = await service.consumeCredits("user-1", { featureKey: "ai-summary", amount: 2, idempotencyKey: "usage-key-1" });

  expect(second).toEqual({ ...first, alreadyProcessed: true });
});

it("rejects credit usage when balance is insufficient", async () => {
  const service = createBillingService(createBillingDepsWithBalance("user-1", "1.00"));

  await expect(service.consumeCredits("user-1", { featureKey: "ai-summary", amount: 2, idempotencyKey: "usage-key-1" })).rejects.toThrow("Insufficient credits");
});
```

Adapt the helper names to the existing test utilities. Do not use `any` in new helpers.

- [ ] **Step 5: Implement `consumeCredits`**

In `apps/api/src/modules/billing/service.ts`, add:

```ts
async function consumeCredits(userId: string, input: ConsumeCreditsRequest): Promise<ConsumeCreditsResponse> {
  return deps.db.transaction(async (tx) => {
    const existing = await tx.query.creditUsageEvents.findFirst({
      where: (table, operators) => operators.and(
        operators.eq(table.userId, userId),
        operators.eq(table.idempotencyKey, input.idempotencyKey),
      ),
      with: { transaction: true },
    });

    if (existing) {
      return {
        transactionId: existing.transactionId,
        idempotencyKey: existing.idempotencyKey,
        balanceBefore: (Number(existing.transaction.balanceAfter) + Number(existing.amount)).toFixed(2),
        balanceAfter: existing.transaction.balanceAfter,
        alreadyProcessed: true,
      };
    }

    const result = await applyCreditDelta(tx, {
      userId,
      amount: -Math.abs(input.amount),
      type: "usage",
      description: input.description ?? `Usage: ${input.featureKey}`,
      referenceType: "feature_usage",
      referenceId: input.idempotencyKey,
      metadata: { featureKey: input.featureKey, ...(input.metadata ?? {}) },
    });

    await tx.insert(creditUsageEvents).values({
      userId,
      featureKey: input.featureKey,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount.toFixed(2),
      transactionId: result.transactionId,
      metadata: input.metadata,
    });

    return {
      transactionId: result.transactionId,
      idempotencyKey: input.idempotencyKey,
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      alreadyProcessed: false,
    };
  });
}
```

If Drizzle relation `with: { transaction: true }` is not available, query the transaction by `transactionId` in a second select.

- [ ] **Step 6: Add route and OpenAPI**

In `apps/api/src/routes/me.ts`, add:

```ts
router.post("/credits/consume", async (c) => {
  const authUser = getAuthUser(c);
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseJsonBody(consumeCreditsRequestSchema, body);

  if (!parsedBody.success) {
    return validationError(c, "Invalid credit usage payload");
  }

  try {
    const result = await bootstrap.billingService.consumeCredits(authUser.id, parsedBody.data);
    return c.json({ success: true, data: result });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : "Failed to consume credits" }, 400);
  }
});
```

Add `POST /me/credits/consume` to `apps/api/src/openapi.ts` and `packages/contracts/src/ts/api/routes.ts`.

- [ ] **Step 7: Add route tests**

In `apps/api/tests/app.functional.test.ts`, add tests that assert:

```ts
expect(mocks.billingService.consumeCredits).toHaveBeenCalledWith("auth-user-id", {
  featureKey: "ai-summary",
  amount: 2,
  idempotencyKey: "usage-key-1",
});
```

Also add an invalid payload test expecting `400` and `Invalid credit usage payload`.

- [ ] **Step 8: Run checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run db:check
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/billing/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/app.functional.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/platform-db/src/schema/billing.ts packages/platform-db/src/schema/index.ts packages/platform-db/drizzle/0006_phase9_credit_usage_idempotency.sql packages/contracts/src/wire/billing/requests.ts packages/contracts/src/wire/billing/responses.ts packages/contracts/src/wire/index.ts packages/contracts/src/ts/api/routes.ts apps/api/src/modules/billing/service.ts apps/api/src/routes/me.ts apps/api/src/openapi.ts apps/api/tests/modules/billing/service.test.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: add idempotent credit usage api"
```

## Task 3: Add Admin Credit Adjustments With Audit And Optional Notification

**Files:**
- Modify: `packages/contracts/src/wire/admin/requests.ts`
- Modify: `packages/contracts/src/wire/admin/responses.ts`
- Modify: `packages/contracts/src/wire/index.ts`
- Modify: `packages/contracts/src/ts/api/routes.ts`
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/admin.ts`
- Create: `apps/admin/src/components/layout/backend/admin/users/adjust-credits-dialog.tsx`
- Test: `apps/api/tests/modules/billing/service.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`
- Test: `apps/admin/tests/lib/admin-api.test.ts`

- [ ] **Step 1: Add contracts**

In `packages/contracts/src/wire/admin/requests.ts`, add:

```ts
export const adminCreditAdjustmentSchema = z.object({
  amount: z.number().min(-100_000).max(100_000).refine((value) => value !== 0, "Amount cannot be zero"),
  reason: z.string().trim().min(5).max(500),
  notifyUser: z.boolean().default(false),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});
```

In `packages/contracts/src/wire/admin/responses.ts`, add:

```ts
export const adminCreditAdjustmentResponseSchema = z.object({
  transactionId: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
});
```

- [ ] **Step 2: Add failing service test**

In `apps/api/tests/modules/billing/service.test.ts`, add:

```ts
it("applies an admin credit adjustment with a reason", async () => {
  const service = createBillingService(createBillingDepsWithBalance("user-1", "5.00"));

  const result = await service.applyAdminCreditAdjustment("user-1", {
    amount: 3,
    reason: "Manual correction after support review",
    notifyUser: false,
  });

  expect(result).toMatchObject({ balanceBefore: "5.00", balanceAfter: "8.00" });
});
```

- [ ] **Step 3: Implement billing service method**

In `apps/api/src/modules/billing/service.ts`, add:

```ts
async function applyAdminCreditAdjustment(userId: string, input: AdminCreditAdjustmentRequest): Promise<AdminCreditAdjustmentResponse> {
  return deps.db.transaction(async (tx) => {
    const result = await applyCreditDelta(tx, {
      userId,
      amount: input.amount,
      type: "admin_adjustment",
      description: input.reason,
      referenceType: "admin",
      referenceId: input.idempotencyKey,
      metadata: { notifyUser: input.notifyUser },
      allowNegativeBalance: false,
    });

    if (input.notifyUser) {
      await deps.notifications.createNotification({
        userId,
        title: "creditAdjustment.title",
        message: "creditAdjustment.message",
        type: input.amount > 0 ? "success" : "warning",
        category: "billing",
        data: { amount: input.amount, reason: input.reason },
      }).catch(() => undefined);
    }

    return result;
  });
}
```

- [ ] **Step 4: Add admin route with audit**

In `apps/api/src/routes/admin.ts`, add `POST /admin/users/:userId/credits/adjust`. Parse `userId` with existing UUID param schema and parse body with `adminCreditAdjustmentSchema`.

After successful adjustment, call the existing audit helper with:

```ts
action: "admin.credits.adjust",
targetType: "user",
targetId: userId,
after: {
  amount: parsedBody.data.amount,
  reason: parsedBody.data.reason,
  notifyUser: parsedBody.data.notifyUser,
  transactionId: result.transactionId,
},
```

Do not log secrets or raw request headers.

- [ ] **Step 5: Add API wrapper test**

In `apps/admin/tests/lib/admin-api.test.ts`, add:

```ts
it("posts admin credit adjustments", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, data: { transactionId: "t1" } })));

  await adjustAdminUserCreditsApi("user-1", { amount: 5, reason: "Support correction", notifyUser: true });

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/users/user-1/credits/adjust"), expect.objectContaining({ method: "POST" }));
});
```

- [ ] **Step 6: Add minimal admin UI dialog**

Create `apps/admin/src/components/layout/backend/admin/users/adjust-credits-dialog.tsx` with fields for amount, reason, and notify user. Reuse existing dialog/form/button components. Validate client-side that reason has at least 5 characters and amount is not zero. Wire it from the admin user detail page where credit balance/history are already visible.

- [ ] **Step 7: Run checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/billing/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/app.functional.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin test tests/lib/admin-api.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/wire/admin packages/contracts/src/wire/index.ts packages/contracts/src/ts/api/routes.ts apps/api/src/modules/billing/service.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/admin/src/lib/api/admin.ts apps/admin/src/lib/services/admin.ts apps/admin/src/components/layout/backend/admin/users/adjust-credits-dialog.tsx apps/api/tests/modules/billing/service.test.ts apps/api/tests/app.functional.test.ts apps/admin/tests/lib/admin-api.test.ts
git commit -m "feat: add admin credit adjustments"
```

## Task 4: Add Admin Security Controls And Forced Password Reset Marker

**Files:**
- Modify: `packages/platform-db/src/schema/auth.ts`
- Create: `packages/platform-db/drizzle/0008_phase9_admin_security_controls.sql`
- Modify: `packages/contracts/src/wire/admin/requests.ts`
- Modify: `packages/contracts/src/wire/admin/responses.ts`
- Modify: `apps/api/src/modules/admin/service.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/users/page.tsx`
- Test: `apps/api/tests/modules/admin/service.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Add forced reset columns**

In `packages/platform-db/src/schema/auth.ts`, add these fields to the `user` table:

```ts
adminPasswordResetRequired: boolean("admin_password_reset_required").default(false).notNull(),
adminPasswordResetRequiredAt: timestamp("admin_password_reset_required_at", { withTimezone: true }),
```

- [ ] **Step 2: Add migration SQL**

Create `packages/platform-db/drizzle/0008_phase9_admin_security_controls.sql`:

```sql
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "admin_password_reset_required" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "admin_password_reset_required_at" timestamp with time zone;
```

- [ ] **Step 3: Generalize admin action secret contract**

Keep the existing ban secret behavior, but make the route/service naming generic enough for multiple destructive admin actions. In `packages/contracts/src/wire/admin/requests.ts`, add:

```ts
export const adminActionSecretSchema = z.object({
  secret: z.string().trim().min(1),
});
```

Keep `verifyBanSecretSchema` as an alias if existing callers use it:

```ts
export const verifyBanSecretSchema = adminActionSecretSchema;
```

- [ ] **Step 4: Add failing service tests**

In `apps/api/tests/modules/admin/service.test.ts`, add:

```ts
it("verifies the generic admin action secret", async () => {
  const service = createAdminService({ db: createAdminDbMock(), adminBanSecret: "secret" });

  await expect(service.verifyAdminActionSecret("secret")).resolves.toEqual({ success: true });
  await expect(service.verifyAdminActionSecret("wrong")).resolves.toEqual({ success: false, error: "Invalid secret key provided." });
});

it("marks a user for forced password reset after admin password change", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const service = createAdminService(createAdminDeps({
    onUserUpdate(values) {
      updates.push(values);
    },
  }));

  await service.markAdminPasswordResetRequired("user-1");

  expect(updates).toContainEqual(expect.objectContaining({
    adminPasswordResetRequired: true,
    adminPasswordResetRequiredAt: expect.any(Date),
  }));
});
```

Adapt helper names to the existing admin service test utilities.

- [ ] **Step 5: Implement admin service methods**

In `apps/api/src/modules/admin/service.ts`, add:

```ts
async function verifyAdminActionSecret(secret: string) {
  return verifyAdminBanSecret(secret);
}

async function markAdminPasswordResetRequired(userId: string) {
  await deps.db
    .update(user)
    .set({
      adminPasswordResetRequired: true,
      adminPasswordResetRequiredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));

  return { success: true };
}
```

Return both functions from `createAdminService`.

- [ ] **Step 6: Require admin action secret on destructive routes**

Apply the generic action secret to these routes while preserving existing response envelopes:

- `POST /admin/users/set-password`
- `POST /admin/users/revoke-sessions`
- `POST /admin/users/:userId/credits/adjust` from Task 3

For `set-password`, extend the existing body contract with:

```ts
secret: z.string().trim().min(1),
forceReset: z.boolean().default(true),
```

After the Better Auth password change succeeds, call `markAdminPasswordResetRequired(userId)` when `forceReset` is true. Continue to redact passwords and secrets from audit metadata.

- [ ] **Step 7: Update admin UI calls**

In `apps/admin/src/app/[locale]/(backend)/(admin)/admin/users/page.tsx`, update the set-password action to prompt for the admin action secret before calling `setAdminUserPassword`. Use the existing ban secret UI pattern if one exists; otherwise add a minimal confirmation dialog with a password input. Do not store the secret in state longer than needed.

- [ ] **Step 8: Add route tests**

In `apps/api/tests/app.functional.test.ts`, add tests that assert:

- Set password without `secret` returns `400`.
- Set password with wrong `secret` returns `403` and does not call Better Auth set-password.
- Set password with valid `secret` calls `markAdminPasswordResetRequired` when `forceReset` is true.
- Revoke sessions without valid `secret` is rejected.

- [ ] **Step 9: Run checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run db:check
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/admin/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/app.functional.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/platform-db/src/schema/auth.ts packages/platform-db/drizzle/0008_phase9_admin_security_controls.sql packages/contracts/src/wire/admin apps/api/src/modules/admin/service.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/users/page.tsx apps/api/tests/modules/admin/service.test.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: add admin security controls"
```

## Task 5: Add Email Templates And Delivery Logs

**Files:**
- Create: `packages/platform-db/src/schema/email.ts`
- Modify: `packages/platform-db/src/schema/index.ts`
- Create: `packages/platform-db/drizzle/0009_phase9_email_templates_logs.sql`
- Create: `packages/contracts/src/wire/email/requests.ts`
- Create: `packages/contracts/src/wire/email/responses.ts`
- Modify: `packages/contracts/src/wire/index.ts`
- Modify: `apps/api/src/modules/email/service.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Test: `apps/api/tests/modules/email/service.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Add email schema tables**

Create `packages/platform-db/src/schema/email.ts`:

```ts
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export const emailTemplates = pgTable("email_templates", {
  id,
  key: text("key").notNull().unique(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text: text("text"),
  updatedByUserId: uuid("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt,
  updatedAt,
});

export const emailDeliveryLogs = pgTable("email_delivery_logs", {
  id,
  templateKey: text("template_key").notNull(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  status: text("status").$type<"sent" | "failed">().notNull(),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  index("email_delivery_logs_status_created_at_idx").on(table.status, table.createdAt),
  index("email_delivery_logs_template_created_at_idx").on(table.templateKey, table.createdAt),
  index("email_delivery_logs_user_created_at_idx").on(table.userId, table.createdAt),
]);
```

- [ ] **Step 2: Add migration SQL**

Create `packages/platform-db/drizzle/0009_phase9_email_templates_logs.sql` with matching `CREATE TABLE IF NOT EXISTS` and index statements for both tables.

- [ ] **Step 3: Add contracts**

Create request and response schemas for listing templates, upserting a template, listing delivery logs, and returning log rows. Use string dates in wire responses.

`upsertEmailTemplateSchema` must require:

```ts
key: z.string().trim().min(1).max(100),
subject: z.string().trim().min(1).max(200),
html: z.string().trim().min(1).max(20_000),
text: z.string().trim().max(20_000).optional(),
```

- [ ] **Step 4: Implement email service**

Create `apps/api/src/modules/email/service.ts` with:

```ts
export function createEmailOperationsService(deps: { db: PlatformDb; email: { sendEmail(input: SendEmailInput): Promise<unknown> } }) {
  async function listTemplates() { /* select templates ordered by key */ }
  async function upsertTemplate(input: UpsertEmailTemplateInput & { updatedByUserId: string }) { /* insert on conflict update */ }
  async function listDeliveryLogs(limit = 50, offset = 0) { /* select logs ordered desc */ }
  async function sendTemplateEmail(input: SendTemplateEmailInput) { /* render variables, send, write sent/failed log */ }

  return { listTemplates, upsertTemplate, listDeliveryLogs, sendTemplateEmail };
}
```

Use simple `{{variableName}}` replacement for template variables. Escape is not required for system-authored templates, but do not allow arbitrary script execution or `eval`.

- [ ] **Step 5: Add service tests**

Create `apps/api/tests/modules/email/service.test.ts` covering:

```ts
it("upserts templates by key", async () => { /* expect insert on conflict */ });
it("logs sent email deliveries", async () => { /* provider resolves */ });
it("logs failed email deliveries without throwing raw provider payloads", async () => { /* provider rejects */ });
```

- [ ] **Step 6: Add admin routes and OpenAPI**

Add routes:

- `GET /admin/email/templates`
- `PUT /admin/email/templates/:key`
- `GET /admin/email/delivery-logs`

All require admin auth. Upsert should audit `admin.email_template.upsert` with template key but not full HTML body.

- [ ] **Step 7: Run checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run db:check
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/email/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/app.functional.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/platform-db/src/schema/email.ts packages/platform-db/src/schema/index.ts packages/platform-db/drizzle/0009_phase9_email_templates_logs.sql packages/contracts/src/wire/email packages/contracts/src/wire/index.ts apps/api/src/modules/email/service.ts apps/api/src/bootstrap.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/api/tests/modules/email/service.test.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: add email templates and delivery logs"
```

## Task 6: Add Webhook Retry And Dead-Letter Operations

**Files:**
- Modify: `packages/platform-db/src/schema/billing.ts`
- Create: `packages/platform-db/drizzle/0010_phase9_webhook_retries_dead_letter.sql`
- Modify: `apps/api/src/modules/payments/webhook-event-store.ts`
- Modify: `packages/payments-core/src/types.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `packages/contracts/src/wire/admin/responses.ts`
- Test: `apps/api/tests/modules/payments/webhook-event-store.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Extend webhook event schema**

In `paymentWebhookEvents`, add:

```ts
attemptCount: integer("attempt_count").default(0).notNull(),
lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
```

Add indexes:

```ts
index("payment_webhook_events_status_next_retry_idx").on(table.processingStatus, table.nextRetryAt),
index("payment_webhook_events_dead_lettered_at_idx").on(table.deadLetteredAt),
```

- [ ] **Step 2: Add migration SQL**

Create `packages/platform-db/drizzle/0010_phase9_webhook_retries_dead_letter.sql`:

```sql
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "dead_lettered_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "payment_webhook_events_status_next_retry_idx" ON "payment_webhook_events" ("processing_status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_dead_lettered_at_idx" ON "payment_webhook_events" ("dead_lettered_at");
```

- [ ] **Step 3: Update event store behavior**

In `apps/api/src/modules/payments/webhook-event-store.ts`:

- Increment `attemptCount` and set `lastAttemptAt` when claiming an event.
- When marking failed, set `nextRetryAt` using a bounded backoff:

```ts
function nextRetryAt(attemptCount: number, now = new Date()) {
  const minutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
  return new Date(now.getTime() + minutes * 60_000);
}
```

- Set `deadLetteredAt` when `attemptCount >= 5`.

- [ ] **Step 4: Add admin list/retry routes**

Add:

- `GET /admin/payments/webhooks?status=failed|processed|processing&limit=20&offset=0`
- `POST /admin/payments/webhooks/:eventId/retry`
- `POST /admin/payments/webhooks/:eventId/dead-letter`

Manual retry should only reset status to `failed` with `nextRetryAt` set to now if the original event can be retried by replaying the provider webhook externally. Do not pretend to reprocess raw payloads unless the raw payload is durably stored.

- [ ] **Step 5: Add tests**

Add tests asserting failed events get `attemptCount`, `nextRetryAt`, and `deadLetteredAt` after max attempts. Add route tests for list, retry scheduling, and dead-letter marking.

- [ ] **Step 6: Run checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run db:check
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/payments/webhook-event-store.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/app.functional.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/platform-db/src/schema/billing.ts packages/platform-db/drizzle/0010_phase9_webhook_retries_dead_letter.sql apps/api/src/modules/payments/webhook-event-store.ts packages/payments-core/src/types.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts packages/contracts/src/wire/admin/responses.ts apps/api/tests/modules/payments/webhook-event-store.test.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: add webhook retry operations"
```

## Task 7: Add Account Export, Deletion Request, And Retention Policy

**Files:**
- Create: `packages/platform-db/src/schema/account-lifecycle.ts`
- Modify: `packages/platform-db/src/schema/index.ts`
- Create: `packages/platform-db/drizzle/0011_phase9_account_lifecycle.sql`
- Create: `packages/contracts/src/wire/account/requests.ts`
- Create: `packages/contracts/src/wire/account/responses.ts`
- Modify: `packages/contracts/src/wire/index.ts`
- Create: `apps/api/src/modules/account-lifecycle/service.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/routes/admin.ts` if admin retention visibility is included
- Modify: `apps/api/src/openapi.ts`
- Test: `apps/api/tests/modules/account-lifecycle/service.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Add lifecycle tables**

Create `packages/platform-db/src/schema/account-lifecycle.ts`:

```ts
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export const dataExportRequests = pgTable("data_export_requests", {
  id,
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
  status: text("status").$type<"pending" | "completed" | "failed">().default("pending").notNull(),
  exportData: jsonb("export_data"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt,
  updatedAt,
}, (table) => [index("data_export_requests_user_status_idx").on(table.userId, table.status)]);

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id,
  userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
  status: text("status").$type<"pending" | "cancelled" | "completed">().default("pending").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  scheduledDeleteAt: timestamp("scheduled_delete_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [index("account_deletion_requests_user_status_idx").on(table.userId, table.status), index("account_deletion_requests_scheduled_idx").on(table.scheduledDeleteAt)]);
```

- [ ] **Step 2: Add migration SQL**

Create `packages/platform-db/drizzle/0011_phase9_account_lifecycle.sql` with matching tables and indexes.

- [ ] **Step 3: Add contracts**

Add account request/response schemas for:

- `POST /me/data-export`
- `GET /me/data-export/:requestId`
- `POST /me/account-deletion`
- `POST /me/account-deletion/cancel`

Use string datetime fields in responses. Do not include raw secrets, password hashes, sessions, or tokens in export data.

- [ ] **Step 4: Implement lifecycle service**

Create `apps/api/src/modules/account-lifecycle/service.ts` with:

```ts
export function createAccountLifecycleService(deps: { db: PlatformDb }) {
  async function requestDataExport(userId: string) { /* create request, collect current user-safe data, mark completed */ }
  async function getDataExport(userId: string, requestId: string) { /* enforce ownership */ }
  async function requestAccountDeletion(userId: string) { /* schedule 7 days from now */ }
  async function cancelAccountDeletion(userId: string) { /* cancel pending request */ }

  return { requestDataExport, getDataExport, requestAccountDeletion, cancelAccountDeletion };
}
```

Export data must include profile fields, credit balance, credit transactions, credit purchases, notifications, and vouchers/redemptions where available. It must not include session tokens, password hashes, provider access tokens, raw webhook payloads, or audit secrets.

- [ ] **Step 5: Add route tests**

In `apps/api/tests/app.functional.test.ts`, add tests for successful request creation, ownership enforcement on `GET /me/data-export/:requestId`, deletion scheduling, and cancellation.

- [ ] **Step 6: Run checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run db:check
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/account-lifecycle/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/app.functional.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/platform-db/src/schema/account-lifecycle.ts packages/platform-db/src/schema/index.ts packages/platform-db/drizzle/0011_phase9_account_lifecycle.sql packages/contracts/src/wire/account packages/contracts/src/wire/index.ts apps/api/src/modules/account-lifecycle/service.ts apps/api/src/routes/me.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/api/tests/modules/account-lifecycle/service.test.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: add account lifecycle operations"
```

## Task 8: Add Admin And User Operation Surfaces

**Files:**
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/admin.ts`
- Modify: `apps/admin/src/config/backend-navbar-admin.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/email/page.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/webhooks/page.tsx`
- Create: `apps/admin/src/components/layout/backend/admin/email/email-templates-table.tsx`
- Create: `apps/admin/src/components/layout/backend/admin/email/email-delivery-logs-table.tsx`
- Create: `apps/admin/src/components/layout/backend/admin/webhooks/webhook-events-table.tsx`
- Modify: `apps/web/src/lib/api/me.ts`
- Modify: `apps/web/src/app/[locale]/(backend)/settings/page.tsx` or existing account settings component
- Modify: `apps/web/src/messages/en.json`, `apps/web/src/messages/nl.json`, `apps/web/src/messages/fr.json`
- Modify: `apps/admin/src/messages/en.json`, `apps/admin/src/messages/nl.json`, `apps/admin/src/messages/fr.json`

- [ ] **Step 1: Add frontend API wrapper tests**

Add focused tests in `apps/admin/tests/lib/admin-api.test.ts` and `apps/web/tests/lib/me-api.test.ts` that verify URLs and methods for:

- Admin email templates list/upsert.
- Admin webhook event list/retry/dead-letter.
- Web account export request/get.
- Web account deletion request/cancel.

- [ ] **Step 2: Implement API/service wrappers**

Add wrappers matching the route constants from contracts. Keep functions thin and return API data without UI-specific transformation.

- [ ] **Step 3: Add minimal admin pages**

Add server or client pages for email templates/logs and webhook events. Each page must:

- Use existing admin layout components.
- Render list tables with pagination.
- Provide retry/dead-letter buttons only for webhook rows where the API permits the action.
- Avoid showing raw webhook payloads or provider secrets.

- [ ] **Step 4: Add minimal user lifecycle controls**

Add settings UI controls for data export and account deletion request/cancel. Deletion request UI must clearly state the scheduled deletion date returned by the API.

- [ ] **Step 5: Add locale messages**

Add all introduced keys to `en`, `nl`, and `fr` message files. Run the same key parity script pattern used in Phase 7.

- [ ] **Step 6: Run frontend checks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin test tests/lib/admin-api.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web test tests/lib/me-api.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src apps/admin/tests apps/web/src apps/web/tests
git commit -m "feat: add operation management surfaces"
```

## Task 9: Final Phase 9 Verification

**Files:**
- Inspect all Phase 9 changed files.

- [ ] **Step 1: Run DB check**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run db:check`

Expected: PASS.

- [ ] **Step 2: Run API tests**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test`

Expected: PASS.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web test
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin test
```

Expected: PASS.

- [ ] **Step 4: Run full typecheck**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all`

Expected: PASS.

- [ ] **Step 5: Inspect scope**

Run: `git diff --stat main...HEAD`

Expected: changes are limited to single-tenant credits operations, admin operational tooling, email logs/templates, webhook retry/dead-letter operations, account lifecycle, contracts, migrations, and tests. No organization, team, tenant, seat, subscription plan, recurring billing, trial, upgrade, downgrade, cancellation, or renewal webhook support.

- [ ] **Step 6: Commit final fixes if needed**

If the sweep required fixes:

```bash
git add <fixed-files>
git commit -m "chore: finalize phase 9 verification"
```

If no files changed, do not create an empty commit.
