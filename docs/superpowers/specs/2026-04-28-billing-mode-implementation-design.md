# Billing Mode Implementation Design

## Context

The reference `Boilerplate-SingleTenant` repository supports two billing modes through `src/config/application.ts`: `credits` and `subscriptions`. The configured mode determines which Dodo products are registered, which webhook path is accepted, and which billing surfaces are visible. Credit billing remains the existing package-purchase flow. Subscription billing adds plan configuration, subscription webhook persistence, and subscription status reads.

The Hono repository currently implements credit billing only. It has credit package configuration, checkout URL creation, credit purchase webhook handling, credit tables, credit routes, voucher redemption, and admin credit analytics. There is no central application config, no billing-mode helper, and no subscription schema or webhook handling.

## Goals

- Add a central billing mode flag in `apps/api/src/config/application.ts` with `BillingMode = "credits" | "subscriptions"`.
- Preserve existing credit billing behavior by default when mode is `credits`.
- Add subscription billing support when mode is `subscriptions`.
- Fail closed for mode-disabled API surfaces with `400 Bad Request` and a clear `Billing mode disabled: <mode>` error.
- Keep the implementation close to the reference repo while fitting the Hono monorepo layout.

## Non-Goals

- Do not add subscription payments to credit purchase tables.
- Do not redesign Dodo integration beyond mode-aware product selection and webhook routing.
- Do not remove credit tables or credit APIs; they remain available when credit mode is configured.
- Do not add frontend UI changes in this implementation plan unless a later task explicitly requests them.

## Architecture

### Application Config

Add `apps/api/src/config/application.ts`:

- `BillingMode = "credits" | "subscriptions"`.
- `applicationConfig.billing.mode` as the authoritative flag, defaulting to `credits` in the Hono repo to preserve current behavior.
- Feature flags for server-side guards where useful, starting with billing-dependent flags such as billing, discounts, vouchers, and notifications.

Add `apps/api/src/lib/billing-mode.ts`:

- `getBillingMode()`.
- `isCreditBillingMode()`.
- `isSubscriptionBillingMode()`.
- `shouldExposeCreditBillingSurfaces()` for code paths that need a boolean rather than an exception.

### Mode Guards

Add `apps/api/src/lib/feature-guards.ts`:

- `createBillingModeDisabledError(mode)` returns an error with `Billing mode disabled: <mode>`.
- `ensureBillingEnabled()` validates global billing feature availability.
- `ensureCreditBillingEnabled()` validates global billing and `credits` mode.
- `ensureSubscriptionBillingEnabled()` validates global billing and `subscriptions` mode.

Routes should catch these guard errors and return `400`. Service and webhook code can throw them directly so webhook processing fails closed when an event targets the wrong mode.

### Billing Product Config

Refactor `apps/api/src/config/billing.ts` to export both billing product groups:

- Existing `creditPackages` and `billingConfig` stay intact.
- Add `subscriptionPlans`, matching the reference shape: `key`, `price`, `currency`, `interval`, `productId`, optional `popular`, and `features`.
- Export `SubscriptionPlan`.

Add `apps/api/src/lib/dodo-billing-products.ts`:

- `getDodoCheckoutProductsForBillingMode(mode)` returns Dodo product mappings from credit packages or subscription plans.

Use this helper in `apps/api/src/bootstrap.ts` so Better Auth Dodo checkout registers only the products for the configured billing mode.

### Checkout Flow

Update `packages/contracts/src/wire/payments/requests.ts` so checkout input can express either a credit package or a subscription plan. The preferred shape is a discriminated union:

- `{ billingMode: "credits", packageKey: string }`.
- `{ billingMode: "subscriptions", planKey: string }`.

For minimal transition cost, route handling may continue accepting the current `{ packageKey }` payload as credit-mode shorthand if needed by existing consumers. If there are no external consumers, the stricter discriminated union is preferred.

Update `apps/api/src/routes/payments.ts`:

- In credit mode, validate the selected package and build the existing checkout URL metadata with `userId` and `packageKey`.
- In subscription mode, validate `planKey` against `subscriptionPlans` and build checkout metadata with `userId` and `planKey`.
- If the request targets the disabled mode, return `400` with `Billing mode disabled: credits` or `Billing mode disabled: subscriptions`.

### Subscription Persistence

Extend platform DB schema with subscription tables, either in `packages/platform-db/src/schema/billing.ts` or a dedicated exported schema file:

- `userSubscriptions` with `userId`, `planKey`, `dodoCustomerId`, `dodoSubscriptionId`, `status`, `currentPeriodStart`, `currentPeriodEnd`, and `cancelAtPeriodEnd`.
- `subscriptionEvents` with `userId`, `dodoSubscriptionId`, `eventType`, `status`, and raw `payload`.
- `SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired" | "paused"`.

