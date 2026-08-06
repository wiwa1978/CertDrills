# CertDrill Exam Form Admin Redesign

## Goal

Replace the certification admin's dense inline Exam Forms editor with a simple list, a focused creation flow, and a dedicated editor. New exam forms are automatically populated with published questions according to the certification's top-level category weights, while preserving strict category quotas during later manual swaps.

## Scope

In scope:

- Replace the inline Exam Forms editor with a list and **Create Form** action.
- Create exam forms from a name, duration, and target question count.
- Generate the initial question assignment on the backend from top-level category weights.
- Show category allocation widgets and category-specific assigned-question tables.
- Allow one-for-one question replacement within the same top-level category.
- Regenerate the complete assignment on demand or after changing the target count.
- Keep new forms inactive until an admin explicitly activates them.
- Validate weights, published-question capacity, assignments, and concurrent edits.

Out of scope:

- Changing learner-facing exam-form behavior.
- Adding nested weighting inside a top-level category.
- Allowing free-form add/remove operations that violate category quotas.
- Preserving manually selected questions during regeneration.
- Exam-form deletion or archival.
- Changing the existing limit of three active forms exposed to learners.
- Changing Exam Simulation selection behavior.

## Admin Workflow

### Exam Forms List

The certification's **Exam Forms** tab becomes the canonical list view. It contains:

- A **Create Form** button.
- A table with name, target question count, duration, status, and actions.
- An edit action that opens the dedicated form editor.
- An activate/deactivate action where appropriate.

The current selection links, always-visible metadata form, full checkbox picker, pasted-ID field, and duplicate summary table are removed.

The list remains certification-scoped. Navigation back from an editor explicitly returns to `/admin/certdrill/:certificationId?tab=exam-forms`.

### Create Form

**Create Form** opens a dialog following the existing category creation pattern. It contains only:

- Name.
- Duration in minutes.
- Target question count.

Submission asks the backend to validate and create the form immediately. On success, the admin is sent to the dedicated editor. The form is inactive by default.

New forms receive the next available sort order for the certification. Existing descriptions and sort orders remain persisted, but this redesign does not add them to the streamlined creation dialog or editor. Ordering controls and description editing are deferred rather than mixed into the assignment workflow.

Creation is atomic. If weights or question capacity are invalid, no exam form or assignment is persisted. The dialog displays an actionable validation error and remains open.

### Dedicated Editor

Use certification-scoped routes matching the question-editor pattern:

- `/admin/certdrill/:certificationId/exam-forms/new` is not required because creation occurs in a dialog.
- `/admin/certdrill/:certificationId/exam-forms/:examFormId` displays the editor.

The editor contains:

- A **Back to Exam Forms** link.
- Editable name and duration.
- Editable target question count.
- Current active/inactive status.
- An explicit activate or deactivate action.
- A **Regenerate Questions** action.
- One allocation widget for each active top-level category.
- One question tab for each active top-level category.

Changing only name or duration preserves the current assignment. Changing target question count requires confirmation and regenerates the complete assignment. If the admin cancels confirmation, neither the count nor the assignment changes.

### Category Allocation Widgets

Each widget represents one non-archived top-level category and displays:

- Category name.
- Configured weight percentage.
- Assigned question count.
- Total form percentage represented by that count.

Example: `Networking · 20% weight · 12 questions · 20% of form`.

Counts use the integer allocation persisted when the assignment was generated. The displayed percentage is `assigned count / target question count * 100`, so rounding can make it differ slightly from the configured category weight.

### Category Question Tabs

Each top-level category has a tab. A tab shows only questions currently assigned to that category's quota. Questions belonging to descendant categories appear under their top-level ancestor's tab.

The table includes at least:

- Question stem.
- Direct category.
- Difficulty.
- Published status.
- A **Replace** action.

The form's persisted global question order remains deterministic. The editor groups questions for display without changing that stored order.

### Replace Question

**Replace** opens a focused selector containing eligible alternatives from the same top-level category tree. An eligible replacement must:

- Belong to the same certification.
- Be published.
- Belong to the same top-level category as the question being replaced.
- Not already be assigned to the form.

