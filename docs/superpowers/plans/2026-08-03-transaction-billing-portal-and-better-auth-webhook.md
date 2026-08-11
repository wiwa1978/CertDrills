# Transaction Billing Portal And Better Auth Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Option A transaction billing portal, support tax-exclusive Dodo products, and route Better Auth verified webhooks through the existing local idempotent fulfillment pipeline.

**Architecture:** Extract post-verification webhook ingestion from the custom Hono route into a reusable payments-core service, then invoke it from both the custom endpoint and Better Auth's `webhooks()` callback. Treat configured transaction prices as immutable pre-tax subtotals and reconcile Dodo's final tax/total during webhook processing. Extend shared frontend APIs and render a responsive catalog, sticky basket, orders, and entitlements when transaction mode is active.

**Tech Stack:** Bun, TypeScript, Hono, Better Auth, Dodo Payments SDK, Drizzle ORM, Next.js, React Query, next-intl, Vitest.

---

## Task 1: Shared Webhook Ingestion

**Files:**
- Modify: `packages/payments-core/src/types.ts`
- Modify: `packages/payments-core/src/create-payments-module.ts`
- Modify: `packages/payments-core/src/index.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Test: `apps/api/tests/payments-core/better-auth-webhook-bridge.test.ts`
- Test: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Write failing bridge tests**

Add tests proving:

```ts
const ingestion = createPaymentWebhookIngestion({
  provider: "dodo",
  mapEvent: mapDodoEvent,
  webhookEventStore,
  onPaymentEvent,
  onWebhookFailure,
});

await ingestion.ingestVerifiedPayload(payload, {
  requestId: "request-1",
  correlationId: "correlation-1",
});
```

The tests must assert event mapping, claim/processed transitions, duplicate delivery, failed handler status, and missing provider event ID. Add an API functional assertion that Better Auth plugin registration includes `webhooks()` and that `/auth/dodopayments/webhooks` is not `404`.

- [ ] **Step 2: Run tests to verify RED**

```bash
bun run --cwd apps/api test tests/payments-core/better-auth-webhook-bridge.test.ts tests/app.functional.test.ts
```

Expected: failure because reusable ingestion and Better Auth webhook registration do not exist.

- [ ] **Step 3: Extract reusable ingestion**

Add to `packages/payments-core/src/types.ts`:

```ts
export type VerifiedWebhookContext = {
  requestId?: string | null;
  correlationId?: string | null;
  signatureTimestamp?: Date;
};

