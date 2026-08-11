# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current single-tenant SaaS monorepo into a clean, modular, secure production baseline before designing multi-tenancy.

**Architecture:** Keep the current Hono API as the single trusted backend and preserve the single-tenant data model for now. Fix security and financial correctness issues first, then operational hardening, then package-boundary and duplication cleanup. Do not add tenant columns, tenant middleware, or tenant abstractions in this plan.

**Tech Stack:** Bun monorepo, Hono, Drizzle/Postgres, Better Auth, Next.js App Router, Zod, Dodo Payments, Resend.

---

## Scope

This plan hardens the existing single-tenant application. Multi-tenancy is intentionally out of scope and should be designed separately after this baseline is stable.

The implementation order is deliberate:

1. Establish verification baseline.
2. Fix billing and credit integrity.
3. Fix migrations and identity constraints.
4. Tighten admin security.
5. Harden API ingress and docs exposure.
6. Fix webhook and subscription robustness.
7. Harden privacy exports.
8. Harden logging and observability.
9. Harden env/runtime readiness.
10. Remove frontend/package drift.
11. Run final verification and review.

---

## File Structure

### API Security And Runtime

- Modify: `apps/api/src/app.ts`
  - Central Hono middleware and route registration.
- Modify: `apps/api/src/env.ts`
  - Runtime env validation and production safety checks.
- Modify: `apps/api/src/server.ts`
  - Hono server startup and graceful shutdown.
- Modify: `apps/api/src/routes/system.ts`
  - Health/readiness endpoints.
- Modify: `apps/api/src/routes/docs.ts`
  - OpenAPI/docs exposure and safe HTML interpolation.
- Modify: `apps/api/src/routes/admin.ts`
  - Admin step-up flow and TOTP result parsing.
- Modify: `apps/api/src/routes/me.ts`
  - Customer portal logging and credit billing guard.
- Modify: `apps/api/src/middleware/admin-step-up.ts`
  - Admin step-up cookie TTL and verification.
- Modify: `apps/api/src/middleware/request-guardrails.ts`
  - Rate limits, body limits, content-type checks, proxy trust.

### Billing And Payments

- Modify: `apps/api/src/modules/billing/service.ts`
  - Credit ledger mutations, credit purchase grants, admin adjustments, usage debits.
- Modify: `apps/api/src/modules/vouchers/service.ts`
  - Voucher redemption and credit granting.
- Modify: `apps/api/src/modules/billing/subscription-service.ts`
  - Subscription payment upsert ownership and event payload storage.
- Modify: `apps/api/src/modules/billing/payment-event-handler.ts`
  - Subscription payment amount/product validation.
- Modify: `apps/api/src/modules/payments/webhook-event-store.ts`
  - Webhook failure redaction.
- Modify: `packages/payments-core/src/providers/dodo/mapper.ts`
  - Dodo payload compatibility and optional customer email.
- Modify: `packages/payments-core/src/providers/dodo/webhook-verify.ts`
  - Canonical timestamp parsing.

### Database

- Modify: `packages/platform-db/src/schema/auth.ts`
  - OAuth account and passkey uniqueness constraints.
- Modify: `packages/platform-db/drizzle/0011_webhook_observability.sql`
  - Duplicate-column migration fix.
- Add: `packages/platform-db/drizzle/0012_auth_identity_uniqueness.sql`
  - DB-level uniqueness constraints for auth identities.

### Privacy

- Modify: `apps/api/src/modules/privacy/service.ts`
  - Export contents, cleanup, stale export expiry, audit records if needed.

### Observability

- Modify: `apps/api/src/observability/logger.ts`
  - File sink semantics, non-blocking writes, log level filtering.
- Modify: `apps/api/src/observability/redaction.ts`
  - Sensitive field and IP redaction coverage.
- Modify: `apps/api/logrotate/api-main.conf`
  - JSONL rotation.
- Modify: `.gitignore`
  - Runtime log ignores.
- Modify: `apps/api/.env.example`
  - Logging and production secret guidance.

### Frontends And Shared Packages

- Modify: `apps/admin/src/proxy.ts`
  - Admin proxy API origin hardening.
- Modify: `apps/web/src/env.ts`
  - Public URL validation.
- Modify: `apps/admin/src/env.ts`
  - Public URL validation and server API URL if needed.
- Modify: `apps/web/src/config/billing.ts`
  - Shared billing config export.
- Modify: `apps/admin/src/config/billing.ts`
  - Shared billing config export.
- Modify: `apps/web/src/schemas/credits.ts`
  - Contract/shared-backed credit types.
- Modify: `apps/admin/src/schemas/credits.ts`
  - Contract/shared-backed credit types.
- Modify: `packages/frontend-shared/package.json`
  - Declare `@platform/contracts` dependency.

---

## Phase 0: Verification Baseline

**Goal:** Establish the current test/typecheck state before security-sensitive edits.

**Files:**
- Inspect: `package.json`
- Inspect: `apps/api/package.json`
- Inspect: `apps/web/package.json`
- Inspect: `apps/admin/package.json`
- Inspect: `packages/*/package.json`

- [ ] **Step 1: Inspect available scripts**

Run:

```bash
bun run
```

Expected: script list prints successfully. Record available root-level `test`, `typecheck`, `lint`, `build`, and migration scripts in the implementation notes.

- [ ] **Step 2: Run root tests**