Selecting an alternative performs a one-for-one replacement at the original question's position. Therefore the total count, category count, category percentage, and question order position remain unchanged.

If no replacement is available, the action is disabled with an explanatory message.

### Regeneration

**Regenerate Questions** requires confirmation that all manual swaps will be discarded. Regeneration:

- Uses the current target question count.
- Uses current top-level category weights.
- Uses the current published-question pool.
- Produces a new random assignment.
- Replaces the complete stored question list and allocation snapshot atomically.

A target-count change uses the same regeneration operation after confirmation.

## Weighted Allocation

### Eligible Categories

Automatic assignment uses non-archived top-level categories only. Descendant categories do not receive independent quotas; their published questions belong to their top-level ancestor's pool.

Before creation or regeneration:

- Every included top-level category must have a positive numeric weight.
- The top-level category weights must total exactly `100.00`.
- Missing, zero, negative, invalid, or incomplete weights block the operation.

Category editing continues to allow an incomplete total while a blueprint is being built. The stricter 100% requirement applies when generating an exam form.

### Integer Quotas

Allocate the requested total with the largest-remainder method:

1. Calculate each exact quota as `target count * category weight / 100`.
2. Assign the floor of every exact quota.
3. Distribute remaining questions by descending fractional remainder.
4. Break equal remainders deterministically by category sort order, then category ID.

The resulting integer quotas must sum exactly to the target question count.

### Question Selection

For each top-level quota:

- Build a pool of unique published questions assigned directly to that category or any descendant.
- Randomly select exactly the allocated number of questions.
- Do not borrow surplus questions from another category.

If any category has fewer eligible questions than its quota, block the operation. Return every shortage with category name, required count, and available count. Do not create a partial form and do not redistribute the shortage.

The final global question list is ordered deterministically by top-level category sort order. Questions within each category quota retain their generated random order. Regeneration may produce a different random set and order.

## Data Model

Continue using the existing ordered `question_ids uuid[]` on `certdrill_exam_forms`. Add:

- `target_question_count integer not null` with a positive database check.
- `assignment_version integer not null default 1`.
- `allocation_snapshot jsonb not null`.
- `generated_at timestamp with time zone not null`.

The allocation snapshot records, for every top-level category at generation time:

- Category ID and name.
- Weight percentage.
- Allocated and assigned counts.

The snapshot supports stable editor widgets and auditing even if category names or weights change later. Current category data is still used for replacement eligibility and future regeneration.

Existing exam forms are migrated with:

- `target_question_count = cardinality(question_ids)`.
- `assignment_version = 1`.
- An allocation snapshot derived from the existing assignment and current category ancestry.
- `generated_at = updated_at`, falling back to `created_at`.

An existing assignment that cannot be mapped to a current top-level category remains editable as metadata but cannot be activated until regenerated successfully.

## API And Service Design

### Create

The admin create request accepts:

```ts
{
  certificationId: string;
  name: string;
  durationMinutes: number;
  targetQuestionCount: number;
}
```

The service validates the metadata, blueprint, and capacity; generates the assignment; and persists an inactive form in one transaction. The response includes the created form and its allocation data.

### Metadata Update

Updating name or duration does not change assignments. A target-count change is not accepted through the metadata-only operation; it uses regeneration so the count and assignment cannot diverge.

### Regenerate

The regeneration request accepts:

```ts
{
  targetQuestionCount: number;
  expectedAssignmentVersion: number;
}
```

After successful generation, it atomically replaces question IDs and the allocation snapshot, updates `generated_at`, and increments `assignment_version`.

### Replace

The replacement request accepts:

```ts
{
  currentQuestionId: string;
  replacementQuestionId: string;
  expectedAssignmentVersion: number;
}
```

The service verifies all replacement rules, replaces the question at the same array index, and increments `assignment_version`. The allocation snapshot counts do not change.

### Activation

Activation revalidates that:

- Top-level weights still total 100%.
- Integer quotas calculated from the current weights and target count match the allocation snapshot.
- The assignment length equals the target count.
- Every assigned question belongs to the certification.
- Every assigned question is currently published.
- Every assigned question maps to the expected top-level category.
- Actual category counts match the allocation snapshot.