Add a Drizzle migration for these tables.

### Subscription Service And Webhooks

Add subscription helpers under `apps/api/src/modules/billing`:

- `normalizeSubscriptionStatus(status)` maps Dodo variants such as `cancelled`, `failed`, `on_hold`, and `pending` into local statuses.
- `hasActiveSubscriptionStatus(status)` returns true for `active` and `trialing`.
- `getUserSubscription(userId)` returns the latest subscription for a user.
- `upsertUserSubscription(input)` upserts by `dodoSubscriptionId`.
- `recordSubscriptionEvent(input)` records every subscription event.

Add a Dodo subscription webhook handler:

- Recognize `subscription.active`, `subscription.renewed`, `subscription.cancelled`, `subscription.failed`, `subscription.expired`, `subscription.on_hold`, `subscription.plan_changed`, and `subscription.updated`.
- Resolve `userId` from metadata.
- Resolve `planKey` from metadata first, then from `subscriptionPlans` by `productId`.
- Record the event before enforcing that both `userId` and `planKey` are present.
- Upsert the current subscription state when required metadata is available.

Update `apps/api/src/modules/billing/payment-event-handler.ts`:

- Credit payment lifecycle, refund, and dispute events call `ensureCreditBillingEnabled()` and keep the existing credit mutation path.
- Subscription webhook events call `ensureSubscriptionBillingEnabled()` and delegate to the subscription handler.
- Unknown or irrelevant event types remain ignored.

### API Surfaces

Credit-only endpoints should be guarded with `ensureCreditBillingEnabled()` and return `400` when subscription mode is active:

- `/me/credits/balance`.
- `/me/credits/history`.
- `/me/credits/purchases`.
- `/me/credits/invoice`.
- `/me/vouchers/redeem` because vouchers grant credits.
- Admin user credit balance/history/purchases.
- Admin credit billing stats, revenue, transactions, purchases, transaction chart, and credits consumed chart.

Subscription endpoints should be guarded with `ensureSubscriptionBillingEnabled()` and return `400` when credit mode is active:

- `/me/subscription` returns the authenticated user's current subscription or `null`.
- `/admin/users/:userId/subscription` returns a user's current subscription.
- `/admin/billing/subscriptions` returns paginated subscriptions with user identity fields.
- `/admin/billing/subscription-stats` returns active subscription counts and recurring revenue values.

The subscription stats should use the same recurring revenue calculation from the reference repo: active and trialing subscriptions contribute their plan price to monthly recurring revenue; annual recurring revenue is MRR multiplied by 12.

### Contracts

Update `packages/contracts` with schemas and types for:

- Billing mode only if an existing client needs to decide which billing UI to show from the API response. Otherwise, keep billing mode server-side for this implementation.
- Subscription records.
- Subscription list responses.
- Subscription stats responses.
- Mode-aware checkout request schema.

Credit response schemas should remain compatible with current credit endpoints.

## Error Handling

- Mode-disabled routes return `400` with `{ success: false, error: "Billing mode disabled: <mode>" }`.
- Webhook events for the disabled mode throw the same guard error so provider retry/failure visibility remains explicit.
- Subscription webhooks record raw events before failing on missing user or plan metadata, matching the reference behavior and preserving auditability.
- Credit payment validation remains strict for product id, user metadata, currency, amount, and tax validation.

## Testing

Add or update tests for:

- Billing mode helper behavior.
- Feature guard behavior for both modes.
- Dodo product selection in both modes.
- Checkout route mode validation and product lookup.
- Credit webhook rejection in subscription mode.
- Subscription webhook rejection in credit mode.
- Subscription status normalization.
- Subscription event recording and upsert payloads.
- Credit-only API routes returning `400` in subscription mode.
- Subscription-only API routes returning `400` in credit mode.
- Admin subscription recurring revenue calculation.

Run at minimum:

- `bun run --cwd apps/api test`.
- `bun run --cwd apps/api typecheck`.
- `bun run typecheck:packages` if contracts or DB package types change.
- `bun run db:check` after adding the Drizzle migration.

## Implementation Notes

- Prefer small, focused helper modules over introducing a large billing abstraction.
- Keep credit billing code paths unchanged except for guard calls and mode-aware product selection.
- Do not add backwards-compatibility behavior unless the existing Hono clients need it; if unclear during implementation, ask before keeping legacy checkout payload support.
- Use the reference repo as behavioral guidance, but adapt dependencies to the Hono bootstrap/dependency-injection style.
