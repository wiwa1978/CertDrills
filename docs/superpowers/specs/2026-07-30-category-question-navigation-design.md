# Category-to-question navigation

## Goal

Selecting a category code or name from the CertDrill admin Categories tab opens the
Questions tab filtered to that category.

## Scope

Only category-row links will specify the destination tab. Existing tab clicks remain
client-side and do not become URL-synchronized.

## Design

The certification detail URL accepts an optional `tab` query parameter. The route
normalizes it to a string and passes it to `CertDrillAdminPage`. That page accepts
only the defined admin tab values when choosing its initial tab; invalid or absent
values retain the current inferred default.

The category table generates links with both:

- `questionCategoryId=<category ID>` to filter the question list.
- `tab=questions` to select the Questions tab after the server render.

This keeps the filtered Questions view addressable while preserving all existing
category, question, form, resource, generation, and feedback behavior.

## Error handling

Unknown `tab` values are ignored and the existing default-tab logic is used. The
category filter remains independently normalized by the existing code.

## Tests

Add a focused regression assertion that category links carry both the question
category filter and the Questions tab parameter, and that the page recognizes the
tab parameter. Existing admin tests continue to cover query normalization.
