# Weighted Blueprint Headings Design

## Goal

Extract only certification blueprint headings whose own title line contains an adjacent percentage or percentage range, while preserving detailed subsections only as supporting evidence.

## Category Selection

The AI proposal contains only top-level weighted domains such as:

```text
Author and manage workflows (20–25%)
```

Detailed headings beneath a weighted domain are not categories. They may be included in the domain's evidence when they help explain its scope.

Every proposed category must:

- have `parentCode = null`;
- include evidence containing the weighted title and percentage;
- define either an exact percentage or a valid percentage range.

Headings without an adjacent percentage are excluded from the category proposal.

## Weight Representation

Each category contains:

```ts
weightPct: number | null;
weightMinPct: number | null;
weightMaxPct: number | null;
```

Exact percentages use equal values:

```json
{
  "weightPct": 20,
  "weightMinPct": 20,
  "weightMaxPct": 20
}
```

Ranges preserve both bounds:

```json
{
  "weightPct": null,
  "weightMinPct": 20,
  "weightMaxPct": 25
}
```

The validator rejects:

- missing exact and range weights;
- values outside 0–100;
- incomplete ranges;
- ranges where minimum exceeds maximum;
- an exact percentage that differs from equal minimum and maximum values;
- child categories;
- categories without evidence containing a percentage associated with the category title.

The validator no longer generates missing-weight warnings because missing weights are invalid for this workflow.

## Prompt

The system prompt explicitly instructs the model to:

- select only headings where the heading text itself is immediately associated with a percentage or percentage range;
- preserve ranges without choosing a midpoint;
- return every selected heading as a top-level category;
- use detailed subsections only as evidence;
- exclude unweighted headings from `categories`.

## Compatibility

New parse runs use the extended schema. Existing persisted runs may contain only `weightPct`.

The admin UI accepts both shapes:

- legacy exact values display from `weightPct`;
- new exact values display from equal minimum and maximum bounds;
- ranges display as `20–25%`;
- malformed or absent values display as `Not provided`.

Existing parse-run records are not migrated or rewritten.

## User Interface

The analysis dialog's Weight column displays:

- `20%` for exact percentages;
- `20–25%` for ranges;
- `Not provided` only for legacy or malformed persisted data.

Category ordering and evidence rendering remain unchanged.

## Testing

Tests cover:

- valid exact weights;
- valid percentage ranges;
- rejected missing, partial, reversed, and out-of-range ranges;
- rejected child categories;
- rejected categories whose evidence lacks the category title and percentage;
- prompt instructions preventing subsection categories and midpoint invention;
- structured-output JSON schema containing the new fields;
- UI rendering of exact, ranged, and legacy weights;
- compatibility with existing stored proposals.
