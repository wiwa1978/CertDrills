# Clickable Certification Cards Design

## Goal

Simplify the CertDrill certification overview so each certification card is
the navigation control for its detail page.

## Behavior

- Remove the `Open details` button from each certification card.
- Remove the `Archive certification` button and archive form from the overview.
- Keep archive management on the certification detail page.
- Make the complete card link to the existing certification detail route.
- Preserve the current logo, certification name, vendor, visibility, and
  question-count content.

## Interaction and Accessibility

Wrap each card in a normal Next.js link rather than adding a JavaScript click
handler. This preserves keyboard navigation, browser link behavior, and
accessible link semantics.

Add visible hover and keyboard-focus styling to communicate that the card is
interactive. The linked card contains no nested buttons, forms, or other
interactive controls.

## Scope

Modify only the certification overview card markup and its source-contract
tests. Certification detail actions, other overview cards, routing helpers,
and archive server actions remain unchanged.

## Validation

Tests verify that:

- Overview cards link to their existing detail route.
- `Open details` is absent from the overview card implementation.
- `Archive certification` and its form are absent from the overview card
  implementation.
- Existing certification overview content remains rendered.
