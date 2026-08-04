# Question Editor Focused Tabs Design

## Purpose

Simplify the CertDrill question-management experience by reducing table noise and replacing the crowded question form with a focused, tabbed editor. The redesign must incorporate the existing uncommitted form-validation work rather than replacing or reverting it.

This design supersedes the editor layout in `docs/superpowers/specs/2026-07-30-question-editor-ui-design.md`.

## Scope

The change covers:

- Compact question identifiers in admin question tables.
- The new-question and edit-question forms.
- Draft and publish validation related to answers.
- Accessible tab navigation and validation feedback.
- Preservation of existing optional source-resource relationships.

It does not change the database schema, question URLs, question UUID generation, or the source-resource data model.

## Compact Question Identifiers

Admin question tables display only the first hyphen-delimited UUID segment, such as `f59b5caa` from `f59b5caa-dc5a-4d79-9ba8-b81643c1ef9f`.

The full UUID remains:

- In the link destination.
- Available to assistive technology through an accessible label.
- Available wherever the application needs the identifier for actions or persistence.

The compact display applies consistently to the drill-specific and centralized admin question tables. It does not alter generated URLs or action payloads.

## Editor Layout

The question form uses two vertically stacked sections.

### Question Details

The Question details section retains the existing editable question metadata, including category, status, and difficulty where applicable.

Stem uses a full-width Markdown textarea. The live Stem preview is removed.

The following controls are removed from the visible form:

- Source resource ID.
- Clear source resource.

On edit, an existing `sourceResourceId` is submitted through a hidden form value so saving unrelated changes preserves the relationship. New questions omit the value. Removing the visible controls must never clear an existing relationship.

### Answers

The Answers section contains these tabs:

1. Overview
2. Answer 1
3. Answer 2
4. Answer 3
5. Answer 4

Overview is the initial tab for both new and existing questions.

Each Answer tab contains spacious Markdown textareas for:

- Answer text.
- Explanation.

No live Markdown preview is shown in the answer tabs.

## Overview Tab

Overview provides a compact summary of all four answers. Each row shows:

- Answer number.
- A shortened summary of the answer text.
- Whether the answer has been entered.
- A single-choice radio control for marking the correct answer.

Selecting the non-radio portion of a row opens the corresponding Answer tab. Selecting the radio changes only the correct-answer selection.

Only one answer can be marked correct. Empty answers cannot be selected as correct. A new question does not automatically mark Answer 1 as correct.

The correct-answer selection uses the same submitted form data consumed by the server action; it is not separate client-only state.

## Tab Behavior

The focused tab panel is implemented as a client component embedded inside the existing server-rendered form.

Tabs use accessible tab semantics and support:

- Keyboard focus.
- Arrow-key navigation between tabs.
- A visible active state.
- A visible error indicator on tabs containing invalid fields.

On narrow screens, the tab list scrolls horizontally rather than compressing labels or editors.

Form values remain mounted while switching tabs so navigating between answers never loses entered content.

## Validation

Draft creation and update require:

- A category.
- A non-empty Stem.
- At least two non-empty answer texts.

Answer explanations are optional. An explanation without corresponding answer text is invalid because it creates an unusable partial answer.

A correct answer is optional while saving a draft. Publishing requires:

- At least two non-empty answer texts.
- Exactly one correct non-empty answer.

The shared validation path remains authoritative for both client-facing feedback and server actions. Existing action-state handling, pending state, success feedback, error summaries, field anchors, and retained values must be preserved.

When validation fails:

- Errors appear in the form summary.
- Errors appear beside their fields.
- Answer tabs containing errors show an error indicator.
- The form activates the tab containing the first invalid answer field.
- Focus moves to the first invalid field.
- All submitted values remain visible and editable.

## Component Boundaries

The large admin page continues to own data loading and page composition. Interactive answer editing moves into a focused client component with these responsibilities:

- Active-tab state.
- Overview summaries.
- Correct-answer selection.
- Tab error indicators.
- Activating the first invalid tab.

The existing form shell continues to own:

- `useActionState` integration.
- Submission pending state.
- Form-level success and failure feedback.
- Error-summary rendering.
- Focus coordination.

The shared question-form validator continues to normalize and validate `FormData`. Server actions continue to enforce validation before calling API operations.

A small shared formatter should produce compact UUID display values so table implementations do not duplicate slicing logic.

## Data and Persistence

No schema or route changes are required.

On submission:

1. The browser submits Question details, all four answers, correct-answer state, and the hidden existing source-resource value when present.
2. Shared form validation returns normalized values or structured field errors.
3. Invalid submissions return action state without calling the API.
4. Valid submissions use the existing create or update operation.
5. Publish validation independently enforces publish-only requirements.

The editor must not silently clear fields that are no longer visible.

## Testing

Tests must cover:

- Compact UUID rendering in each admin question table.
- Full UUID preservation in links and accessible labeling.
- Absence of Stem preview.
- Absence of visible source-resource controls.
- Preservation of an existing source-resource relationship on edit.
- Overview as the initial tab.
- Keyboard and pointer tab navigation.
- Opening an Answer tab from its Overview row.
- Markdown textareas for answer text and explanation.
- Single correct-answer selection.
- No default correct answer for new questions.
- Prevention of selecting an empty answer as correct.
- Category, Stem, and two-answer draft requirements.
- Explanation-without-answer validation.
- Correct-answer publish requirement.
- Error markers on invalid Answer tabs.
- Automatic activation and focus of the first invalid tab and field.
- Retention of submitted values after validation failure.

Existing question filtering, sorting, pagination, row actions, and publishing behavior remain regression-covered and unchanged.
