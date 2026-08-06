# Certification Card Tag Alignment Design

## Goal

Keep certification overview cards the same height and align their badge rows even when certification names occupy different numbers of lines.

## Design

The existing two-line clamp on the certification name remains in place. The description reserves the height of two text lines so a one-line name occupies the same vertical space as a two-line name.

Each card becomes a vertical flex container. Its content section grows to fill the available space and positions the badge row at the bottom. This keeps cards and badges aligned within the responsive grid without introducing a rigid pixel height.

## Scope

- Update only the certification overview card layout in `AdminCertificationOverviewTable`.
- Preserve locale-aware card navigation, hover and focus behavior, and existing badge content.
- Do not change certification names, truncation behavior, responsive grid columns, or detail-page actions.

## Testing

Extend the existing certification overview source-contract test to verify:

- the card uses a full-height vertical flex layout;
- the description reserves two lines while retaining the two-line clamp;
- the content area expands so the badge row remains bottom-aligned.
