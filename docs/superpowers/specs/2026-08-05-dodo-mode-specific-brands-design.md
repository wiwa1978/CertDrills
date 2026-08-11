# Dodo Mode-Specific Brands Design

## Goal

Make credits, subscriptions, and transactions independently switchable and fully testable in Dodo test mode when each billing mode uses a different Dodo brand.

## Configuration

Replace the transaction-only brand setting with three explicit optional settings:

- `DODO_CREDITS_BRAND_ID`
- `DODO_SUBSCRIPTIONS_BRAND_ID`
- `DODO_TRANSACTIONS_BRAND_ID`

The API selects the brand from the checkout request's billing mode. Production deployment validates only the brand required by `applicationConfig.billing.mode`; inactive modes do not block deployment.

## Checkout Architecture

All Dodo billing modes use the Checkout Sessions API rather than mixing API-created transaction sessions with hosted `/buy/{productId}` links.

Credit and subscription sessions preserve the existing checkout behavior:

- Authenticated user and checkout-intent metadata.
- Credit package or subscription plan metadata.
- Customer email and billing-address prefill.
- Discount-code behavior.
- Success and cancellation return URLs.
- Subscription behavior defined by the recurring Dodo product.

Transaction checkout continues to support a multi-item cart and immutable local order pricing.

Provider-neutral interfaces remain mode-based. Dodo-specific brand selection stays inside the Dodo provider and bootstrap configuration.

## Dodo Test Products

Create products through the Dodo test API under the corresponding brands.

Credits brand `bus_0NjwOIqJas23wqi7I8PKY`:

- Starter: EUR 5 one-time, tax exclusive.
- Advanced: EUR 10 one-time, tax exclusive.
- Pro: EUR 25 one-time, tax exclusive.
- Max: EUR 50 one-time, tax exclusive.

Subscriptions brand `brnd_0NkektvcLn6O8e4Xusuvz`:

- Bronze: EUR 10 monthly, tax exclusive.
- Silver: EUR 25 monthly, tax exclusive.
- Gold: EUR 50 monthly, tax exclusive.

Existing transaction products remain under `brnd_0NkekyIEbYi9v452YxAZC`.

The created test product IDs replace placeholder or non-test IDs in the billing contracts.

## Validation And Errors

Startup/deployment validation requires a non-empty brand ID only for the active billing mode when Dodo is the active provider. Checkout fails closed when the selected mode has no configured brand or Dodo rejects the credential, brand, or product.

Provider details remain in structured server logs. Client responses remain provider-neutral.

## Testing

Tests cover:

- Brand selection for credits, subscriptions, and transactions.
- Checkout-session payloads and preserved metadata for all modes.
- Missing active-mode brand validation without requiring inactive brands.
- Real non-placeholder Dodo product IDs.
- Product/brand consistency against Dodo test mode through a controlled integration check.
- Production workflow propagation of all three settings and active-mode validation.