export type PaymentWebhookIngestion = {
  ingestVerifiedPayload(payload: unknown, context?: VerifiedWebhookContext): Promise<{
    processed: boolean;
    duplicate?: boolean;
    status?: WebhookEventProcessingStatus;
  }>;
};
```

Create/export `createPaymentWebhookIngestion()` from `packages/payments-core/src/create-payments-module.ts`. Move mapping, event-ID validation, claim, handler invocation, processed/failed transitions, and failure auditing into it. The custom route keeps signature verification and JSON parsing, then calls the ingestion service.

- [ ] **Step 4: Register Better Auth webhooks**

In `apps/api/src/bootstrap.ts`, import `webhooks` from `@dodopayments/better-auth`. Create one Dodo ingestion instance using `mapDodoEvent`, `paymentWebhookEventStore`, the existing payment event handler, and audit callback. Register:

```ts
webhooks({
  webhookKey: env.DODO_PAYMENTS_WEBHOOK_SECRET!,
  onPayload: async (payload) => {
    await dodoWebhookIngestion.ingestVerifiedPayload(payload);
  },
})
```

only when a webhook secret is configured. Include it in transaction, credit, and subscription Dodo plugin configurations. Preserve checkout/portal behavior.

- [ ] **Step 5: Run bridge tests**

```bash
bun run --cwd apps/api test tests/payments-core/better-auth-webhook-bridge.test.ts tests/app.functional.test.ts tests/payments-core/webhook-verify.test.ts
```

Expected: pass.

## Task 2: Customer Amount Mapping And Tax-Exclusive Reconciliation

**Files:**
- Modify: `packages/payments-core/src/providers/dodo/mapper.ts`
- Modify: `apps/api/src/modules/billing/transaction-service.ts`
- Modify: `apps/api/src/modules/billing/payment-event-handler.ts`
- Modify: `packages/platform-db/src/schema/billing.ts` only if field comments/types require clarification; no migration is expected
- Test: `apps/api/tests/payments-core/dodo-cart-items.test.ts`
- Test: `apps/api/tests/modules/billing/transaction-service.test.ts`
- Test: `apps/api/tests/modules/billing/payment-event-handler.test.ts`

- [ ] **Step 1: Write failing tax-exclusive tests**

Add mapper tests where `total_amount` differs from `settlement_amount` and `tax` differs from `settlement_tax`. Assert normalized events use customer `total_amount` and `tax`.

Add transaction service tests for an order with `subtotalAmount: 1000` receiving `totalAmount: 1210`, `taxAmount: 210`. Assert fulfillment succeeds and persists:

```ts
{
  subtotalAmount: 1000,
  taxAmount: 210,
  totalAmount: 1210,
}
```

Add mismatch tests where `totalAmount - taxAmount !== order.subtotalAmount`.

- [ ] **Step 2: Run tests to verify RED**

```bash
bun run --cwd apps/api test tests/payments-core/dodo-cart-items.test.ts tests/modules/billing/transaction-service.test.ts tests/modules/billing/payment-event-handler.test.ts
```

Expected: current mapper prefers settlement values and service requires total/tax to equal provisional order fields.

- [ ] **Step 3: Use customer amounts in Dodo mapper**

For succeeded, failed, and processing events, map:

```ts
currency: data.currency ?? data.settlement_currency,
totalAmount: data.total_amount,
taxAmount: data.tax ?? 0,
```

Extend schemas for the customer `currency` field. Keep settlement fields only in `raw`.

- [ ] **Step 4: Reconcile tax-exclusive orders**

In `handleTransactionPayment`, replace provisional total/tax equality with:

```ts
if (input.totalAmount - input.taxAmount !== Number(order.subtotalAmount)) {
  throw new Error(`Refusing payment ${input.paymentId}: transaction subtotal mismatch.`);
}
```

Validate currency and `0 <= tax <= total`. Every pending/failed/completed conditional order update persists the immutable subtotal and provider-authoritative tax and total in the same transaction.

- [ ] **Step 5: Run tax tests**

```bash
bun run --cwd apps/api test tests/payments-core/dodo-cart-items.test.ts tests/modules/billing/transaction-service.test.ts tests/modules/billing/payment-event-handler.test.ts
```

Expected: pass.

## Task 3: Transaction Routes And Shared Frontend API

**Files:**
- Modify: `packages/contracts/src/ts/api/routes.ts`
- Modify: `packages/frontend-shared/src/me-api.ts`
- Modify: `packages/frontend-shared/src/query-keys.ts`
- Modify: `packages/frontend-shared/src/index.ts` if exports are needed
- Modify: `apps/web/src/lib/api/me.ts`
- Modify: `apps/web/src/lib/api/me.server.ts`
- Test: `packages/frontend-shared/tests/me-api.test.ts`
- Test: `packages/frontend-shared/tests/query-keys.test.ts`
- Test: `apps/web/tests/lib/transaction-api.test.ts`

- [ ] **Step 1: Write failing API method tests**

Assert exact methods and paths for basket read/upsert/remove/clear, checkout, order list/detail, and entitlement list. Assert query keys:

```ts
queryKeys.transactions.basket
queryKeys.transactions.orders
queryKeys.transactions.entitlements
```

- [ ] **Step 2: Run tests to verify RED**

```bash
bun run --cwd packages/frontend-shared test tests/me-api.test.ts tests/query-keys.test.ts
bun run --cwd apps/web test tests/lib/transaction-api.test.ts
```

- [ ] **Step 3: Add route builders and typed methods**

Add to `apiRoutes.me`:

```ts
transactionBasket: "/me/transaction-basket",
transactionBasketItems: "/me/transaction-basket/items",
transactionBasketItem: (productKey: string) => `/me/transaction-basket/items/${encodeURIComponent(productKey)}`,
transactionCheckout: "/me/transaction-basket/checkout",
transactionOrders: "/me/transaction-orders",
transactionOrder: (orderId: string) => `/me/transaction-orders/${encodeURIComponent(orderId)}`,
transactionEntitlements: "/me/transaction-entitlements",
```

Use contract types `TransactionBasket`, `TransactionCheckout`, `TransactionOrder`, and `TransactionEntitlement` in shared API return types.

- [ ] **Step 4: Add web wrappers**

Expose client and server functions following existing `meApi` wrappers. Server functions load initial basket/orders/entitlements; client functions perform mutations and checkout.

- [ ] **Step 5: Run shared/frontend API tests**

```bash
bun run --cwd packages/frontend-shared test
bun run --cwd apps/web test tests/lib/transaction-api.test.ts
```

Expected: pass.

## Task 4: Option A Transaction Billing Portal

**Files:**
- Create: `apps/web/src/components/layout/backend/billing/transaction-billing-portal.tsx`
- Create: `apps/web/src/components/layout/backend/billing/transaction-product-catalog.tsx`
- Create: `apps/web/src/components/layout/backend/billing/transaction-basket.tsx`
- Create: `apps/web/src/components/layout/backend/billing/transaction-orders.tsx`
- Create: `apps/web/src/components/layout/backend/billing/transaction-entitlements.tsx`
- Modify: `apps/web/src/app/[locale]/(backend)/billing/page.tsx`
- Modify: `apps/web/src/config/billing.ts`
- Test: `apps/web/tests/app/transaction-billing-page.test.ts`
- Test: `apps/web/tests/components/transaction-billing-portal.test.ts`

- [ ] **Step 1: Write failing page mode test**

Mock application config with `transactionSurfacesEnabled: true` and assert the billing page returns the transaction portal rather than `null`, credit UI, or subscription UI.

- [ ] **Step 2: Write failing interaction tests**

Test catalog product rendering, sticky basket content, quantity updates, remove/clear operations, disabled empty checkout, checkout redirect, order totals, and entitlement statuses. Use fake typed API methods rather than mocking internal component state.

- [ ] **Step 3: Run tests to verify RED**

```bash
bun run --cwd apps/web test tests/app/transaction-billing-page.test.ts tests/components/transaction-billing-portal.test.ts
```

- [ ] **Step 4: Implement transaction page branch**

In `billing/page.tsx`, check transaction mode before the credit fallback:

```tsx
if (applicationConfig.billing.transactionSurfacesEnabled) {
  const [basket, orders, entitlements] = await Promise.all([
    getMyTransactionBasketServer(),
    getMyTransactionOrdersServer(),
    getMyTransactionEntitlementsServer(),
  ]);
  return <TransactionBillingPortal initialBasket={basket} initialOrders={orders} initialEntitlements={entitlements} />;
}
```

- [ ] **Step 5: Implement Option A components**

Use a responsive `lg:grid-cols-[minmax(0,1fr)_22rem]` storefront. Catalog renders active shared products. Basket uses `lg:sticky lg:top-24`. Use React Query mutations to update basket state and invalidate/refetch basket data. Checkout calls transaction checkout and redirects to `checkoutUrl`. Orders and entitlements are read-only sections below.

- [ ] **Step 6: Run portal tests**

```bash
bun run --cwd apps/web test tests/app/transaction-billing-page.test.ts tests/components/transaction-billing-portal.test.ts
```

Expected: pass on desktop component behavior; existing CSS utilities provide mobile stacking.

## Task 5: Localization And Message Coverage

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/fr.json`
- Modify: `apps/web/src/messages/nl.json`
- Modify: `apps/web/tests/messages.test.ts`

