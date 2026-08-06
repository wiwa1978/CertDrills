# CertDrill Question Import Design

## Purpose

Add a production-ready question import workflow for AI-generated CertDrill
questions. An administrator can upload or paste a canonical JSON document,
validate and review its contents, resolve duplicate warnings, and atomically
import selected questions into one certification.

This project implements Import only. Export remains a separate future feature.

## Scope

This project covers:

- An **Import questions** entry point on a certification's Questions tab.
- JSON file upload and pasted JSON input.
- A strict, versioned canonical JSON format.
- Server-authoritative validation and preview.
- Category resolution by category code.
- Existing-question and within-batch Stem duplicate detection.
- Row selection and explicit duplicate overrides.
- Atomic insertion of up to 500 selected questions and their answers.
- Forced Draft status and AI authorship for every imported question.
- Success feedback and return to the certification Questions tab.

It does not add:

- Export.
- CSV, YAML, or arbitrary field mapping.
- Persistent import jobs or resumable batches.
- Database migrations.
- Automatic publishing.
- Question or answer media.
- Source-resource or generation-job relationships.

## Entry Point and Route

The certification Questions card at:

```text
/admin/certdrill/<certificationId>
```

gets an **Import questions** button in its header. The button opens:

```text
/admin/certdrill/<certificationId>/questions/import
```

The route is certification-scoped. A batch may contain multiple category codes,
but every category must belong to the certification in the route.

The global `/admin/questions` page does not receive an import button in this
project.

## Admin Workflow

### Input

The import page provides two input tabs:

1. **Upload JSON**
2. **Paste JSON**

The page also provides a downloadable canonical example document.

Only one input source is active at a time. Selecting a file populates the same
JSON text state used by pasted input, so both paths enter the same validation
pipeline.

The page rejects:

- Empty input.
- Invalid JSON.
- Files larger than 5 MB.
- Documents that fail top-level schema validation.

No question is saved during input or preview.

### Validate and Preview

The administrator selects **Validate and preview**. The page submits the parsed
document to the server preview endpoint.

The preview displays:

- Total submitted rows.
- Valid rows.
- Invalid rows.
- Existing-question duplicates.
- Within-batch duplicates.
- Selected import count.

The preview table contains:

- Selection checkbox.
- Source row number.
- Category code.
- Stem.
- Difficulty.
- Answer count.
- Validation status.
- Duplicate status.
- Row-level validation messages.

Valid non-duplicate rows are selected by default.

Invalid rows cannot be selected.

Duplicate rows are valid warnings, but are excluded by default. They can be
included through:

- A per-row selection/override control.
- An **Include duplicates** batch toggle that selects all otherwise valid
  duplicate rows.

Changing the duplicate toggle or row selection does not rerun preview
validation. Confirm-time validation remains authoritative.

### Confirm

The **Import selected questions** action is disabled when no importable row is
selected.

Confirm submits:

- The same canonical document.
- Selected source indexes.
- Source indexes explicitly allowed to import despite duplicate warnings.

The server revalidates the complete document and current database state.

If validation or duplicate state changed after preview:

- Nothing is inserted.
- The endpoint returns refreshed preview results.
- The page displays a batch-level conflict message.
- The administrator reviews and confirms again.

If validation still matches, all selected questions and answers are inserted in
one transaction.

### Success

After success, the administrator returns to the certification Questions tab.
The page displays the number of imported questions.

Imported rows appear as:

- Status: Draft.
- Created by: AI.

## Canonical JSON Format

The only accepted document shape is:

```json
{
  "version": 1,
  "questions": [
    {
      "categoryCode": "SEC-01",
      "stem": "What does the security control provide?",
      "difficulty": "medium",
      "answers": [
        {
          "text": "The first answer",
          "isCorrect": true,
          "explanation": "Why this answer is correct",
          "citationUrls": [
            "https://example.com/source"
          ]
        },
        {
          "text": "The second answer",
          "isCorrect": false,
          "explanation": "Why this answer is incorrect",
          "citationUrls": []
        }
      ]
    }
  ]
}
```

