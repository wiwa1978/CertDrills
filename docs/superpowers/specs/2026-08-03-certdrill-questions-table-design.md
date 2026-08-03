# CertDrill questions table redesign

## Goal

Make the Questions tab at `/admin/certdrill/<id>` a focused, full-width table
for finding and managing questions without a separate filter submission step or
standalone publishing section.

## Layout and interaction

The tab presents a compact toolbar directly above the questions data table.
The toolbar contains:

- Text search
- Category, status, difficulty, and sort selects
- A Clear filters control

Changing a select updates results immediately. Text search updates results after
a 250 ms debounce. There is no Apply filters button.

The table stays server-rendered and URL-backed. Its filter state remains in the
query string so the view is shareable and survives refreshes.

Each row exposes an Actions menu:

- Edit is always available.
- Publish is available only for draft questions.
- Archive is available for questions that are not already archived.

The standalone Publish question section is removed. Publishing is instead a
contextual action on the relevant draft row.

## Architecture and data flow

A client-side filter bar updates the existing filter query parameters. It owns
only interaction timing and query-string replacement:

- Select changes replace the matching parameter immediately.
- Text input replaces or removes the search parameter after 250 ms.
- Clearing filters removes the active filter parameters.

The page's existing server-side path remains responsible for normalizing filter
values, selecting the result set, and rendering the table. The existing server
actions remain the authority for publish and archive validation.

Search matches normalized content across question stem, answer-option text,
category name/code/ID, status, and difficulty.

## Errors and safeguards

Malformed query parameters are normalized using the existing rules before
rendering or reuse in the URL. Publish and archive availability in the menu is a
UI convenience only; server actions continue to enforce valid state changes.

## Test coverage

Tests cover:

- Immediate select-filter URL updates.
- The 250 ms text-search debounce.
- Search matches for answer-option text and the other filter dimensions.
- Row action visibility by question status.
- Removal of the standalone Publish question section.
