# Customer Purchase History Visibility Design

## Goal

Show customers only completed purchases and refund outcomes while retaining every payment attempt for administrators, webhooks, reconciliation, and auditing.

## Customer Visibility

Customer-facing histories include:

- Credits: `completed`, `refunded`.
- Subscriptions: `completed`, `refunded`.
- Transactions: `paid`, `partially_refunded`, `refunded`.

Customer-facing histories exclude:

- Credits and subscriptions: `pending`, `failed`.
- Transactions: `pending_payment`, `failed`, `cancelled`.

Refunded records remain visible because they represent purchases that completed and were later reversed.

## Query Boundary

Apply status filtering in billing services at the database query boundary rather than in the web UI. This keeps web, mobile, and future clients consistent and avoids transferring internal checkout attempts.

Transaction `getOrder(userId, orderId)` applies the same visibility condition as `listOrders(userId)`. Hidden attempts return `null`, preserving the existing route-level 404 behavior.

Credits and subscriptions have no equivalent customer payment-detail endpoint. Their invoice endpoints already reject non-completed payments and remain unchanged.

## Internal And Admin Behavior

Persistence remains unchanged. Pre-checkout transaction order rows continue to bind immutable prices, checkout intents, and webhook metadata.

Admin credit purchase, subscription payment, transaction/order, finance, reconciliation, and webhook queries remain unfiltered so operational users retain complete payment-attempt history.

## Testing

Tests cover every customer-visible and hidden status for all three modes, transaction list/detail consistency, route-level 404 behavior for hidden transaction attempts, refunded visibility, limits/order preservation, and unchanged admin query behavior.