### Document Rules

- `version` is required and must equal `1`.
- `questions` is required.
- The document contains between 1 and 500 questions.
- Unknown top-level document properties are document errors.
- Unknown question and answer properties are row errors.
- The request body must not exceed 5 MB, plus a 64 KiB envelope allowance that
  the shared transport cap adds for the surrounding request fields. The global
  request guardrails and the admin server action body limit are aligned with
  that transport cap.

### Question Rules

- `categoryCode` is required and non-empty after trimming.
- Category codes are matched case-insensitively after trimming.
- The matching category must exist in the selected certification.
- If legacy data contains more than one category differing only by code case,
  the category code is ambiguous and the row is invalid.
- Archived categories are invalid.
- `stem` is required and non-empty after trimming.
- `difficulty` is optional.
- Difficulty is one of `easy`, `medium`, or `hard`.
- Missing difficulty defaults to `medium`.
- `answers` contains between 2 and 10 items.
- Exactly one answer has `isCorrect: true`.

### Answer Rules

- `text` is required and non-empty after trimming.
- `isCorrect` is required and boolean.
- `explanation` is optional and defaults to an empty string.
- `citationUrls` is optional and defaults to an empty array.
- Every citation is a valid URL using `http`, `https`, or `mailto`.
- Unknown answer properties are rejected.

Explanations and citations remain optional because imported questions are
Draft. The importer is stricter than manual Draft editing only in requiring
exactly one correct answer, because the source is expected to be an AI-generated
question-and-answer package.

### Rejected Import-Controlled Fields

The format does not accept:

- Question or answer IDs.
- Certification IDs.
- Category IDs.
- Status.
- `createdBy`.
- Generation-job IDs.
- Source-resource IDs.
- Question or answer media.
- Sort order.

The server assigns all persistence identifiers and order.

## Server API

Two authenticated admin endpoints are added under the existing CertDrill admin
router.

### Preview

```text
POST /api/admin/certdrill/questions/import/preview
```

Request:

```ts
type QuestionImportPreviewRequest = {
  certificationId: string;
  document: QuestionImportDocument;
};
```

Response:

```ts
type QuestionImportPreviewResult = {
  documentVersion: 1;
  documentHash: string;
  totals: {
    submitted: number;
    valid: number;
    invalid: number;
    duplicateExisting: number;
    duplicateBatch: number;
    selectedByDefault: number;
  };
  rows: QuestionImportPreviewRow[];
};

type QuestionImportPreviewRow = {
  sourceIndex: number;
  categoryCode: string;
  categoryId?: string;
  stem: string;
  difficulty: "easy" | "medium" | "hard";
  answerCount: number;
  valid: boolean;
  duplicate: {
    existingQuestionIds: string[];
    earlierSourceIndexes: number[];
  };
  selectedByDefault: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
};
```

`documentHash` is a deterministic hash of the normalized canonical document. It
detects accidental client mismatch between the displayed preview and confirm
request. It is not an authorization token.

### Confirm

```text
POST /api/admin/certdrill/questions/import
```

Request:

```ts
type QuestionImportRequest = {
  certificationId: string;
  document: QuestionImportDocument;
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
};
```

Success response:

```ts
type QuestionImportResult = {
  importedCount: number;
  questionIds: string[];
};
```

Conflict response uses a typed API error containing a fresh
`QuestionImportPreviewResult`.

The confirm endpoint rejects:

- A document hash mismatch.
- Unknown or duplicate source indexes.
- Selection of an invalid row.
- Selection of a duplicate row without an explicit duplicate override.
- An empty selected set.
- More than 500 selected rows.

## Validation Architecture

### Shared Schema

A focused import schema module owns:

- A strict top-level envelope schema for `version` and `questions`.
- Strict per-question and per-answer schemas.
- Normalized TypeScript types.
- The 5 MB document, transport envelope, and 500-question constants.
- Document hashing.

