# Admin Subscription Billing Dashboard Design

## Goal

When `applicationConfig.billing.mode` is `subscriptions`, `/admin/billing` should show subscription-oriented admin billing data instead of credit-oriented stats, charts, transactions, and purchases.

## Scope

Implement the minimal subscription-mode dashboard by adapting the working reference implementation in `/home/wim/Code/Repositories/Personal/Boilerplate-SingleTenant`:

- Detect the active billing mode from the existing application config endpoint.
- Keep the existing credit dashboard unchanged when the mode is `credits`.
- Render subscription stats when the mode is `subscriptions`.
- Render a searchable, paginated subscription list when the mode is `subscriptions`.
- Render a simple plan distribution card when local plan counts are available.
- Render recent subscription events when local event rows are available.
- Do not add subscription revenue charts in this pass.
- Do not call Dodo live APIs for dashboard metrics.

## Existing Data And APIs

The API already stores subscription state locally in `user_subscriptions`, `subscription_events`, and `subscription_payments`. It already exposes subscription admin endpoints:

- `GET /admin/billing/subscription-stats`
- `GET /admin/billing/subscriptions`

`subscription-stats` already provides total subscriptions, active, trialing, past due, canceled, MRR, and ARR. The dashboard should use these local values.

The reference app also includes plan distribution and subscription event sections. The Hono API should add local-data admin endpoints for those if they do not already exist:

- `GET /admin/billing/subscription-plan-distribution`
- `GET /admin/billing/subscription-events`

## UI Design

The subscription dashboard should use the existing admin billing page shell and `StatCard` pattern.

Stats cards:

- Monthly recurring revenue
- Annual recurring revenue
- Active subscriptions
- Attention needed, based on past-due and canceled counts

Below the stats, adapt the reference layout:

- Plan distribution card with one row per plan and count.
- Subscriptions table with user, plan, status, period end, cancel-at-period-end, and Dodo subscription id.
- Subscription events table with event type, status, Dodo subscription id, and received timestamp.

Search/pagination should be kept for the subscription list where the existing Hono endpoint already supports it. Plan distribution and events can be server-rendered with a fixed limit/count for this pass.

## Data Flow

`AdminBillingPage` loads application config first. Then it branches:

- Credit mode: load the current credit stats, revenue chart data, transactions, and purchases.
- Subscription mode: load subscription stats, plan distribution, the first page of subscriptions, and recent subscription events.

This prevents credit-only endpoints from being called during subscription mode server rendering.

## Error Handling

The API should remain the source of truth for mode guards. The admin UI should avoid calling disabled credit endpoints when the config says subscriptions.

If subscription endpoints return the expected disabled-mode API error in credit mode, service-level fallbacks may return empty subscription data. Unexpected API errors should still throw.

## Testing

Add focused tests for:

- Admin API helpers call the correct subscription endpoints and encode search email.
- Admin service helpers return subscription stats/list data.
- API route tests cover plan distribution and subscription events from local rows if new endpoints are added.
- Disabled subscription-mode errors can fall back to empty subscription data if needed.
- The admin billing page branches by billing mode and does not call credit dashboard data loaders in subscription mode.

## Follow-Up

A revenue-focused subscription dashboard can be added later by grouping local `subscription_payments` rows by time range. This should be a separate pass because it requires API contract additions, server aggregation, chart UI, and tests.
