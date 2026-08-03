# CertDrill question table sorting and pagination

## Goal

Make the Questions table easier to scan by moving stem sorting from the filter
toolbar to the Stem column header and showing 50 filtered questions per page.

## Sorting

The filter toolbar no longer includes a Sort by control. The Stem table header
is a button with an arrow that reflects the current direction:

- The default is ascending (A-Z).
- Clicking the header toggles between ascending and descending (Z-A).
- Sorting is represented by the existing `questionSort` URL parameter.
- Clicking the Stem header removes `questionPage` so the sorted result starts
  on page 1.

No other table columns gain sortable controls.

## Pagination

After existing filtering and stem sorting, the table displays 50 questions per
page. Pagination state uses a `questionPage` URL parameter:

- Missing, invalid, or non-positive values normalize to page 1.
- Previous and Next links preserve the active filters and sort direction.
- Filter changes, clearing filters, and a Stem-sort change remove
  `questionPage`, returning to page 1.
- A requested page greater than the available range renders the final page.

The pagination controls appear below the table and indicate the current page
and total page count. They are disabled at the respective boundaries.

## Data flow and safeguards

The existing server-rendered page remains the authority for filter
normalization, sort order, pagination normalization, and the 50-item slice.
The client filter toolbar updates URL state only. The Stem header uses a
URL-backed link or button interaction to switch the existing sort parameter.

The page must preserve all current race protections for debounced text search.
When filters, sort, or pagination state changes, active unrelated query
parameters remain intact.

## Test coverage

Cover removal of the toolbar Sort by control, the sortable Stem header and
direction indicator, 50-item page slicing, invalid and out-of-range pages,
pagination URL links, and resetting the page when filters or stem sorting
changes.