Run:

```bash
bun test
```

Expected: tests pass, or pre-existing failures are recorded before any edits.

- [ ] **Step 3: Run root typecheck if available**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes, or pre-existing failures are recorded before any edits.

- [ ] **Step 4: Commit baseline notes only if the repo convention tracks them**

Do not commit unless explicitly requested. If notes are needed, include them in the final implementation summary instead of creating a file.

---

## Phase 1: Billing And Credit Integrity

**Goal:** Make all credit balance mutations atomic and prevent payment ownership corruption.

**Files:**
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/modules/vouchers/service.ts`
- Modify: `apps/api/src/modules/billing/subscription-service.ts`
- Test: existing billing/voucher tests, or add focused tests under the repo's existing test layout.

### Task 1.1: Make Generic Credit Delta Atomic

**Files:**
- Modify: `apps/api/src/modules/billing/service.ts:1`
- Modify: `apps/api/src/modules/billing/service.ts:110-147`

- [ ] **Step 1: Update imports**

Change the import at the top of `apps/api/src/modules/billing/service.ts` from:

```ts
import { and, desc, eq, isNotNull } from "drizzle-orm";
```

to:

```ts
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
```

- [ ] **Step 2: Replace `applyCreditDelta` with atomic update**

Replace `applyCreditDelta` with:

```ts
async function applyCreditDelta(db: any, input: ApplyCreditDeltaInput): Promise<ApplyCreditDeltaResult> {
  const current = await getOrInitializeCredits(db, input.userId);
  const balanceBefore = Number(current.balance);
  const now = input.createdAt ?? new Date();

  const [updated] = await db
    .update(userCredits)
    .set({
      balance: sql`${userCredits.balance} + ${input.amount}`,
      totalSpent: input.type === "usage"
        ? sql`${userCredits.totalSpent} + ${Math.abs(input.amount)}`
        : userCredits.totalSpent,
      updatedAt: now,
    })
    .where(
      and(
        eq(userCredits.userId, input.userId),
        input.allowNegativeBalance
          ? sql`true`
          : sql`${userCredits.balance} + ${input.amount} >= 0`,
      ),
    )
    .returning({
      balanceAfter: userCredits.balance,
    });

  if (!updated) {
    throw new Error("Insufficient credits");
  }

  const balanceAfter = Number(updated.balanceAfter);

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

- [ ] **Step 3: Run billing tests or typecheck**

Run:

```bash
bun test apps/api
```

Expected: API tests pass, or failures are unrelated and recorded.

### Task 1.2: Make Credit Purchase Grants Atomic And Move Notifications Outside Transaction

**Files:**
- Modify: `apps/api/src/modules/billing/service.ts:232-359`

- [ ] **Step 1: Refactor `grantCredits` to return notification data instead of sending inside transaction**

Inside `processCreditPurchase`, change `grantCredits` so it atomically increments balances and returns notification payload:

```ts
async function grantCredits(grantedAt: Date) {
  const baseCredits = creditPackage.credits;
  const bonusCredits = "bonus" in creditPackage ? creditPackage.bonus : 0;
  const totalCredits = baseCredits + bonusCredits;
  const current = await getOrInitializeCredits(tx, userId);

  const [updated] = await tx
    .update(userCredits)
    .set({
      balance: sql`${userCredits.balance} + ${totalCredits}`,
      totalPurchased: sql`${userCredits.totalPurchased} + ${baseCredits}`,
      updatedAt: grantedAt,
    })
    .where(eq(userCredits.userId, userId))
    .returning({ balanceAfter: userCredits.balance });

  const balanceBefore = Number(current.balance);
  const balanceAfter = Number(updated.balanceAfter);

  await tx.insert(creditTransactions).values({
    userId,
    type: "purchase",
    amount: baseCredits.toString(),
    description: `Package: ${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)}`,
    referenceId: paymentId,
    balanceAfter: (balanceBefore + baseCredits).toString(),
  });

  if (bonusCredits > 0) {
    await tx.insert(creditTransactions).values({
      userId,
      type: "bonus",
      amount: bonusCredits.toString(),
      description: `Bonus credits for ${packageKey.charAt(0).toUpperCase() + packageKey.slice(1)}`,
      referenceId: paymentId,
      balanceAfter: balanceAfter.toString(),
      createdAt: new Date(grantedAt.getTime() + 1),
    });
  }

  return {
    credits: totalCredits,
    amount: priceInclVat / 100,
    currency,
  };
}
```

- [ ] **Step 2: Send notifications after transaction returns**

Wrap the transaction result in a local value:

```ts
const result = await deps.db.transaction(async (tx: any) => {
  let notificationData: { credits: number; amount: number; currency: string } | null = null;

  // existing logic, replacing `await grantCredits(...)` with:
  notificationData = await grantCredits(creditsGrantedAt);

  return { purchase, notificationData };
});

if (result.notificationData) {
  await deps.notifications.createNotification({
    userId,
    title: "creditPurchaseSuccess.title",
    message: "creditPurchaseSuccess.message",
    type: "success",
    category: "billing",
    data: result.notificationData,
  }).catch(() => undefined);
}

return result.purchase;
```

Adjust variable names to match the existing branch return values. The important rule is: no `deps.notifications.createNotification` call inside `deps.db.transaction`.

- [ ] **Step 3: Search for transaction-local notification side effects**

