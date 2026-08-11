# Transaction Billing Mode Design

## Context

The API currently supports two mutually exclusive billing modes: `credits` and `subscriptions`. Credits use fixed top-ups and an internal credit ledger. Subscriptions use plans, subscription payments, subscription webhook handling, and subscription status persistence. Checkout and webhook handling are already mode-aware through `billingMode` metadata, checkout intents, provider product mappings, and feature guards.

Transaction billing should be a third, separate mode. It should work like an e-shop basket: users add one or more concrete products or billable actions to a persisted server-side basket, checkout creates an immutable order, and successful payment creates durable entitlements that the application can consume later.

## Goals

- Add `transactions` as a third billing mode alongside `credits` and `subscriptions`.
- Provide a persisted server-side basket for transaction-mode users.
- Support multiple different products and quantities in one basket and one checkout.
- Keep all pricing, currency, product lookup, total calculation, and checkout metadata generation server-side.
- Convert checkout baskets into immutable transaction orders.
- Fulfill paid orders by creating durable entitlements exactly once after successful payment.
- Keep credit and subscription behavior unchanged in phase 1.
- Record admin transaction/order/payment/refund surfaces as a formal phase-2 follow-up.

## Non-Goals

- Do not merge credits, subscriptions, and transaction products into one mixed basket in phase 1.
- Do not move existing credit package checkout onto the basket flow in phase 1.
- Do not add admin transaction endpoints in phase 1.
- Do not execute purchased actions immediately from the payment webhook.
- Do not implement automatic refund entitlement reversal in phase 1 unless a later implementation plan explicitly expands scope.

## Architecture

Extend the current mode-aware billing architecture rather than replacing it.

- `applicationConfig.billing.mode` becomes `"credits" | "subscriptions" | "transactions"`.
- Feature guards gain `ensureTransactionBillingEnabled()`.
- Transaction-only routes fail closed when any other billing mode is active.
- Credit-only and subscription-only routes keep their current guards.
- A shared transaction catalog defines purchasable products/actions with stable keys, prices, currency, provider product IDs, active flags, and fulfillment metadata.
- A basket is an editable draft owned by a user.
- An order is immutable once checkout begins.
- Entitlements are the durable fulfillment records consumed by application features.

The basket/order/entitlement boundary keeps provider checkout isolated from application feature consumption. Payment webhooks mutate order and entitlement state, while later feature usage consumes entitlements without creating another provider checkout or touching credits.

## Components

Add or extend these units:

- `apps/api/src/config/application.ts`: extend `BillingMode` with `transactions`.
- `apps/api/src/lib/billing-mode.ts`: add `isTransactionBillingMode()` and `shouldExposeTransactionBillingSurfaces()` if needed by route/session responses.
- `apps/api/src/lib/feature-guards.ts`: add `ensureTransactionBillingEnabled()`.
- `packages/contracts/src/ts/billing/transaction-products.ts`: define the transaction product catalog and exported product types.
- `packages/contracts/src/wire/billing/*`: add basket, order, order item, entitlement, and transaction checkout schemas.
- `packages/platform-db/src/schema/billing.ts`: add transaction basket, basket item, order, order item, and entitlement tables.
- `apps/api/src/modules/payments/provider.ts`: extend the provider abstraction with transaction checkout input that can carry multiple line items.
- `apps/api/src/modules/payments/providers/dodo.ts`: implement multi-line transaction checkout for Dodo using provider-supported cart line items.
- `apps/api/src/modules/billing/transaction-service.ts`: own basket CRUD, total calculation, order creation, checkout binding, webhook fulfillment, entitlement reads, and entitlement consumption.
- `apps/api/src/modules/billing/payment-event-handler.ts`: route `metadata.billingMode === "transactions"` payment events to the transaction service.
- `apps/api/src/routes/me.ts` or a focused transaction route module mounted under `/me`: expose the phase-1 user transaction endpoints.

The transaction service should be the only unit that calculates transaction totals. Clients send product keys and quantities only.

The existing provider checkout abstraction accepts a single `productId`, which is sufficient for credit packages and subscription plans but not for transaction baskets. Transaction mode should add a provider method or discriminated checkout input for multiple line items. The implementation should keep the single-product credit/subscription path unchanged and only use the multi-line provider path for `billingMode: "transactions"`.