- [ ] **Step 1: Extend failing message tests**

Assert every `transactionProducts` key has localized `name` and `description`, and locale shapes remain in parity.

- [ ] **Step 2: Run test to verify RED**

```bash
bun run --cwd apps/web test tests/messages.test.ts
```

- [ ] **Step 3: Add transaction billing messages**

Add `billing.transaction` namespaces in all three locales for title, description, catalog, basket, subtotal, tax-at-checkout note, checkout states, order statuses, entitlement statuses, empty/loading/error states, and each product key.

- [ ] **Step 4: Run message tests**

```bash
bun run --cwd apps/web test tests/messages.test.ts
```

Expected: pass.

## Task 6: Full Verification And Rollout Documentation

**Files:**
- Modify: `README.md`
- Modify: `apps/api/README.md`
- Modify: `apps/api/.env.example` only if webhook comments need clarification

- [ ] **Step 1: Document both webhook endpoints and migration**

Document preferred endpoint:

```text
${PUBLIC_API_URL}/auth/dodopayments/webhooks
```

Document deprecated compatibility endpoint:

```text
${PUBLIC_API_URL}/payments/webhooks/dodo
```

State that Dodo transaction products are one-time, tax-exclusive, and their IDs belong in `transaction-products.ts`. Include `DATABASE_URL=... bun run db:migrate`.

- [ ] **Step 2: Run complete verification**

```bash
bun run test:api
bun run test:web
bun run test:packages
bun run typecheck:all
bun run db:check
```

Expected: all commands pass. If the billing-mode default test still assumes credits while the configured mode is transactions, update that test to assert the configured mode is a valid `BillingMode` rather than hardcoding credits.

- [ ] **Step 3: Verify endpoint rollout locally**

Start the API with a webhook secret and verify an unsigned request reaches the Better Auth route and returns a signature/verification error rather than `404`:

```bash
curl -i -X POST http://localhost:8787/auth/dodopayments/webhooks \
  -H 'content-type: application/json' \
  --data '{}'
```

Expected: non-404 error response.
