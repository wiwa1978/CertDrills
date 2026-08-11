# Transaction Billing Portal And Better Auth Webhook Design

## Context

Transaction billing phase 1 added API routes, persisted baskets and orders, Dodo checkout sessions, webhook fulfillment, and durable entitlements. It did not add a web billing-portal UI. In transaction mode the web billing page therefore returns no content.

The current Dodo webhook endpoint is the custom Hono route `/payments/webhooks/dodo`. The installed `@dodopayments/better-auth` package also provides a verified `webhooks()` plugin. The implementation should reuse Better Auth's Dodo signature verification while preserving the platform's local idempotency, webhook storage, retry metadata, provider mapping, and fulfillment pipeline.

The existing transaction order initializes tax to zero and later requires webhook tax to match that placeholder. This incorrectly rejects Dodo payments where tax is calculated during checkout.

## Goals

- Add the Option A transaction billing portal: catalog with a persistent basket rail, followed by orders and entitlements.
- Reuse Better Auth Dodo webhook verification at `/auth/dodopayments/webhooks`.
- Bridge verified Better Auth webhook payloads into the existing local webhook processing and fulfillment pipeline.
- Accept Dodo's authoritative tax and final total while preserving immutable configured subtotals.
- Keep credit and subscription billing behavior unchanged.
- Keep the custom `/payments/webhooks/dodo` endpoint temporarily for compatibility.

## Non-Goals

- Do not add transaction admin UI or refund automation in this phase.
- Do not calculate VAT locally or duplicate Dodo tax rules.
- Do not add a Dodo preview call before checkout.
- Do not remove the custom webhook endpoint yet.
- Do not add mixed credit, subscription, and transaction products to one basket.

## Better Auth Webhook Bridge

Enable `webhooks()` from `@dodopayments/better-auth` alongside the existing Dodo plugin configuration.

The endpoint mounted by this Hono application is:

```text
/auth/dodopayments/webhooks
```

The Dodo dashboard should ultimately use the public API URL, for example:

```text
https://singletenant-hono-api.wimwauters.be/auth/dodopayments/webhooks
```

The package README's `/api/auth/dodopayments/webhooks` example assumes Better Auth is mounted at `/api/auth`; this repository mounts it at `/auth`.

The plugin configuration uses `DODO_PAYMENTS_WEBHOOK_SECRET`. Its `onPayload` callback receives a verified payload and forwards it to a new internal payments-core ingestion function. That function performs the same post-verification work currently embedded in the custom route:

- map the provider payload into `NormalizedPaymentEvent`;
- require and claim the provider event ID;
- persist the sanitized event, request/correlation information available from the bridge, and processing status;
- reject duplicate deliveries consistently across both webhook URLs;
- invoke the existing payment event handler;
- mark the event processed or failed;
- preserve audit and recovery behavior.

The custom `/payments/webhooks/dodo` route retains its current signature verification and delegates to the same internal ingestion function after verification. Both routes therefore share event-ID idempotency.

Better Auth webhook callback failures must propagate so Dodo receives a non-2xx response and retries. The local webhook record remains the operational source for failure and retry visibility.

## Transaction Tax Reconciliation

Configured transaction catalog prices are immutable pre-tax subtotals in minor units. The basket displays the subtotal and states that tax and the final total are calculated by Dodo during secure checkout.

For payment events, use customer economics:

- `total_amount` is the amount charged to the customer;
- `tax` is the customer tax amount;
- settlement amount and settlement tax remain provider settlement metadata and are not used for local order validation.

On `payment.succeeded`, `payment.processing`, and `payment.failed` transaction events:

- require total amount, tax amount, and currency;
- validate `total_amount - tax` equals the immutable order subtotal;
- validate `0 <= tax <= total`;
- preserve the immutable configured subtotal;
- atomically persist `subtotalAmount`, `taxAmount`, and `totalAmount` with the payment state transition;
- continue validating provider cart product IDs and quantities.

The initial order stores `subtotalAmount = configured basket subtotal`, `taxAmount = 0`, and `totalAmount = subtotalAmount` as a provisional value before provider checkout. Webhook processing preserves the subtotal and replaces the provisional tax and total with Dodo's authoritative customer values. The final total may therefore be greater than the configured subtotal.

## Web Billing Portal

