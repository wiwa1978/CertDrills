# Centralized admin questions index

## Goal

Add `/admin/questions` as a centralized admin view for finding and managing
questions across every certification and category.

The route displays a dense, paginated table with certification, category,
question, status, difficulty, and actions. Clicking a question row expands it
in place to show all answer options, clearly identify every correct option, and
show each option's explanation when present.

The route is available through a dedicated Questions item in the admin sidebar.
It does not add a create-question control; creation remains in the existing
certification-specific workflow.

## Data architecture

Add a dedicated authenticated admin API endpoint:

`GET /api/admin/certdrill/questions`

The endpoint returns flattened question-index rows containing:

- Certification ID, code, and name
- Category ID, code, and name
- Question ID, stem, status, and difficulty
- Answer options with text, correctness, explanation, and sort order

The response also contains pagination metadata. The endpoint accepts
URL-compatible parameters for:

- Text search
- Certification ID
- Category ID
- Status
- Difficulty
- Stem sort direction
- Page

The page size is fixed at 50 rows. The API performs filtering, stable sorting,
and pagination so the admin application does not load every question or issue
one request per certification.

## Page and components

The `/admin/questions` page is server-rendered and treats the URL query string
as the source of truth. It requests the current page of question rows and the
filter option data needed for certifications and categories.

A focused client table component owns only interactive behavior that cannot be
server-rendered:

- Expanding and collapsing a clicked row
- Preventing editor links and action-menu clicks from toggling the row
- Rendering the existing Edit, Publish, and Archive actions

The existing question-management patterns should be reused or generalized
where practical:

- Question status and difficulty badges
- Question editor links
- Edit, Publish, and Archive action menu behavior
- URL replacement and debounced search behavior from the current question
  filter bar
- Existing server actions and their status-dependent visibility rules

The centralized filter toolbar contains:

- Text search
- Certification filter
- Category filter
- Status filter
- Difficulty filter
- Clear filters

The table contains:

- Certification
- Category
- Question
- Status
- Difficulty
- Actions

The question header toggles stem sorting between ascending and descending. The
default ordering is certification code, category code, stem, then question ID.

## Interaction and URL behavior

Search matches normalized content across:

- Question ID and stem
- Answer text and explanations
- Certification code and name
- Category code and name
- Status
- Difficulty

Changing any filter or sort value resets the page to 1. Pagination links
preserve all active filters and sorting.

Selecting a certification limits the available category choices to that
certification. Changing the certification removes the category parameter when
the selected category does not belong to the new certification.

Clicking a question row expands an inline detail section immediately beneath
that row. Answer options use their stored sort order. Correct options receive a
clear visual marker and distinct styling. An option explanation appears below
its answer when one is present.

The expanded detail does not include citations or media metadata.

## Actions and navigation

Each row preserves the existing status-dependent actions:

- Edit is always available and opens the existing certification-specific
  question editor.
- Publish is available only for draft questions.
- Archive is available for questions that are not archived.

Publish and Archive continue to use the existing server actions and backend
validation. Action controls stop row-click propagation so opening or submitting
an action does not expand or collapse the row.

The admin sidebar adds a localized Questions item linking to `/admin/questions`.

## Validation and error handling

The API validates and normalizes all query parameters:

- Unsupported status, difficulty, or sort values are ignored or replaced with
  their documented defaults.
- Missing, non-numeric, non-positive, and out-of-range pages normalize to a
  valid page.
- A category filter that does not belong to the selected certification is
  ignored.

No-result searches render a focused empty state rather than an empty table.
API and server-action failures continue through the application's existing
error-reporting behavior. The UI does not use silent fallbacks or treat failed
mutations as successful.

## Test coverage

API tests cover:

- Authenticated access
- Flattened certification, category, question, and option output
- Search across every documented field
- Certification, category, status, and difficulty filtering
- Stable default and stem-direction sorting
- The fixed 50-row page size
- Invalid, non-positive, and out-of-range page normalization
- Rejection or normalization of incompatible certification/category filters

Admin tests cover:

- The localized sidebar link
- URL-backed filter updates and debounced search
- Category choices and incompatible-category reset after certification changes
- Filter and sort changes resetting pagination
- Pagination links preserving active state
- Inline row expansion and collapse
- Correct-answer styling and option explanations
- Link and action-menu click isolation
- Existing Edit, Publish, and Archive visibility rules
- Empty-result rendering
