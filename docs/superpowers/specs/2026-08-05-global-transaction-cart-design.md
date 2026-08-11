# Global Transaction Cart Design

## Goal

Replace the permanently visible transaction basket column with a familiar ecommerce cart in the signed-in global top bar.

## Visibility And Placement

The cart icon appears in the sticky backend top bar only when:

- The user is signed in.
- Transaction billing surfaces are enabled.

The icon remains visible when the cart is empty. A badge appears only when at least one unit is present, and its value is the sum of all item quantities rather than the number of distinct products.

## Cart Interaction

Clicking the icon opens an accessible right-side sheet. The sheet uses the full viewport width on small screens and approximately 28rem on desktop.

The sheet contains:

- Cart title and clear action.
- Empty-cart state.
- Product names and line totals.
- Quantity decrease/increase controls.
- Remove actions.
- Pre-tax subtotal and tax note.
- Checkout action.

The item list scrolls independently when necessary. The subtotal, tax note, and checkout action remain anchored at the bottom.

Adding or updating a product updates the basket and top-bar badge without opening the sheet. The sheet opens only through explicit user interaction with the cart icon.

## State Architecture

A transaction-cart provider wraps the signed-in backend layout. It owns:

- The React Query basket query and shared query key.
- Basket mutation state and handlers.
- Checkout mutation state.
- Sheet open/closed state.

The top bar consumes this provider for icon visibility, badge quantity, and sheet rendering. The transaction catalog consumes the same provider for basket quantities and add/update actions. This avoids duplicate basket mutation logic and guarantees consistent state across backend pages.

The provider enables its basket query only when transaction billing is active and a user ID is available. User changes reset drawer-local state and use user-scoped query keys so cached basket data cannot cross accounts.

## Catalog Layout

The transaction billing page removes the permanent basket column. The product catalog uses the full available content width. Orders and entitlements remain below the catalog.

## Errors And Pending State

Basket query failures leave the cart icon available and show retry feedback inside the sheet. The last successful basket remains visible during refetch failures.

Pending basket mutations disable conflicting quantity, remove, clear, and checkout controls. Checkout continues using the existing redirect behavior and provider-neutral client error handling.

## Accessibility

- The cart trigger has a localized accessible label.
- Badge changes are represented in the trigger label for screen readers.
- The sheet has a title and description.
- Quantity and remove controls retain product-specific labels.
- Focus is trapped in the open sheet and returns to the trigger when closed through the existing Radix Sheet primitive.

## Testing

Tests cover:

- Cart visibility by authentication and billing mode.
- Empty icon without a badge.
- Badge showing total quantity.
- Sheet open/close behavior and responsive sizing.
- Existing quantity, remove, clear, and checkout controls in the sheet.
- Basket error and pending states.
- Shared cache synchronization between catalog and top bar.
- No automatic sheet opening after product additions.
- User-switch isolation.
- Full-width catalog layout and removal of the permanent basket column.