## Data Model

Add tables under the existing platform DB billing schema.

### Transaction Baskets

`transaction_baskets`:

- `id`.
- `userId`.
- `status`: `draft`, `converted`, `abandoned`.
- `currency`.
- `createdAt`, `updatedAt`.

`transaction_basket_items`:

- `id`.
- `basketId`.
- `productKey`.
- `quantity`.
- `unitPrice` in minor units.
- `currency`.
- `metadata` for catalog snapshot details safe to persist.
- `createdAt`, `updatedAt`.

The active draft basket should be unique per user. Basket item prices are recalculated from the catalog on mutation and again on checkout, so stored item prices are a snapshot rather than an authority.

### Transaction Orders

`transaction_orders`:

- `id`.
- `userId`.
- `basketId`.
- `status`: `pending_payment`, `paid`, `failed`, `cancelled`, `refunded`, `partially_refunded`.
- `currency`.
- `subtotalAmount`, `taxAmount`, `totalAmount` in minor units.
- `paymentProvider`.
- `paymentId`.
- `providerCustomerId`.
- `checkoutReferenceId`.
- `paidAt`, `failedAt`, `fulfilledAt`.
- `createdAt`, `updatedAt`.

`transaction_order_items`:

- `id`.
- `orderId`.
- `productKey`.
- `quantity`.
- `unitPrice` in minor units.
- `totalAmount` in minor units.
- `currency`.
- `providerProductId`.
- `fulfillmentType`, initially `entitlement`.
- `metadata` for catalog snapshot details.
- `createdAt`, `updatedAt`.

Orders and order items are immutable after creation except for payment and fulfillment status fields on the order. A unique `(orderItemId, unitIndex)`-style key or equivalent idempotency constraint should prevent duplicate entitlement creation for a purchased unit.

### Transaction Entitlements

`transaction_entitlements`:

- `id`.
- `userId`.
- `orderId`.
- `orderItemId`.
- `productKey`.
- `status`: `available`, `consumed`, `refunded`.
- `sourcePaymentId`.
- `consumedAt`, `refundedAt`.
- `metadata`.
- `createdAt`, `updatedAt`.

Fulfillment creates one entitlement per purchased unit. Duplicate successful webhooks must not create duplicate entitlements.

## User API

Phase 1 exposes user transaction endpoints only:

- `GET /me/transaction-basket`: return the current draft basket, creating an empty draft basket if none exists.
- `PUT /me/transaction-basket/items`: add or update an item quantity with `{ productKey, quantity }`.
- `DELETE /me/transaction-basket/items/:productKey`: remove one item.
- `DELETE /me/transaction-basket`: clear the draft basket.
- `POST /me/transaction-basket/checkout`: convert the basket into an order and return a provider checkout URL.
- `GET /me/transaction-orders`: list the authenticated user's transaction orders.
- `GET /me/transaction-orders/:orderId`: return one order with items.
- `GET /me/transaction-entitlements`: list the authenticated user's transaction entitlements.
- `POST /me/transaction-entitlements/:entitlementId/consume`: atomically consume an available entitlement.

`/payments/checkout` should remain the credit/subscription single-product checkout endpoint. Transaction checkout starts from `/me/transaction-basket/checkout` because it depends on a persisted basket and order aggregate.

## Checkout Flow

1. User mutates the draft basket with product keys and quantities.
2. API validates catalog products, active status, quantity bounds, and currency consistency.
3. User starts checkout from the basket.
4. API recalculates all basket lines from the catalog.
5. API rejects empty baskets, inactive products, unknown products, and mixed currencies.
6. API creates an immutable transaction order and order items from the recalculated basket.
7. API creates a checkout intent/reference for the order.
8. API asks the active payment provider for a multi-line transaction checkout URL.
9. Provider checkout metadata includes `billingMode: "transactions"`, `userId`, `orderId`, `checkoutReferenceId`, and validation data needed by the webhook handler.
10. Basket status changes to `converted` after order creation.

If provider checkout URL creation fails after order creation, the order is marked `failed`, the checkout intent is marked `failed`, and the basket remains available as a draft so the user can retry without rebuilding it. Basket status changes to `converted` only after the provider checkout URL has been created successfully.