Run:

```bash
rg "createNotification" apps/api/src/modules/billing apps/api/src/modules/vouchers
```

Expected: no notification call remains inside a DB transaction callback.

### Task 1.3: Fix Voucher Credit Concurrency

**Files:**
- Modify: `apps/api/src/modules/vouchers/service.ts:129-148`
- Modify: `apps/api/src/modules/vouchers/service.ts:213-240`

- [ ] **Step 1: Make voucher credit initialization conflict-safe**

Replace `getOrInitializeCredits` with:

```ts
async function getOrInitializeCredits(
  userId: string,
  tx: VouchersServiceDeps["db"] | DbTransaction,
) {
  const existing = await tx.query.userCredits.findFirst({ where: eq(userCredits.userId, userId) });

  if (existing) {
    return existing;
  }

  const [created] = await tx
    .insert(userCredits)
    .values({
      userId,
      balance: "0",
      totalPurchased: "0",
      totalSpent: "0",
    })
    .onConflictDoNothing({ target: userCredits.userId })
    .returning();

  if (created) {
    return created;
  }

  return tx.query.userCredits.findFirst({ where: eq(userCredits.userId, userId) });
}
```

- [ ] **Step 2: Make voucher credit grant atomic**

Replace `addVoucherCredits` with:

```ts
async function addVoucherCredits(tx: DbTransaction, userId: string, voucher: VoucherRecord) {
  const credits = await getOrInitializeCredits(userId, tx);
  const currentBalance = parseFloat(credits.balance);
  const newBalance = currentBalance + voucher.creditAmount;

  if (newBalance > billingConfig.maxCredits) {
    throw new Error(`Cannot exceed maximum credits limit of ${billingConfig.maxCredits}`);
  }

  const [updated] = await tx
    .update(userCredits)
    .set({
      balance: sql`${userCredits.balance} + ${voucher.creditAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(userCredits.userId, userId))
    .returning({ balanceAfter: userCredits.balance });

  const balanceAfter = Number(updated.balanceAfter);

  await tx.insert(creditTransactions).values({
    userId,
    type: "voucher",
    amount: voucher.creditAmount.toString(),
    description: `Voucher redeemed: ${voucher.code}`,
    referenceType: "voucher",
    referenceId: voucher.id,
    balanceAfter: balanceAfter.toString(),
    metadata: { code: voucher.code },
  });

  return balanceAfter;
}
```

- [ ] **Step 3: Run voucher-related tests**

Run:

```bash
bun test apps/api
```

Expected: voucher and billing tests pass.

### Task 1.4: Prevent Subscription Payment Reassignment

**Files:**
- Modify: `apps/api/src/modules/billing/subscription-service.ts:133-181`

- [ ] **Step 1: Wrap `recordSubscriptionPayment` in a transaction with ownership check**

Replace `recordSubscriptionPayment` body with:

```ts
async function recordSubscriptionPayment(input: RecordSubscriptionPaymentInput) {
  const now = new Date();
  const paymentSnapshot = {
    provider: "dodo" as const,
    planKey: input.planKey,
    customerId: input.dodoCustomerId ?? undefined,
    subscriptionId: input.dodoSubscriptionId ?? undefined,
    priceExclVat: input.pricing.priceExclVat,
    priceInclVat: input.pricing.priceInclVat,
    vatAmount: input.pricing.vatAmount,
    currency: input.pricing.currency,
  };

  return deps.db.transaction(async (tx: any) => {
    const existing = await tx.query.subscriptionPayments.findFirst({
      where: eq(subscriptionPayments.paymentId, input.paymentId),
    });

    if (existing && existing.userId !== input.userId) {
      throw new Error(`Payment ${input.paymentId} is already associated with another user`);
    }

    const [payment] = await tx
      .insert(subscriptionPayments)
      .values({
        userId: input.userId,
        planKey: input.planKey,
        dodoCustomerId: input.dodoCustomerId ?? null,
        dodoSubscriptionId: input.dodoSubscriptionId ?? null,
        paymentId: input.paymentId,
        paymentStatus: input.paymentStatus,
        priceExclVat: input.pricing.priceExclVat,
        priceInclVat: input.pricing.priceInclVat,
        vatAmount: input.pricing.vatAmount,
        currency: input.pricing.currency,
        paymentSnapshot,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [subscriptionPayments.paymentProvider, subscriptionPayments.paymentId],
        set: {
          paymentStatus: input.paymentStatus,
          dodoCustomerId: input.dodoCustomerId ?? existing?.dodoCustomerId ?? null,
          dodoSubscriptionId: input.dodoSubscriptionId ?? existing?.dodoSubscriptionId ?? null,
          priceExclVat: input.pricing.priceExclVat,
          priceInclVat: input.pricing.priceInclVat,
          vatAmount: input.pricing.vatAmount,
          currency: input.pricing.currency,
          paymentSnapshot,
          updatedAt: now,
        },
      })
      .returning();

    return payment;
  });
}
```

- [ ] **Step 2: Run subscription tests or API tests**

Run:

```bash
bun test apps/api
```

Expected: tests pass, and duplicate payment IDs cannot move between users.

---

## Phase 2: Migration And Schema Safety

**Goal:** Ensure fresh database setup succeeds and identity data has DB-level uniqueness.

**Files:**
- Modify: `packages/platform-db/drizzle/0011_webhook_observability.sql`
- Modify: `packages/platform-db/src/schema/auth.ts`
- Create: `packages/platform-db/drizzle/0012_auth_identity_uniqueness.sql`

### Task 2.1: Fix Duplicate-Column Migration

- [ ] **Step 1: Replace migration contents**

Replace `packages/platform-db/drizzle/0011_webhook_observability.sql` with:

```sql
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "sanitized_payload" jsonb;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "request_id" text;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "correlation_id" text;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "duration_ms" integer;
```

### Task 2.2: Add Auth Identity Unique Indexes

- [ ] **Step 1: Update Drizzle auth schema imports**

In `packages/platform-db/src/schema/auth.ts`, add `uniqueIndex` to the `drizzle-orm/pg-core` import:

```ts
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Add account unique index**

