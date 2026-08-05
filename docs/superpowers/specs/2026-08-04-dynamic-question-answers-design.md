# Dynamic Question Answers Design

## Purpose

Remove the fixed four-answer limitation from CertDrill question management so manually edited and AI-generated questions can contain between two and ten answers.

This is the first of two projects:

1. Add dynamic answer support to the editor, form validation, and API contracts.
2. Add reviewed, atomic import of up to 500 AI-generated questions.

The import project depends on the stable dynamic-answer model defined here and receives its own specification and implementation plan.

## Scope

This project covers:

- Loading existing questions with any supported answer count.
- Adding and removing answer tabs in the admin question editor.
- Stable answer identity during client editing and server validation.
- Dynamic form parsing into the existing API `options[]` payload.
- Draft and publish validation for two to ten answers.
- Backward compatibility with existing questions and API consumers.

It does not add question import, export, answer reordering, or database schema changes.

## Answer Limits

Every editable question has between two and ten answer slots.

- A new question starts with two blank answers.
- **Add answer** appends one blank answer and is disabled at ten.
- **Remove answer** is disabled when only two answers remain.
- Draft save requires all visible answer tabs to contain non-empty answer text.
- Publishing requires exactly one visible answer to be correct.

The API rejects payloads containing fewer than two or more than ten options.

## Stable Editing Identity

Each answer receives a stable client key for the lifetime of the mounted editor. The key is not a database identifier and is not persisted.

Existing answer database UUIDs remain unchanged and are not exposed as form-field identities.

The form submits:

- An ordered list of stable answer keys.
- Text, explanation, and citation fields keyed by the stable answer key.
- The stable key of the correct answer, when selected.

Example field names:

```text
answerKeys=answer-a,answer-b,answer-c
answer.answer-a.text=First answer
answer.answer-a.explanation=Why it is correct
answer.answer-a.citationUrls=https://example.com
correctAnswerKey=answer-a
```

Stable keys prevent validation errors from moving to a different answer when an earlier answer is removed.

## Form Parsing

A focused shared parser converts the submitted ordered answer fields into the existing API option structure:

```ts
{
  text: string;
  explanation: string;
  citationUrls: string[];
  isCorrect: boolean;
  sortOrder: number;
}
```

The parser:

1. Reads and validates the ordered key list.
2. Rejects malformed or duplicate keys.
3. Reads each answer's keyed fields.
4. Validates the correct-answer key against the submitted key list.
5. Produces contiguous `sortOrder` values beginning at zero.

Create and update actions continue to send the existing `options[]` API payload. Other API consumers do not need to adopt the form-field representation.

## Loading Existing Questions

The editor normalizes stored options before creating answer state.

- If stored options use unique canonical `sortOrder` values, their order is preserved.
- Legacy or noncanonical sort orders are sorted deterministically and mapped positionally.
- All existing options up to the maximum of ten are loaded.
- Existing correct-answer state follows the normalized answer.
- Existing database answer UUIDs remain an implementation detail of persistence.

Existing two-answer and four-answer questions open without behavioral changes.

## Editor Layout

The Answers card retains:

1. Overview
2. One tab for every current answer

Tabs are labeled by current display order:

```text
Overview | Answer 1 | Answer 2 | Answer 3 | ...
```

Stable keys remain internal and are never shown to the administrator.

The tab list remains horizontally scrollable, keyboard accessible through Radix Tabs, and uses visible active and error states.

All answer panels remain mounted but inactive panels remain visually hidden. This preserves every answer value in the submitted form.

## Adding Answers

The **Add answer** button:

- Appears in the Answers card header.
- Appends a blank answer after the current final answer.
- Opens the new answer tab.
- Focuses the new answer text field.
- Is disabled at ten answers.

The new stable key is generated client-side and is unique within the mounted editor.

## Removing Answers

Each Answer tab contains a **Remove answer** action.

- The action is disabled when only two answers remain.
- An answer with no text, explanation, or citation content is removed immediately.
- A populated answer requires inline confirmation.
- Confirmation provides explicit **Cancel** and **Remove answer** actions.
- Removing the selected correct answer clears the correct-answer selection.
- Removing an answer closes its tab and activates the nearest remaining answer tab.
- Overview numbering and summaries update immediately.