It reuses the existing safe citation URL rule and the two-to-ten answer limit.

The top-level transport schema accepts each `questions` item as unknown long
enough to preserve a preview row for malformed questions. Each item is then
parsed independently with the strict question schema. This keeps invalid rows
visible without weakening the canonical format.

### Preview Service

The preview service:

1. Parses the strict top-level envelope.
2. Parses every question independently and records row-level schema errors.
3. Normalizes category codes, Stems, difficulty, answer text, explanations, and
   citations.
4. Loads all categories for the selected certification in one query so archived
   and ambiguous codes can be diagnosed.
5. Resolves category codes case-insensitively.
6. Loads existing question IDs and Stems for the selected certification in one
   query.
7. Detects existing and within-batch duplicates.
8. Builds row errors and default selection.
9. Returns a deterministic document hash and preview result.

Invalid rows remain in the response so the administrator can correct the source
document.

### Duplicate Normalization

Stem duplicate normalization:

1. Trims leading and trailing whitespace.
2. Replaces every run of whitespace with one ASCII space.
3. Converts to lowercase.

Punctuation and Markdown are not removed.

Duplicate checks are certification-wide, not category-specific.

For within-batch duplicates:

- The first occurrence is not marked as a batch duplicate solely because of
  later rows.
- Every later occurrence references all earlier matching valid source indexes.
- Structurally or category-invalid rows are never indexed for later rows, so an
  unimportable row cannot turn a later valid row into a batch duplicate.
- An existing-question duplicate and a batch duplicate can both be reported.

Duplicate warnings do not make a row structurally invalid.

### Confirm Service

The confirm service reruns the preview service against current database state.
It verifies:

- The recomputed hash matches `previewDocumentHash`.
- Selected indexes are valid and unique.
- Every selected row is valid.
- Every selected duplicate has an explicit override.

If any check fails, the service returns a conflict with the current preview and
does not start persistence.

## Persistence and Atomicity

All imported questions are persisted with:

```ts
{
  certificationId,
  categoryId,
  stem,
  difficulty,
  status: "draft",
  createdBy: "ai",
  mediaAssets: [],
  sourceResourceId: null,
  generationJobId: null
}
```

Answer options are persisted in submitted order with:

```ts
{
  questionId,
  text,
  isCorrect,
  explanation,
  citationUrls,
  mediaAssets: [],
  sortOrder: index
}
```

The server generates question UUIDs before insertion. This permits:

- One bulk question insert.
- One bulk answer-option insert.
- Deterministic question-to-answer mapping.

Both inserts execute in the existing database transaction abstraction.

If either insert fails, the transaction rolls back the complete selected batch.
No question from the batch remains.

The importer does not call `createQuestion` once per row because that would
repeat category queries and database round trips. It uses the same persistence
shape and validation rules through a batch-specific service boundary.

## Admin Architecture

### Server API Client

The CertDrill admin server client adds typed functions for:

- Previewing a question import.
- Confirming a question import.

These functions use the existing cookie-authenticated server API client and
trusted Origin forwarding.

### Server Actions

The admin module adds:

- A preview action that converts API errors into explicit preview form state.
- A confirm action that returns either conflict preview state or success.

The action state stores:

- Current input mode.
- Raw JSON text.
- Preview result.
- Selected source indexes.
- Duplicate override indexes.
- Batch error.
- Success result.

Raw JSON remains available after validation failure or confirm conflict.

### Client Import Form

A focused client component owns:

- Upload/paste selection.
- File-size checking and file reading.
- JSON text editing.
- Preview submission.
- Row selection.
- Duplicate override controls.
- Selection totals.
- Confirm submission.
- Accessible validation and status messaging.

Preview and confirm buttons expose pending state and prevent duplicate
submissions.

The component does not perform authoritative category, duplicate, or
persistence validation.

## Error Handling

### Document Errors

Document-level errors appear above the input:

- Invalid JSON syntax.
- Unsupported version.
- Missing questions.
- Too many questions.
- Unknown top-level properties.
- Request too large.