Change the `account` table index callback to:

```ts
(table) => [
  index("account_userId_idx").on(table.userId),
  uniqueIndex("account_provider_account_unique_idx").on(table.providerId, table.accountId),
],
```

- [ ] **Step 3: Add passkey unique index**

Change the `passkey` table index callback to:

```ts
(table) => [
  index("passkey_userId_idx").on(table.userId),
  uniqueIndex("passkey_credential_id_unique_idx").on(table.credentialID),
],
```

- [ ] **Step 4: Create migration SQL**

Create `packages/platform-db/drizzle/0012_auth_identity_uniqueness.sql` with:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_account_unique_idx"
  ON "account" ("provider_id", "account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credential_id_unique_idx"
  ON "passkey" ("credential_id");
```

- [ ] **Step 5: Run platform DB checks**

Run:

```bash
bun test packages/platform-db
```

Expected: platform DB tests pass, or missing package tests are recorded.

---

## Phase 3: Admin Security

**Goal:** Ensure admin step-up is short-lived, correctly validated, rate-limited, and cleared consistently.

**Files:**
- Modify: `apps/api/src/middleware/admin-step-up.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/middleware/request-guardrails.ts`

### Task 3.1: Shorten Admin Step-Up TTL

- [ ] **Step 1: Update TTL**

In `apps/api/src/middleware/admin-step-up.ts`, replace:

```ts
const ADMIN_STEP_UP_TTL_SECONDS = 60 * 60 * 12;
```

with:

```ts
const ADMIN_STEP_UP_TTL_SECONDS = 60 * 15;
```

### Task 3.2: Fix TOTP Error Parsing

- [ ] **Step 1: Replace `resultError`**

In `apps/api/src/routes/admin.ts`, replace `resultError` with:

```ts
function resultError(result: unknown, fallback: string) {
  const error = resultField(result, "error");
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return fallback;
}
```

### Task 3.3: Add Admin Rate Limits

- [ ] **Step 1: Extend `routeGuardrails`**

In `apps/api/src/middleware/request-guardrails.ts`, add these entries to `routeGuardrails`:

```ts
{ method: "POST", pattern: /^\/admin\/step-up\/complete$/, maxBodyBytes: 2 * KIB, rateLimit: { windowMs: 60_000, max: 5 } },
{ method: "POST", pattern: /^\/admin\/users\/ban$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 5 } },
{ method: "POST", pattern: /^\/admin\/users\/set-password$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
{ method: "POST", pattern: /^\/admin\/users\/impersonate$/, maxBodyBytes: 4 * KIB, rateLimit: { windowMs: 60_000, max: 10 } },
```

### Task 3.4: Clear Admin Cookies With Configured Attributes

- [ ] **Step 1: Import env and step-up clearer**

In `apps/api/src/app.ts`, change imports to include:

```ts
import { clearAdminStepUpCookieHeader, isAdminStepUpVerified } from "./middleware/admin-step-up";
import { env } from "./env";
```

- [ ] **Step 2: Add helper**

Add this helper above middleware registration:

```ts
function clearSessionCookieHeader() {
  const parts = [
    "better-auth.session_token=",
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${env.COOKIE_SAMESITE}`,
  ];

  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  if (env.NODE_ENV === "production") parts.push("Secure");

  return parts.join("; ");
}
```

- [ ] **Step 3: Replace hard-coded clear cookie**

Replace:

```ts
c.res.headers.set("Set-Cookie", "better-auth.session_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
```

with:

```ts
c.res.headers.append("Set-Cookie", clearSessionCookieHeader());
c.res.headers.append("Set-Cookie", clearAdminStepUpCookieHeader());
```

- [ ] **Step 4: Run API checks**

Run:

```bash
bun test apps/api
bun run typecheck
```

Expected: tests and typecheck pass.

---

## Phase 4: API Guardrails And Docs Exposure

**Goal:** Harden request ingress and avoid exposing internal API docs in production.

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/middleware/request-guardrails.ts`
- Modify: `apps/api/src/routes/docs.ts`

### Task 4.1: Add Proxy Trust Env

- [ ] **Step 1: Add env field**

In `apps/api/src/env.ts`, add:

```ts
TRUST_PROXY: z.coerce.boolean().default(false),
```

### Task 4.2: Stop Trusting Forwarded IPs By Default

- [ ] **Step 1: Import env**

In `apps/api/src/middleware/request-guardrails.ts`, add:

```ts
import { env } from "../env";
```

- [ ] **Step 2: Replace `getClientIp`**

```ts
function getClientIp(c: Parameters<MiddlewareHandler<AppEnv>>[0]) {
  if (env.TRUST_PROXY) {
    const forwardedFor = c.req.header("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
    return c.req.header("x-real-ip") ?? "unknown";
  }

  return "unknown";
}
```

### Task 4.3: Enforce JSON Content Type For Unsafe Routes

- [ ] **Step 1: Add method set**

Near constants in `request-guardrails.ts`, add:

```ts
const JSON_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
```

- [ ] **Step 2: Add content-type check**

At the start of `requestGuardrails`, after `contentType` is read, add:

```ts
if (JSON_BODY_METHODS.has(method)) {
  const isWebhook = c.req.path === "/payments/webhooks/dodo";
  const hasJsonBody = contentType.includes("application/json");

  if (!isWebhook && !hasJsonBody) {
    return c.json({ success: false, error: "Unsupported content type" }, 415);
  }
}
```

### Task 4.4: Make Docs Safe And Admin-Gated In Production

- [ ] **Step 1: Import env**

In `apps/api/src/routes/docs.ts`, add:

```ts
import { env } from "../env";
```

- [ ] **Step 2: Use fixed relative spec URLs**

Replace the docs route handlers with:

```ts
router.get("/api/docs", (c) => c.html(buildSwaggerHtml("/api/openapi.json")));
router.get("/docs", (c) => c.html(buildScalarHtml("/openapi.json")));
```

- [ ] **Step 3: JSON-stringify Swagger URL**

Change `buildSwaggerHtml` to use:

```ts
url: ${JSON.stringify(specUrl)},
```

instead of:

```ts
url: "${specUrl}",
```

- [ ] **Step 4: Gate docs routes in production**

Add this before docs route declarations:

```ts
if (env.NODE_ENV === "production") {
  router.use("/openapi.json", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
  router.use("/api/openapi.json", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
  router.use("/docs", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
  router.use("/api/docs", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
}
```

- [ ] **Step 5: Run API checks**

Run:

```bash
bun test apps/api
```

Expected: API tests pass.

---

## Phase 5: Webhook And Subscription Robustness

**Goal:** Ensure Dodo webhook compatibility and safe payload persistence.

**Files:**
- Modify: `packages/payments-core/src/providers/dodo/mapper.ts`
- Modify: `packages/payments-core/src/providers/dodo/webhook-verify.ts`
- Modify: `apps/api/src/modules/billing/payment-event-handler.ts`
- Modify: `apps/api/src/modules/billing/subscription-service.ts`
- Modify: `apps/api/src/modules/payments/webhook-event-store.ts`

### Task 5.1: Accept `event_type` In Dodo Mapper

- [ ] **Step 1: Relax base schema**

Replace `baseSchema` with:

```ts
const baseSchema = z.object({
  id: z.string().min(1).optional(),
  event_id: z.string().min(1).optional(),
  type: z.string().optional(),
  event_type: z.string().optional(),
  data: z.unknown().optional(),
});
```

- [ ] **Step 2: Add event type variable**

After parsing, add:

```ts
const eventType = parsed.data.type ?? parsed.data.event_type;
if (!eventType) return null;
```

Then replace `parsed.data.type` checks with `eventType` where appropriate.

### Task 5.2: Make Succeeded Customer Email Optional

- [ ] **Step 1: Relax schema**

In `paymentSucceededSchema`, change:

```ts
email: z.string().email(),
```

to:

```ts
email: z.string().email().optional(),
```

### Task 5.3: Validate Webhook Timestamp Canonically

- [ ] **Step 1: Add digit check**

In `verifyDodoWebhookSignatureDetailed`, before `Number.parseInt`, add:

```ts
if (!/^\d+$/.test(parsed.timestamp)) {
  return { ok: false, reason: "malformed_header" };
}
```

### Task 5.4: Validate Subscription Payment Amounts Against Plans

- [ ] **Step 1: Import subscription plans**

In `apps/api/src/modules/billing/payment-event-handler.ts`, import `subscriptionPlans` from config.

- [ ] **Step 2: Add validation before recording subscription payment**

After checkout intent validation and before `recordSubscriptionPayment`, add:

```ts
const matchedPlan = subscriptionPlans.find((item) => item.key === planKey);
if (!matchedPlan || matchedPlan.productId !== event.productId) {
  throw new Error(`Refusing payment ${event.paymentId}: unknown subscription plan.`);
}

const discountCode = getMetadataString(event.metadata, "discountCode");
if (!discountCode && event.totalAmount !== matchedPlan.price) {
  throw new Error(`Refusing payment ${event.paymentId}: expected amount ${matchedPlan.price}, received ${event.totalAmount}.`);
}
```

### Task 5.5: Redact Subscription Event Payloads

- [ ] **Step 1: Import redaction helper**

In `apps/api/src/modules/billing/subscription-service.ts`, add:

```ts
import { redactLogValue } from "../../observability/redaction";
```

- [ ] **Step 2: Redact payload before insert**

Change:

```ts
payload: input.payload ?? null,
```

to:

```ts
payload: redactLogValue(input.payload) ?? null,
```

### Task 5.6: Redact Webhook Failure Details

- [ ] **Step 1: Import redaction helpers**

In `apps/api/src/modules/payments/webhook-event-store.ts`, import:

```ts
import { redactString } from "../../observability/redaction";
```

- [ ] **Step 2: Redact error fields in `safeErrorDetails`**

Ensure Error output uses:

```ts
return {
  name: redactString(error.name),
  message: redactString(error.message),
  ...(error.stack ? { stack: redactString(error.stack) } : {}),
};
```

- [ ] **Step 3: Run payment package and API tests**

Run:

```bash
bun test packages/payments-core
bun test apps/api
```

Expected: payment mapping, webhook verification, and API tests pass.

---

## Phase 6: Privacy Export Hardening

**Goal:** Avoid unnecessary long-term sensitive export retention and complete export coverage.

**Files:**
- Modify: `apps/api/src/modules/privacy/service.ts`

### Task 6.1: Include Subscription Data In Exports

- [ ] **Step 1: Add schema destructuring**

In `apps/api/src/modules/privacy/service.ts`, include:

```ts
checkoutIntents,
subscriptionPayments,
userSubscriptions,
```

in the schema destructuring block.

- [ ] **Step 2: Extend `buildUserDataExport` input**

Add fields:

```ts
subscriptions: Record<string, unknown>[];
subscriptionPayments: Record<string, unknown>[];
checkoutIntents: Record<string, unknown>[];
```

- [ ] **Step 3: Add output section**

Add to the returned export bundle:

```ts
subscriptions: {
  subscriptions: input.subscriptions,
  payments: input.subscriptionPayments,
  checkoutIntents: input.checkoutIntents,
},
```

- [ ] **Step 4: Query subscription data in `createExport`**

Extend the `Promise.all` list with:

```ts
deps.db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)),
deps.db.select().from(subscriptionPayments).where(eq(subscriptionPayments.userId, userId)).orderBy(desc(subscriptionPayments.createdAt)),
deps.db.select().from(checkoutIntents).where(eq(checkoutIntents.userId, userId)).orderBy(desc(checkoutIntents.createdAt)),
```

Pass those results into `buildUserDataExport`.

### Task 6.2: Clear Export Payloads After Download And Cancel

- [ ] **Step 1: Clear payload on cancel**

Change `cancelExport` update set to:

```ts
.set({
  status: "expired",
  downloadTokenHash: null,
  exportData: null,
  updatedAt: now(),
})
```

- [ ] **Step 2: Clear payload on download**

Change `downloadExport` update set to:

```ts
.set({
  status: "downloaded",
  downloadedAt: now(),
  downloadTokenHash: null,
  exportData: null,
  updatedAt: now(),
})
```

### Task 6.3: Expire Stale Active Exports Before Creating A New One

- [ ] **Step 1: Import `lt` if needed**

Change import to include `lt`:

```ts
import { and, desc, eq, inArray, lt } from "drizzle-orm";
```

- [ ] **Step 2: Add cleanup before insert in `createExport`**

At the start of `createExport`, add:

```ts
await deps.db
  .update(userDataExportRequests)
  .set({ status: "expired", downloadTokenHash: null, exportData: null, updatedAt: now() })
  .where(and(
    eq(userDataExportRequests.userId, userId),
    inArray(userDataExportRequests.status, ["pending", "ready"]),
    lt(userDataExportRequests.expiresAt, now()),
  ));
```

- [ ] **Step 3: Run privacy/API tests**

Run:

```bash
bun test apps/api
```

Expected: privacy export tests pass, or add focused tests if missing.

---

## Phase 7: Observability And Logging

**Goal:** Make logging structured, redacted, and non-disruptive.

**Files:**
- Modify: `apps/api/src/observability/logger.ts`
- Modify: `apps/api/src/observability/redaction.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/logrotate/api-main.conf`
- Modify: `.gitignore`
- Modify: `apps/api/.env.example`

### Task 7.1: Make Empty LOG_FILE_PATH Mean Stdout Only

- [ ] **Step 1: Change log directory type**

In `logger.ts`, replace `resolveLogDirectory` with:

```ts
function resolveLogDirectory() {
  if (!env.LOG_FILE_PATH) {
    return null;
  }

  const resolved = path.resolve(env.LOG_FILE_PATH);
  return path.extname(resolved) ? path.dirname(resolved) : resolved;
}
```

- [ ] **Step 2: Guard path helpers**

Change `getLogFilePath` to:

```ts
function getLogFilePath(stream: LogStream, date = new Date()) {
  if (!logDirectory) {
    throw new Error("File logging is disabled");
  }

  return path.join(logDirectory, getLogFileName(stream, date));
}
```

- [ ] **Step 3: Guard read/list methods**

At the start of `listLogFiles`, return empty when `!logDirectory`:

```ts
if (!logDirectory || !fs.existsSync(logDirectory)) {
  return { files: [] as string[], selectedFile: null };
}
```

At the start of `readLogEntries`, let existing `selectedFile` logic return empty when no files exist.

### Task 7.2: Honor LOG_LEVEL

- [ ] **Step 1: Add level priorities**

Add near constants:

```ts
const levelPriority = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 99,
} as const;

function shouldLog(level: LogLevel) {
  return levelPriority[level] >= levelPriority[env.LOG_LEVEL];
}
```

- [ ] **Step 2: Guard `writeEntry`**

At the top of `writeEntry`, add:

```ts
if (!shouldLog(level)) return;
```

### Task 7.3: Avoid Sync File Writes On Request Path

- [ ] **Step 1: Make file writes best-effort async**

Add:

```ts
let logDirReady = false;

async function writeFileEntry(stream: LogStream, line: string) {
  if (!logDirectory) return;

  try {
    if (!logDirReady) {
      await fs.promises.mkdir(logDirectory, { recursive: true });
      logDirReady = true;
    }

    await fs.promises.appendFile(getLogFilePath(stream), line, "utf8");
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "log.write.failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
```

- [ ] **Step 2: Replace sync write calls**

Replace:

```ts
fs.mkdirSync(logDirectory, { recursive: true });
fs.appendFileSync(getLogFilePath(stream), line, "utf8");
```

with:

```ts
void writeFileEntry(stream, line);
```

### Task 7.4: Replace Raw Console Error In Customer Portal Route

- [ ] **Step 1: Import logger if needed**

In `apps/api/src/routes/me.ts`, add:

```ts
import { logger } from "../observability/logger";
```

- [ ] **Step 2: Replace raw console error**

Replace:

```ts
console.error("Customer portal error:", error);
```

with:

```ts
logger.error(
  {
    requestId: c.get("requestId"),
    userId: authUser.id,
    error,
  },
  "customer_portal.create.failed",
);
```

### Task 7.5: Update Logrotate And Ignores

- [ ] **Step 1: Replace logrotate glob**

In `apps/api/logrotate/api-main.conf`, replace:

```conf
/var/log/api-main/*.log {
```

with:

```conf
/var/log/api-main/*.jsonl {
```

- [ ] **Step 2: Add root runtime logs to gitignore**

In `.gitignore`, add:

```gitignore
/runtime-logs/
runtime-logs/
```

- [ ] **Step 3: Update `.env.example` LOG_FILE_PATH guidance**

In `apps/api/.env.example`, change the logging section to:

```env
# Optional local file logging directory. Leave empty to log to stdout only.
LOG_FILE_PATH=""
```

- [ ] **Step 4: Run API checks**

Run:

```bash
bun test apps/api
bun run typecheck
```

Expected: tests and typecheck pass.

---

## Phase 8: Environment And Runtime Readiness

**Goal:** Fail fast on unsafe production config and support production deployment lifecycle.

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/web/src/env.ts`
- Modify: `apps/admin/src/env.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/routes/system.ts`

### Task 8.1: Harden API Env Validation

- [ ] **Step 1: Add production super-refinement**

In `apps/api/src/env.ts`, change `envSchema` to include `.superRefine(...)`:

```ts
const placeholderSecrets = new Set([
  "replace-with-strong-secret",
  "changeme",
  "change-me",
]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  LOG_FILE_PATH: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  COOKIE_DOMAIN: emptyToUndefined(z.string()),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_ALLOWLIST: z.string().optional(),
  ADMIN_APP_URL: z.string().url().optional(),
  ADMIN_BAN_SECRET: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  DODO_PAYMENTS_API_KEY: z.string().optional(),
  DODO_PAYMENTS_WEBHOOK_SECRET: z.string().optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default("api"),
  JWT_AUDIENCE: z.string().default("mobile-clients"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") return;

  for (const key of ["BETTER_AUTH_SECRET", "JWT_SECRET"] as const) {
    if (placeholderSecrets.has(value[key]) || value[key].length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must be a non-placeholder production secret with at least 32 characters`,
      });
    }
  }

  for (const key of ["APP_URL", "API_URL"] as const) {
    if (new URL(value[key]).protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} must use https in production`,
      });
    }
  }

  if (value.DODO_PAYMENTS_ENVIRONMENT === "live_mode") {
    for (const key of ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_SECRET"] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required for live payments`,
        });
      }
    }
  }
});
```

### Task 8.2: Validate Frontend URLs

- [ ] **Step 1: Update web env**

In `apps/web/src/env.ts`, change:

```ts
NEXT_PUBLIC_APP_URL: z.string().nonempty(),
```

to:

```ts
NEXT_PUBLIC_APP_URL: z.string().url(),
```

- [ ] **Step 2: Update admin env**

In `apps/admin/src/env.ts`, change:

```ts
NEXT_PUBLIC_APP_URL: z.string().nonempty(),
```

to:

```ts
NEXT_PUBLIC_APP_URL: z.string().url(),
```

### Task 8.3: Add Graceful Shutdown

- [ ] **Step 1: Replace server startup**

Replace `apps/api/src/server.ts` with:

```ts
import "dotenv/config";

import { serve } from "@hono/node-server";

import { app } from "./app";
import { env } from "./env";
import { logger } from "./observability/logger";

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port }, `API server listening on http://localhost:${info.port}`);
  },
);

function shutdown(signal: string) {
  logger.info({ signal }, "api.server.shutdown");
  server.close(() => {
    logger.info("api.server.closed");
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### Task 8.4: Add Readiness Endpoint

- [ ] **Step 1: Import SQL helper**

In `apps/api/src/routes/system.ts`, add `sql` to the drizzle import:

```ts
import { asc, eq, sql } from "drizzle-orm";
```

- [ ] **Step 2: Add `/ready` route**

After `/health`, add:

```ts
router.get("/ready", async (c) => {
  try {
    await bootstrap.db.execute(sql`select 1`);
    return ok(c, { status: "ready" });
  } catch {
    return c.json({ success: false, status: "not_ready" }, 503);
  }
});
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes.

---

## Phase 9: Frontend And Package Boundary Cleanup

**Goal:** Remove drift in frontend security/config/type boundaries without changing product behavior.

**Files:**
- Modify: `apps/admin/src/proxy.ts`
- Modify: `apps/web/src/config/billing.ts`
- Modify: `apps/admin/src/config/billing.ts`
- Modify: `apps/web/src/schemas/credits.ts`
- Modify: `apps/admin/src/schemas/credits.ts`
- Modify: `packages/frontend-shared/package.json`

### Task 9.1: Harden Admin Proxy API Origin

- [ ] **Step 1: Replace main app login URL fallback**

In `apps/admin/src/proxy.ts`, replace `getMainAppLoginUrl` with:

```ts
function getMainAppLoginUrl(locale: string) {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL;
  if (!base) return `/${locale}/login?reason=forbidden-admin`;
  return `${base.replace(/\/$/, "")}/${locale}/login?reason=forbidden-admin`;
}
```

- [ ] **Step 2: Require API URL for admin status check**

Replace:

```ts
const sessionUrl = `${(process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/admin/status`;
```

with:

```ts
const apiBaseUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
if (!apiBaseUrl) {
  return NextResponse.redirect(getMainAppLoginUrl(activeLocale));
}

const sessionUrl = `${apiBaseUrl.replace(/\/$/, "")}/admin/status`;
```

### Task 9.2: Declare Frontend Shared Contracts Dependency

- [ ] **Step 1: Update package manifest**

In `packages/frontend-shared/package.json`, add:

```json
"dependencies": {
  "@platform/contracts": "*"
},
```

before `peerDependencies`.

### Task 9.3: Consolidate Billing Config

- [ ] **Step 1: Inspect existing API billing config**

Read `apps/api/src/config/billing.ts` and decide whether shared config already exists in `packages/contracts`.

- [ ] **Step 2: If contracts already exports billing config, replace app configs**

Replace both `apps/web/src/config/billing.ts` and `apps/admin/src/config/billing.ts` with:

```ts
export {
  billingConfig,
  creditPackages,
  subscriptionPlans,
  type SubscriptionPlan,
} from "@platform/contracts";
```

- [ ] **Step 3: If contracts does not export billing config, create one shared export first**

Add a single shared billing config file under `packages/contracts/src/ts/billing/config.ts`, export it from `packages/contracts/src/index.ts`, then use the re-export code from Step 2.

### Task 9.4: Remove App-Local Credit Type Drift

- [ ] **Step 1: Replace credit schemas with shared exports after Task 9.3**

Replace `apps/web/src/schemas/credits.ts` and `apps/admin/src/schemas/credits.ts` with contract/shared-backed exports:

```ts
export {
  creditPackages,
  billingConfig,
} from "@/config/billing";

export type {
  CreditBalanceResponse as CreditBalance,
  CreditPurchaseResponse as CreditPurchase,
  CreditTransactionResponse as CreditTransaction,
} from "@platform/contracts";
```

If those exact response type names do not exist, use the actual exported names from `packages/contracts/src/wire/billing/responses.ts`.

- [ ] **Step 2: Run frontend typechecks**

Run:

```bash
bun run typecheck
```

Expected: web/admin imports resolve and typecheck passes.

---

## Phase 10: Final Verification And Review

**Goal:** Confirm the hardening work is complete before moving to multi-tenancy design.

**Files:**
- No planned production edits.

- [ ] **Step 1: Run full tests**

Run:

```bash
bun test
```

Expected: all tests pass, or only documented pre-existing failures remain.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Search for raw production console logging**

Run:

```bash
rg "console\.(log|error|warn)" apps/api/src packages/*/src
```

Expected: no production-path raw console calls remain except startup/env validation or explicitly justified logger fallbacks.

- [ ] **Step 4: Search for direct DB imports in frontends**

Run:

```bash
rg "platform-db|@platform/platform-db" apps/web apps/admin
```

Expected: no matches.

- [ ] **Step 5: Search for stale runtime logs**

Run:

```bash
git ls-files | rg "runtime-logs|\.jsonl$"
```

Expected: no committed runtime logs.

- [ ] **Step 6: Run migration validation command if available**

Run the migration validation command identified in Phase 0.

Expected: fresh migration chain succeeds.

- [ ] **Step 7: Request code review**

Use the requesting-code-review skill with the final diff.

Expected: no critical or important findings remain before merge.

---

## Post-Hardening Multi-Tenancy Design Inputs

Do not implement these in this plan. Capture these as design questions for the next phase:

- Is identity global with tenant memberships, or can the same email exist in multiple tenants?
- Is billing owned by user, tenant, or both?
- Are platform admins separate from tenant admins?
- Which data remains user-owned versus tenant-owned?
- Should tenant isolation rely on app-level scoping, Postgres RLS, or both?
- How should audit logs represent tenant context and platform-admin actions?

---

## Self-Review

- Spec coverage: The plan covers billing integrity, admin security, API ingress, webhook robustness, schema/migration safety, privacy exports, logging, environment validation, runtime readiness, and frontend/package boundary cleanup.
- Placeholder scan: No implementation step uses TBD/TODO placeholders. Task 9.3 includes a conditional branch because the exact shared billing export location must be verified before editing; both branches include concrete code.
- Type consistency: Function and file names match the audited code paths. Where response type names may differ, the plan points to the exact source file to select the actual exported names before implementation.