When `applicationConfig.billing.transactionSurfacesEnabled` is true, the web `/billing` page renders transaction billing instead of returning `null`.

### Layout

Use Option A:

- Page header with localized transaction billing title and description.
- Responsive two-column storefront on desktop.
- Product catalog on the left.
- Sticky basket rail on the right.
- On mobile, stack catalog, basket, recent orders, and entitlements vertically.
- Recent orders and entitlements appear below the storefront.

### Catalog

Render active products from the shared transaction catalog. Each product card shows:

- localized name and description;
- configured pre-tax price and currency;
- quantity controls;
- add/update basket action.

The client sends product keys and quantities only. It never sends prices.

### Basket

The basket rail shows:

- product name;
- quantity controls;
- line totals;
- remove and clear actions;
- configured basket subtotal;
- localized note that tax and the final total are calculated at checkout;
- checkout button.

The checkout button is disabled for an empty basket, while a mutation is in progress, or while checkout is being created. Successful checkout redirects to the Dodo checkout URL.

### Orders And Entitlements

Recent orders show:

- creation date;
- payment/fulfillment status;
- order items and quantities;
- subtotal, tax, and total;
- payment identifier when available.

Entitlements show:

- product name;
- available, consumed, or refunded status;
- source order;
- creation and consumption dates.

The portal displays entitlements but does not provide a generic consume button. Product-specific application flows remain responsible for entitlement consumption.

## Frontend API Layer

Extend shared route builders and `packages/frontend-shared` with typed methods for:

- get transaction basket;
- add/update basket item;
- remove basket item;
- clear basket;
- create transaction checkout;
- list transaction orders;
- get transaction order;
- list transaction entitlements.

Add web client/server wrappers following existing `me-api` patterns. React Query keys remain grouped under transaction billing. Basket mutations invalidate/refetch the basket. Checkout redirects without optimistic order creation. Returning from checkout refreshes orders and entitlements.

## Localization

Add English, French, and Dutch messages for:

- portal title and description;
- catalog and basket headings;
- add/update/remove/clear actions;
- quantity and totals;
- tax-at-checkout note;
- checkout loading and errors;
- order headings/status labels;
- entitlement headings/status labels;
- empty and loading states;
- transaction product names and descriptions.

Message tests must assert locale shape parity and require localized entries for every configured transaction product key.

## Error Handling

- Empty baskets cannot checkout.
- Unknown or inactive products, invalid quantities, and mixed currencies remain server-rejected.
- Basket API failures show localized errors and retain the last successfully loaded basket.
- Controls are disabled while mutations or checkout creation are pending.
- Better Auth webhook verification or local processing failure returns non-2xx for Dodo retry.
- Duplicate delivery through either webhook endpoint does not duplicate orders, payments, or entitlements.
- Tax may be zero or positive but cannot exceed total.
- Transaction refunds remain manual reconciliation and fail closed as currently designed.

## Testing

Add or update tests for:

- Better Auth `webhooks()` plugin registration and endpoint availability;
- verified payload bridging into local ingestion;
- invalid Better Auth webhook signatures;
- duplicate delivery across Better Auth and custom endpoints;
- local webhook storage and failure behavior through the bridge;
- customer `total_amount` and `tax` mapping;
- tax-exclusive and tax-inclusive transaction fulfillment;
- total, currency, and cart mismatch rejection;
- typed frontend transaction API methods;
- transaction billing page mode selection;
- catalog and persistent basket rendering;
- add, update, remove, clear, and checkout actions;
- checkout redirect;
- order and entitlement rendering;
- English, French, and Dutch message completeness;
- existing credit/subscription and custom webhook behavior.

Run at minimum:

```bash
bun run test:api
bun run test:web
bun run test:packages
bun run typecheck:all
bun run db:check
```

## Rollout

1. Deploy the code while Dodo still targets `/payments/webhooks/dodo`.
2. Confirm `POST /auth/dodopayments/webhooks` exists in the deployed API and rejects unsigned requests rather than returning `404`.
3. Update the Dodo webhook URL to the public API endpoint `/auth/dodopayments/webhooks`.
4. Send a Dodo test event and confirm it appears once in the admin webhook monitor.
5. Keep the custom endpoint available during the transition and remove it only in a separately approved cleanup.