Activation fails with category-specific errors rather than exposing an incomplete form to learners. Deactivation remains available without these checks.

### Concurrency

Regeneration and replacement require `expectedAssignmentVersion`. A stale version returns a conflict response and does not modify the form. The editor asks the admin to reload the latest assignment.

Metadata-only updates do not increment `assignment_version`, but continue to use the record's normal update timestamp as appropriate.

## Learner Behavior

Learner-facing behavior is unchanged:

- Only active forms are shown.
- At most the first three active forms are exposed using the existing ordering.
- A form advertises its target question count and duration.
- Starting a form uses its persisted ordered question IDs.
- Existing attempts remain unchanged because attempts store their own question IDs and snapshots.

An active form produces exactly its advertised count. Unpublishing or archiving a question is blocked while that question belongs to an active exam form; the error identifies the forms that must first be deactivated or regenerated. Attempt creation retains its existing defensive omission behavior as a final safeguard for legacy or externally modified data.

## Error Handling

Use structured validation errors suitable for inline admin display. Important cases include:

- Weights total `X%`; exactly `100%` is required.
- Category `Y` requires `N` questions but only `M` published questions are available.
- A selected replacement is unpublished, already assigned, or belongs to a different top-level category.
- The form changed since the editor loaded; reload before retrying.
- The form cannot be activated because its assignment is incomplete or stale.

A weight change that alters an integer category quota makes the assignment stale and requires regeneration. A weight change that leaves every calculated integer quota unchanged does not invalidate the assignment.

Creation and regeneration must be transactional. A failed operation leaves no partial form and never replaces a valid existing assignment.

## Testing

### Allocation Unit Tests

- Exact weighted allocations.
- Largest-remainder rounding.
- Deterministic tie-breaking.
- Descendant questions included in their top-level pool.
- Weight totals below or above 100 rejected.
- Missing, zero, negative, and invalid weights rejected.
- Per-category shortage blocks generation without redistribution.
- Generated assignments contain no duplicate question IDs.

### API And Service Tests

- Creation persists an inactive, complete form and allocation snapshot.
- Failed creation persists nothing.
- Metadata updates preserve assignments.
- Target-count changes regenerate atomically.
- Regeneration increments assignment version and discards prior swaps.
- Replacement preserves index, total count, and category count.
- Cross-category, duplicate, unpublished, and cross-certification replacements fail.
- Stale assignment versions return conflicts without changes.
- Activation rejects incomplete or stale assignments.
- Existing learner attempt snapshots remain unchanged after regeneration.
- Unpublishing or archiving a question assigned to an active form is rejected.

### Admin UI Tests

- Exam Forms tab renders a single list and **Create Form** action.
- Successful creation navigates to the dedicated editor.
- Creation errors remain in the dialog and identify the cause.
- Editor renders category widgets from the allocation snapshot.
- Category tabs show assigned questions from the complete category subtree.
- Replacement selector shows only eligible same-category alternatives.
- Regeneration and target-count changes require confirmation.
- Back navigation returns to the Exam Forms tab.
- Newly created forms remain inactive until explicitly activated.

### Learner Regression Tests

- Inactive forms remain hidden.
- Active forms expose their configured count and duration.
- Questions assigned to active forms cannot be unpublished or archived until the affected forms are deactivated or regenerated.
- Attempts preserve the persisted question order.
- Existing active-form ordering and three-form limit remain unchanged.

## Acceptance Criteria

- The Exam Forms tab no longer renders the inline all-question picker.
- An admin can create an inactive form by entering only name, duration, and question count.
- Valid creation immediately produces a complete weighted question assignment.
- Invalid weights or category capacity prevent creation and explain every issue.
- The editor shows allocation widgets and assigned-question tabs for top-level categories.
- An admin can replace a question only with an eligible question from the same top-level category.
- Regeneration and target-count changes replace the assignment only after confirmation.
- Concurrent assignment edits cannot silently overwrite each other.
- A form cannot be activated unless its assignment is complete and valid.
- Learner-facing exam forms continue to use fixed ordered question sets.
