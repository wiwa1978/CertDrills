# Transaction Orders Table Design

## Objective

Simplify the transaction finance dashboard by removing the global filter panel and making the Orders section a compact, operationally useful table with section-specific filtering and expandable details.

## Scope

- Remove the filter card currently displayed above every transaction finance section, including Overview.
- Add section-specific filters to Orders only.
- Make the shared order table compact and row-expandable in Orders, Successful, and local Refunds.
- Keep the existing transaction dashboard API, URL query parameters, server-side filtering, and pagination model.
- Preserve English, Dutch, and French localization.

## Overview

Overview displays its existing metric cards, financial summaries, and charts directly beneath the transaction navigation and warning messages. It does not display date range, grouping, currency, status, product, or search controls.

The dashboard data may continue to use the existing default 30-day range when no URL filters are present. This change removes the controls from Overview; it does not change the API's default reporting period.

## Orders Filters

Orders displays a compact filter bar inside the Orders card and directly above the table. It contains:

- Status: all statuses plus pending payment, paid, failed, cancelled, refunded, and partially refunded.
- Search: the existing server-side order/customer/payment search.
- Date range: 7 days, 30 days, 90 days, 12 months, or custom.
- Custom start and end date fields, visible only when Custom is selected.
- Apply and Clear actions.

Apply writes the selected values to the existing URL query parameters and resets `page` to 1. Clear restores the 30-day default, removes status and search parameters, removes custom dates, and resets `page` to 1. Filters are submitted together rather than applied immediately.

The Orders filter bar does not expose grouping, currency, or product filters. Successful, Refunds, Products, Success Rate, Discounts, and Vouchers do not display this filter bar.

Status, search, range, and custom date parameters are scoped to Orders navigation. Leaving Orders clears these parameters so another section cannot be invisibly filtered by controls it does not display. Returning to Orders therefore starts with the default 30-day range unless the destination URL explicitly contains Orders filters.

## Compact Order Table

The primary row uses the approved Customer First layout:

1. Customer: display name and email address.
2. Order: truncate the order ID visually with CSS while retaining the complete rendered value for copying and exposing it through accessible text and a `title` tooltip.
3. Total: formatted total amount and currency.
4. Status: localized status badge.
5. Created: localized date and time.
6. Expand indicator: communicates the current collapsed or expanded state.

Subtotal, tax, payment ID, and line items move out of the primary row. This removes the existing wide nine-column layout and reduces horizontal scrolling.

## Row Expansion

Clicking a primary row toggles a full-width detail row immediately beneath it. Keyboard users can toggle the row with Enter or Space through an explicit accessible control. The row exposes `aria-expanded` and associates the control with the detail region.

Only one order can be expanded at a time within a table. Opening another order closes the previously expanded order. Clicking the open order closes it.

The expanded panel includes:

- Subtotal, tax, and total.
- Payment ID and payment provider.
- Checkout reference ID.
- User ID.
- Created, paid, failed, and fulfilled timestamps.
- All line items with item ID, product key, name, description, quantity, unit price, item total, currency, and provider product ID.

Missing nullable values use the existing localized Not available copy. IDs remain copyable as rendered text and use monospace styling.

## Shared Usage

Orders, Successful, and local Refunds continue to use one shared order table implementation so their columns, expansion behavior, formatting, and accessibility remain consistent. Only Orders renders the section-specific filter bar.

Changing section or page naturally resets local expansion state because the rendered table changes. Expansion is not encoded in the URL and does not persist across navigation.

## Data Flow

1. The server parses the existing transaction dashboard query parameters.
2. The API returns filtered Orders data and pagination metadata.
3. The Orders filter bar initializes from `dashboard.filters`.
4. Apply or Clear navigates to a URL built by the dashboard URL helper.
5. The server renders the newly filtered page.
6. Row expansion uses local client state and requires no additional request.
7. Navigating away from Orders removes its filter parameters before rendering the destination section.

## Error And Empty States

- Existing provider and analytics warnings remain above the active section.
- An empty filtered Orders result uses the existing localized empty state.
- Existing pagination is retained and operates on the filtered server-side result set.
- Filter submission uses the existing transition pending state to prevent duplicate navigation.

## Testing

Automated coverage will verify:

- Overview and non-Orders sections do not render the former global filter card.
- Orders renders Status, Search, Date range, Apply, and Clear controls but omits grouping, currency, and product controls.
- Applying and clearing filters produce the correct URL updates and reset pagination.
- Navigating from Orders to another section removes Orders-only filter parameters.
- The compact table renders only Customer, Order, Total, Status, Created, and expansion columns.
- Clicking or activating a row exposes all required financial, provider, timestamp, and item details.
- Opening one row closes the previously open row.
- Successful and local Refunds reuse the compact expandable table without Orders filters.
- All supported locales retain matching message keys and ICU arguments.
- Type checking and the relevant admin test suite pass.