The confirmation is part of the editor state and does not use a browser-native confirmation dialog.

## Overview

Overview shows one row for every current answer:

- Current answer number.
- Truncated answer text or **Not entered**.
- Entered or Empty state.
- Correct-answer radio.

Selecting a summary opens and focuses its answer tab. Selecting a radio changes only the correct answer.

Empty answers cannot be selected as correct.

## Validation

### Draft Validation

Draft creation and update require:

- A valid certification and category.
- A non-empty Stem.
- Between two and ten submitted answers.
- Non-empty text for every visible answer.

Explanations and citations remain optional for drafts. Explanation or citation content without answer text is invalid.

Correct-answer selection is optional for drafts.

### Publish Validation

Publishing requires:

- Between two and ten answers.
- Exactly one correct answer.
- A non-empty explanation for every answer.
- At least one safe citation URL for every answer.

The API publish validator independently enforces these rules for all callers.

### Structural Validation

The form parser rejects:

- Missing ordered answer keys.
- Fewer than two or more than ten keys.
- Duplicate keys.
- Keys containing unsupported characters.
- Answer fields whose keys are not present in the ordered list.
- A correct-answer key absent from the ordered list.

Errors use stable-key field names internally and map to the correct answer tab and DOM field.

## Error Handling and Focus

The existing form summary remains visible above the editor.

When validation fails:

- Question-detail errors appear inline.
- Answer tabs containing errors show an error indicator.
- The first invalid answer tab activates automatically.
- Focus moves to the corresponding field.
- Submitted question details and all answer values remain intact.
- Errors remain attached to stable answer keys even after another answer is added or removed.

Aggregate answer-count and correct-answer errors target the Overview tab.

## API and Persistence

The public create/update API continues accepting `options[]`.

The question create and update schemas add:

```ts
options: z.array(questionOptionSchema).min(2).max(10)
```

Draft and published status rules remain service-level validation because their requirements differ.

Create and update remain atomic database transactions. Replacing question options during update continues to happen within the same transaction as the question update.

No database migration is required because answer options are already stored as separate rows.

## Components and Responsibilities

### `question-answer-fields.ts`

Pure form parsing and field-name helpers:

- Validate stable keys.
- Parse ordered answers.
- Build option payloads.
- Map stable-key validation errors.

### `question-form-navigation.ts`

Extends current navigation helpers to understand stable answer keys rather than numeric fixed positions.

### `question-form.tsx`

Owns:

- Dynamic answer state.
- Stable key generation.
- Add/remove behavior.
- Removal confirmation.
- Correct-answer selection.
- Tab activation and focus.
- Overview summaries.

The existing Question details and action-state integration remain unchanged.

### API validation

Owns payload bounds and publishability checks independent of the admin UI.

## Testing

Tests cover:

- New questions begin with two answers.
- Existing questions load two, four, and ten answers.
- Legacy sort orders normalize without losing answers.
- Adding answers up to ten.
- Add action disabled at ten.
- Removal disabled at two.
- Empty-answer removal.
- Populated-answer confirmation and cancellation.
- Removing the correct answer clears selection.
- Tab activation and focus after add/remove.
- Stable validation mapping after removing an earlier answer.
- Complete FormData submission for inactive mounted tabs.
- Draft validation at one, two, and eleven answers.
- Every visible draft answer requiring text.
- Optional draft correct answer.
- Publish validation requiring exactly one correct answer.
- Publish explanation and citation requirements for every answer.
- Duplicate, malformed, missing, and unknown stable keys.
- Correct API `options[]` order and contiguous sort orders.
- Existing create/update and source-resource preservation behavior.
- No regressions to question table filtering, sorting, pagination, or actions.

## Future Import Compatibility

The later Import feature will validate AI-generated JSON into the same API option shape and enforce the same two-to-ten answer rules.

Its approved high-level requirements are:

- Upload a JSON file or paste JSON.
- Up to 500 questions per batch.
- Questions may target multiple categories by category code within one selected certification.
- Validate and preview before confirmation.
- Warn about normalized-Stem duplicates and exclude them by default, with explicit override.
- Save selected questions atomically.
- Always save imported questions as Draft.
- Mark imported questions as AI-created.

Those requirements are recorded here only as compatibility constraints. Their detailed workflow belongs to the separate Import specification.
