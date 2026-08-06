# AI Blueprint Resource Import Design

## Goal

Allow an administrator to create a certification, register its public study-guide URL as a resource, ingest a stable text snapshot, use AI to propose the exam category hierarchy and weights, preview the result, and write the approved categories into the database.

This is the first focused AI workflow. Question generation from learning resources remains a later slice.

## Core Decision

Use the existing `LearnResource` model as the canonical blueprint source.

The study guide is stored with:

- `sourceType = exam-blueprint` or `study-guide`;
- `contentMode = outline_blueprint`;
- its public HTTP(S) URL;
- extracted `rawContent`;
- ingestion status, timestamp, and error details.

The AI parser always analyzes the stored snapshot rather than fetching the live URL itself. This separates source retrieval from AI interpretation, makes retries deterministic, and preserves provenance.

The existing certification `blueprintSourceUrl` field remains temporarily for compatibility, but the new workflow uses the resource record as its source of truth.

## Scope

Included:

- public HTML and directly accessible PDF URLs;
- safe URL fetching and text extraction;
- persisted resource snapshots;
- asynchronous AI blueprint parse runs;
- structured category and weight proposals;
- preview, warnings, and diff against existing categories;
- admin edits to the proposal before import;
- safe merge and confirmed replace import modes;
- category provenance;
- existing Categories-tab editing after import.

Excluded:

- local file uploads;
- authenticated or paywalled sources;
- automatic discovery of deeper learning resources;
- AI question generation;
- automatic publishing;
- learner-facing resource lists.

## Data Model

### Learn resource

Continue using `certdrill_learn_resources` for the source URL and extracted content. Ingestion sets:

- `rawContent` to normalized extracted text;
- `status` to `pending`, `ingested`, or `failed`;
- `ingestedAt` after successful extraction;
- `ingestError` after failure.

Re-ingestion replaces the snapshot only after a complete successful fetch and extraction. A failed refresh leaves the previous successful `rawContent` and `ingestedAt` intact, sets the current ingestion status to `failed`, and records the refresh error. The UI may offer analysis of that explicitly identified stale snapshot, but never present it as newly fetched content.

### Blueprint parse run

Add a blueprint parse-run record containing:

- ID and certification ID;
- resource ID;
- status: `pending`, `running`, `completed`, or `failed`;
- AI provider and model;
- resource-content checksum;
- structured proposed category tree;
- confidence: `high`, `medium`, or `low`;
- warnings;
- error details;
- timestamps.

The content checksum proves which resource snapshot produced the proposal. Re-running analysis creates a new parse run rather than overwriting history.

### Category provenance

Imported categories retain the parse-run ID and source-resource ID that created or most recently updated them. Manual category edits remain allowed and update normal category timestamps without deleting provenance.

## Admin Workflow

1. The administrator creates a certification with basic metadata.
2. On the Blueprint tab, the administrator enters a public study-guide URL.
3. **Fetch study guide** creates or updates an outline blueprint resource and ingests its contents.
4. The UI shows the resource title, source type, content mode, ingestion status, snapshot timestamp, and any fetch error.
5. **Analyze blueprint** creates an asynchronous parse run against the stored `rawContent`.
6. The AI returns a strict structured proposal containing:
   - top-level domains;
   - optional child objectives;
   - category codes and names;
   - detected top-level weights;
   - confidence and warnings;
   - source excerpts or locations supporting each domain.
7. The UI shows the proposed tree and a diff against current categories.
8. The administrator may edit codes, names, hierarchy, ordering, and weights.
9. Parsing alone never changes categories.
10. **Apply categories** writes the approved proposal transactionally into `certdrill_exam_categories`.
11. Imported categories immediately appear in the existing Categories tab and remain fully editable.

## Import Modes

### Merge

Merge is the default. Categories are matched by normalized code within the certification:

- matching categories are updated from the approved proposal;
- new categories are inserted;
- existing categories absent from the proposal remain unchanged;
- manually created questions and references are preserved.

### Replace

Replace requires explicit confirmation. It may remove categories absent from the proposal only when existing referential-integrity rules allow removal. If questions or other protected records reference a category, the import is rejected before any change is written.

Both modes execute in one transaction. Any validation or persistence failure rolls back the entire import.

## Fetching and Extraction

The ingestion boundary must:

- accept only public HTTP(S) URLs;
- reject loopback, private, link-local, and internal network destinations;
- revalidate redirect targets;
- limit redirects, response bytes, extracted-text size, and request duration;
- accept supported HTML and PDF content types;
- normalize extracted text while retaining headings and list structure;
- identify a useful title when available;
- surface explicit errors rather than silently storing empty content.

Documents are untrusted data. Text that resembles instructions must not modify the parser's system task or output schema.

## AI Parsing

Use an AI-provider interface with an Azure AI Foundry implementation as the initial provider. The parser receives:

- certification code, name, and vendor;
- resource metadata;
- the stored normalized text;
- a strict structured-output schema.

The parser must not invent missing weights. If weights are absent or ambiguous, it returns `null` weights and a warning. Low-confidence parsing remains importable after admin review.

AI output is validated and normalized before it becomes a preview:

- category codes are non-empty and unique within the proposal;
- hierarchy contains no cycles;
- child categories reference proposed parents;
- weights are `null` or between 0 and 100;
- top-level totals are calculated and displayed;
- duplicate or malformed items become validation errors or explicit warnings.

## Error Handling

Fetching, extraction, AI parsing, preview validation, and category import expose separate statuses and errors.

- Fetch failure marks resource ingestion failed.
- A failed refresh may reuse the last successful snapshot only after the UI clearly identifies its timestamp and the administrator explicitly chooses to analyze it.
- AI failure marks only the parse run failed; the stored resource remains reusable.
- Invalid AI output is preserved for diagnostics but cannot be imported.
- Import validation errors are shown against the affected proposal rows.
- A failed import writes no category changes.
- Retrying analysis creates a new parse run using the current successful resource snapshot.

## API Boundaries

The workflow requires focused admin endpoints for:

- creating/updating the blueprint resource;
- ingesting or refreshing a resource;
- starting a blueprint parse run;
- reading parse-run status and proposal;
- validating an edited proposal;
- applying a proposal in merge or replace mode.

The ingestion service, AI parser, proposal validator/diff builder, and transactional importer remain separate units so each can be tested independently.

## Testing

Cover:

- public URL acceptance and private-network rejection;
- redirect target validation;
- HTML and PDF extraction;
- size, timeout, unsupported-content, and empty-content failures;
- preservation of a prior snapshot after failed refresh;
- prompt-injection-like document text remaining inert;
- malformed AI output rejection;
- category normalization, hierarchy validation, and weight calculations;
- missing-weight and low-confidence warnings;
- preview diff behavior;
- merge insertion/update/preservation behavior;
- replace protection for referenced categories;
- transactional rollback;
- parse-run and category provenance;
- admin workflow states and successful appearance in the Categories tab.

## Delivery Sequence

Implement this as incremental slices:

1. Resource ingestion and safe text extraction.
2. Blueprint parse-run persistence and AI provider abstraction.
3. Structured parsing, validation, and preview API.
4. Admin Blueprint-tab workflow.
5. Transactional category import and provenance.

Real resource-grounded question generation follows after this workflow is reliable.