## Webhook Fulfillment Flow

For `payment.succeeded`, `payment.processing`, and `payment.failed` events with `metadata.billingMode === "transactions"`:

1. `payment-event-handler` calls `ensureTransactionBillingEnabled()`.
2. The handler validates `metadata.userId`, `metadata.orderId`, and checkout reference metadata.
3. The transaction service loads the order and verifies ownership, status, checkout intent, product/order metadata, currency, total amount, and provider cart line items.
4. `payment.processing` keeps or marks the order as `pending_payment`.
5. `payment.failed` marks the order as `failed` if it has not already been paid.
6. `payment.succeeded` marks the order `paid` and creates entitlements for each order item inside one transaction.
7. Duplicate successful webhooks for the same payment/order return without creating additional entitlements.

Refund webhooks for transaction orders are a phase-1 limitation. If `refund.succeeded` arrives with `metadata.billingMode === "transactions"`, the handler should fail closed with an explicit `Transaction refunds require manual reconciliation` error after webhook storage has claimed the event. Automatic reversal should be designed with entitlement consumption and partial refunds in a later phase.

## Entitlement Consumption

Application features consume transaction entitlements after payment fulfillment.

- Only `available` entitlements can be consumed.
- Consumption is atomic and records `consumedAt`.
- Consumed entitlements are not automatically reversible in phase 1.
- Listing endpoints return enough metadata for the app to show what the user owns and whether each entitlement is available, consumed, or refunded.

This mirrors the existing durable-entitlement principle while keeping it generic for transaction-mode products.

## Phase 2 Admin Surfaces

Admin transaction surfaces are deferred but formal scope for phase 2:

- List transaction orders with pagination, status filters, product filters, and user email search.
- View order detail with items, payment identifiers, checkout reference, and entitlement fulfillment state.
- List transaction entitlements by user, product, status, and order.
- Record manual refund/reversal decisions for transaction orders.
- Add refund workflows only after entitlement reversal rules are designed.
- Add transaction revenue and product sales summary cards/charts if the admin dashboard needs parity with credit and subscription dashboards.

The phase-1 schema should include enough identifiers and timestamps to support these admin views later without a schema rewrite.

## Error Handling

- Transaction routes return `400` with `{ success: false, error: "Billing mode disabled: transactions" }` when transaction mode is inactive.
- Basket mutations reject unknown products, inactive products, invalid quantities, and mixed currencies.
- Checkout rejects empty baskets and stale or invalid basket state.
- Checkout recalculates totals from the server catalog and never trusts client prices.
- Webhooks fail closed on missing or mismatched `metadata.userId`, `metadata.billingMode`, `metadata.orderId`, checkout reference, amount, currency, order, order user, order status, checkout intent, or provider cart line items.
- Fulfillment is idempotent for duplicate provider webhooks.
- Entitlement consumption rejects missing, unauthorized, consumed, or refunded entitlements.
- Refunds remain manual in phase 1 unless a later approved plan expands scope.

## Testing

Add or update tests for:

- Billing mode helpers and guards for `transactions`.
- Transaction catalog validation and active/inactive product behavior.
- Basket add, update, remove, clear, and total recalculation.
- Empty basket, invalid quantity, unknown product, inactive product, and mixed-currency rejection.
- Basket checkout order creation and checkout metadata.
- Transaction payment webhook success, processing, and failure paths.
- Webhook validation failures for missing or mismatched user, order, reference, amount, and currency.
- Duplicate successful webhook idempotency.
- Entitlement creation count by order item quantity.
- Entitlement listing and atomic consumption.
- Existing credit and subscription route/webhook tests still passing.

Run at minimum:

- `bun run --cwd apps/api test`.
- `bun run --cwd apps/api typecheck`.
- `bun run typecheck:packages`.
- `bun run db:check` after adding the Drizzle migration.

## Implementation Notes

- Prefer focused transaction-specific service code over a large generic billing abstraction.
- Keep existing credit and subscription behavior untouched except for adding the third mode to shared guards/types.
- Make transaction orders immutable after checkout starts; use new status fields rather than mutating item economics.
- Store monetary amounts in minor units for transaction orders/items to match existing product definitions.
- Design the basket shell so credit packages could later become catalog items, but do not migrate credit checkout in phase 1.
