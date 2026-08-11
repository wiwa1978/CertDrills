# Flat Transaction Admin Tabs Design

## Goal

Remove the nested Billing navigation in transaction mode and promote every transaction dashboard section into the primary admin billing tab row.

## Transaction Navigation

Transaction mode uses one horizontally scrollable top-level tab row:

- Overview
- Orders
- Successful
- Refunds
- Products
- Success Rate
- Discounts
- Vouchers

The former parent Billing tab and nested transaction tab row are removed.

## URLs

One `section` query parameter controls all eight sections. Overview is canonical without a parameter. Existing `tab` links are normalized to their corresponding `section` value for backward compatibility.

Dashboard filters remain in the URL and survive section changes where relevant. Pagination resets appropriately when changing transaction sections.

## Rendering

The transaction dashboard header and filters render for the six transaction sections. Discounts and Vouchers render their existing section components without transaction dashboard filters.

Credits and subscription modes retain their existing navigation and layouts.

## Testing

Tests cover all eight active sections, URL generation and legacy normalization, absence of nested tabs, responsive overflow, dashboard section rendering, Discounts/Vouchers preservation, and unchanged credit/subscription behavior.
