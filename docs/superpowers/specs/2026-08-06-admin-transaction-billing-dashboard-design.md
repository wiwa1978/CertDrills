# Admin Transaction Billing Dashboard Design

## Goal

Add a useful first transaction-mode overview to `/admin/billing` without importing subscription-only concepts such as MRR or churn.

## Scope

The dashboard defaults to the last 30 days and supports preset/custom date ranges, time grouping, currency, status, product, free-text search, and pagination.

It contains six tabs:

- **Overview:** gross revenue, pre-tax revenue, tax, successful orders, pending/failed attempts, conversion rate, refunded amount, revenue trend, and attempt trend.
- **Orders:** all local transaction order records, including pending, failed, and cancelled attempts, with user, products, quantities, totals, payment ID, status, and timestamps.
- **Successful:** paid, partially refunded, and refunded orders.
- **Refunds:** local partially/refunded orders plus provider refund rows. Read-only.
- **Products:** units sold, successful revenue, and order count by product, enriched with provider product metadata when available.
- **Success Rate:** successful versus failed/pending attempts over time.

## Data Architecture

A dedicated transaction dashboard service queries local transaction orders, items, and users. Provider finance APIs optionally enrich payments, refunds, and products. Provider failures produce warning banners while local data continues rendering.

The API endpoint is `GET /admin/billing/transaction-dashboard`. It is available only when transaction billing is enabled and remains separate from the existing credit-ledger `/admin/billing/transactions` endpoint.

Admin data includes every status. Customer history filtering remains unchanged.

## Error Handling

Invalid filters return validation errors. Local database failures use the existing API error handler. Missing provider capabilities or provider errors become safe dashboard warnings rather than failing the whole response.

## Out Of Scope

- Creating refunds.
- Accounting ledger and payouts.
- Disputes and reconciliation workflows.
- CSV exports.
- Live updates.

## Testing

Tests cover filter normalization, date boundaries, all statuses, aggregation math, currency handling, product summaries, pagination/search, provider warning degradation, admin authorization/mode guards, response contracts, page routing, responsive tables/cards, and EN/NL/FR message parity.