Document errors prevent preview-table display.

### Row Errors

Each row can report multiple field-specific errors:

- Unknown or archived category.
- Ambiguous case-insensitive category code.
- Missing Stem.
- Invalid difficulty.
- Too few or too many answers.
- Missing answer text.
- Incorrect correct-answer count.
- Unsafe citation URL.
- Unknown question or answer properties.

Invalid rows are visible but not selectable.

### Duplicate Warnings

Duplicate warnings show:

- Whether the duplicate already exists in the certification.
- Existing compact question IDs with links to their editors.
- Earlier duplicate row numbers in the current batch.

Duplicates require explicit override before confirm.

### Confirm Conflicts

A confirm conflict is not a generic failure. The page:

- Replaces the old preview with the refreshed preview.
- Clears selections that are no longer valid.
- Reapplies valid duplicate overrides by source index.
- Displays a message explaining that the database changed and review is
  required again.

### Unexpected Failures

Unexpected API or transaction failures:

- Do not redirect.
- Do not clear input.
- Do not report imported rows.
- Display the existing explicit API error message.

## Accessibility

- Upload and paste modes use keyboard-accessible tabs.
- File input and JSON textarea have labels and descriptive help.
- Document errors use `role="alert"`.
- Preview totals use a status region.
- Table checkboxes have row-specific accessible names.
- Invalid-row checkboxes are disabled.
- Duplicate controls explain that enabling them permits an intentional
  duplicate.
- Pending buttons expose disabled/busy state.
- After preview, focus moves to the preview heading.
- After confirm conflict, focus moves to the conflict alert.

## Testing

### Import Schema Tests

Cover:

- Canonical valid document.
- Unknown top-level properties producing document errors.
- Unknown question and answer properties producing row errors.
- Unsupported version.
- Empty, 500-question, and 501-question documents.
- Missing and default difficulty.
- Two and ten answers.
- One and eleven answers.
- Zero, one, and two correct answers.
- Optional explanation and citations.
- Unsafe citation protocols.
- Document hash stability after normalization.

### Preview Service Tests

Cover:

- Case-insensitive category resolution.
- Unknown, archived, and ambiguous category codes.
- Existing certification-wide duplicates.
- Within-batch duplicates.
- Combined existing and batch duplicates.
- Trim/collapse/lowercase Stem normalization.
- Punctuation and Markdown remaining significant.
- Default selection behavior.
- Invalid rows remaining in preview.
- One-query category and existing-question loading boundaries.

### Confirm Service Tests

Cover:

- Selected valid rows only.
- Empty selection.
- Duplicate indexes.
- Unknown indexes.
- Invalid selected rows.
- Duplicate selection without override.
- Duplicate selection with override.
- Preview hash mismatch.
- Database changes between preview and confirm.
- Forced Draft/AI values.
- Contiguous answer sort order.
- Server-generated UUID mapping.
- Successful bulk insertion.
- Complete rollback when question insert fails.
- Complete rollback when answer insert fails.

### API Route Tests

Cover:

- Admin authentication and Origin protection.
- Preview and confirm request validation.
- Request-size limit.
- Typed conflict response.
- Successful result shape.

### Admin Tests

Cover:

- Import button and route.
- Upload and paste modes.
- Downloadable example.
- File-size rejection.
- Invalid JSON preservation.
- Preview totals and row rendering.
- Default selection.
- Invalid checkbox disabling.
- Duplicate override behavior.
- Confirm disabled with no selected rows.
- Pending states.
- Conflict refresh.
- Success redirect and imported-count message.
- Accessible labels, alerts, and focus targets.

### Regression Tests

Retain coverage for:

- Dynamic two-to-ten answer editing.
- Question create/update.
- Question table live filtering, sorting, pagination, and actions.
- Source-resource preservation.
- Server Origin forwarding.

## Future Export Compatibility

The canonical import document is intentionally versioned so a future Export
feature can emit the same `version: 1` shape.

Export design is not part of this project and does not block Import.
