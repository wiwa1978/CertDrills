# Provider-Neutral Billing Legacy Removal Plan

## Current State

- `0013_provider_neutral_billing_identifiers.sql` adds provider-neutral identifier columns and backfills them from the legacy Dodo columns.
- Runtime code writes both the provider-neutral columns and the legacy Dodo columns.
- Reads prefer provider-neutral columns and fall back to Dodo columns for existing data.

## Stability Gate

Before removing legacy columns, verify in each target database that:

- `credit_purchases.provider_customer_id` is populated for rows with `dodo_customer_id`.
- `user_subscriptions.provider_customer_id` is populated for rows with `dodo_customer_id`.
- `user_subscriptions.provider_subscription_id` is populated for every row.
- `subscription_events.provider_subscription_id` is populated for rows with `dodo_subscription_id`.
- `subscription_payments.provider_customer_id` is populated for rows with `dodo_customer_id`.
- `subscription_payments.provider_subscription_id` is populated for rows with `dodo_subscription_id`.
- `discounts.provider_discount_id` is populated for rows with `dodo_discount_id`.
- No deployed code reads from or writes to the legacy Dodo columns except provider-specific adapters/tests.

## Removal Phase

1. Remove public response aliases for legacy fields after confirming no frontend or API consumers need them.
2. Remove service input aliases for `dodoCustomerId`, `dodoSubscriptionId`, and `dodoDiscountId`.
3. Update Drizzle relations and queries to use only `provider_*` columns.
4. Add a destructive migration that drops these columns and their legacy indexes:
   - `credit_purchases.dodo_customer_id`
   - `user_subscriptions.dodo_customer_id`
   - `user_subscriptions.dodo_subscription_id`
   - `subscription_events.dodo_subscription_id`
   - `subscription_payments.dodo_customer_id`
   - `subscription_payments.dodo_subscription_id`
   - `discounts.dodo_discount_id`
5. Run full API functional tests and billing/admin/web typechecks before deploying the removal migration.

## Rollout Note

Do not combine the destructive removal with a provider switch. Remove the legacy columns only after provider-neutral writes have run successfully in production long enough to confirm backfill and new writes are stable.
