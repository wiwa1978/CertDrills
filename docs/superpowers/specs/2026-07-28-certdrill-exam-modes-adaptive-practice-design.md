# CertDrill Exam Modes And Adaptive Practice Design

## Goal

Refine CertDrill from generic practice/exam selection into a student-focused exam preparation system with clear practice drills, exam simulations, fixed exam forms, optional confidence tracking, missed-question review, and weak-area drills.

This is Phase 1 of the learning-intelligence roadmap. Spaced repetition, readiness scoring, and full coverage analytics are deferred to later phases.

## Scope

In scope:

- Replace the current two independent selectors with a clearer test-mode model.
- Add admin-configurable practice/exam defaults.
- Add admin-defined exam forms.
- Add optional confidence prompts per attempt.
- Add missed questions review.
- Add weak areas drill.
- Preserve stable attempt snapshots.

Out of scope:

- Spaced repetition scheduling.
- Readiness score.
- Full objective coverage dashboard.
- Billing/cart/entitlements.
- LLM generation changes.

## User-Facing Model

CertDrill shows two top-level groups: Practice and Exam.

Practice options:

- **Quick Drill**: short random practice set across the full certification pool.
- **Category Drill**: short random practice set from one selected category/section.

Practice behavior:

- No timer.
- Immediate feedback after each answered question.
- User can optionally enable confidence prompts.

Exam options:

- **Exam Simulation**: random weighted full exam from the published pool.
- **Exam Form A/B/C**: fixed admin-curated exam forms.

Exam behavior:

- Timer enabled.
- No feedback until submit.
- User can optionally enable confidence prompts.
- Fixed exam forms reuse the exact same ordered question set every time.

## Naming

Use these user labels:

- Practice
- Quick Drill
- Category Drill
- Exam
- Exam Simulation
- Exam Form A, Exam Form B, Exam Form C
- Missed Questions Review
- Weak Areas Drill

Avoid “fixed set” in user-facing copy. Internally, use `exam_form` for the fixed forms.

## Admin Configuration

Certification-level defaults:

- `quick_drill_question_count`, default `10`.
- `category_drill_question_count`, default `10`.
- `exam_simulation_question_count`, default existing `question_count_default`.
- `exam_simulation_duration_minutes`, default `120`.

Category-level defaults:

- `drill_question_count`, nullable.
- If set, Category Drill uses this count for that category.
- If null, Category Drill uses the certification `category_drill_question_count`.

Exam forms:

- Admin can define multiple exam forms per certification.
- UI initially presents up to three active forms.
- Each form has name, description, active flag, sort order, duration minutes, and ordered question IDs.
- Names default to `Exam Form A`, `Exam Form B`, `Exam Form C` by sort order.
- Forms should be curated to align with blueprint weights, but the system does not need to enforce exact weight distribution in Phase 1.

## Data Model

Add or extend CertDrill schema:

Certification:

- `quick_drill_question_count integer not null default 10`.
- `category_drill_question_count integer not null default 10`.
- `exam_simulation_question_count integer nullable`.
- `exam_simulation_duration_minutes integer not null default 120`.

ExamCategory:

- `drill_question_count integer nullable`.

ExamForm:

- `id uuid primary key`.
- `certification_id uuid not null`.
- `name text not null`.
- `description text nullable`.
- `sort_order integer not null default 0`.
- `is_active boolean not null default true`.
- `duration_minutes integer not null default 120`.
- `question_ids uuid[] not null`.
- `created_at`, `updated_at`.

ExamAttempt:

- `test_mode text not null`: `practice | exam`.
- `test_variant text not null`: `quick_drill | category_drill | exam_simulation | exam_form | missed_review | weak_areas`.
- `exam_form_id uuid nullable`.
- `confidence_enabled boolean not null default false`.
- `expires_at timestamp nullable`.

Keep existing `feedback_mode` and `selection_mode` columns for compatibility during migration, but derive them from the new test mode/variant:

- Quick Drill: `feedback_mode=practice`, `selection_mode=weighted_random`.
- Category Drill: `feedback_mode=practice`, `selection_mode=category_focus`.
- Exam Simulation: `feedback_mode=exam`, `selection_mode=weighted_random`.
- Exam Form: `feedback_mode=exam`, `selection_mode=weighted_random` with `exam_form_id` and fixed question IDs.
- Missed Review: `feedback_mode=practice`, `selection_mode=weighted_random`.
- Weak Areas: `feedback_mode=practice`, `selection_mode=weighted_random`.

ExamAttemptAnswer:

- `confidence text nullable`: `guessed | somewhat_sure | confident`.

## API Changes

Create attempt request should accept:

```ts
{
  certificationId: string;
  testMode: "practice" | "exam";
  testVariant: "quick_drill" | "category_drill" | "exam_simulation" | "exam_form" | "missed_review" | "weak_areas";
  categoryIds?: string[];
  examFormId?: string;
  confidenceEnabled?: boolean;
}
```

Validation:

- `category_drill` requires one category ID.
- `exam_form` requires `examFormId`.
- `exam_form` is only valid with `testMode=exam`.
- `quick_drill`, `category_drill`, `missed_review`, and `weak_areas` are practice variants.
- `exam_simulation` is an exam variant.

Answer request should accept optional confidence:

```ts
{
  questionId: string;
  selectedOptionId: string;
  confidence?: "guessed" | "somewhat_sure" | "confident";
}
```

Attempt response should include:

- `testMode`.
- `testVariant`.
- `confidenceEnabled`.
- `expiresAt` for timed exam attempts.
- existing question payload.

Certification catalog response should include:

- drill/exam counts.
- exam simulation duration.
- active exam forms.

## Selection Behavior

Quick Drill:

- Select from the full published question pool.
- Use certification `quick_drill_question_count`.
- If fewer questions are available, use all available and return a warning.

Category Drill:

- Expand selected category to descendants.
- Use category `drill_question_count` when set.
- Otherwise use certification `category_drill_question_count`.
- If fewer questions are available, use all available and return a warning.

Exam Simulation:

- Use weighted random selection by top-level category weights.
- Use certification `exam_simulation_question_count` when set, otherwise existing `question_count_default`.
- Set `expires_at = now + exam_simulation_duration_minutes`.

Exam Form:

- Load active exam form by ID and certification.
- Use the form `question_ids` in stored order.
- Set `expires_at = now + form.duration_minutes`.
- If any question is unpublished/missing, skip it and return an admin-facing warning in logs or response. Phase 1 may return a user warning if the selected form is incomplete.

Missed Questions Review:

- Select questions the user previously answered incorrectly for this certification.
- Prefer most recent misses first, deduplicate by question ID.
- Limit to certification `quick_drill_question_count`.
- Immediate feedback.
- If no missed questions exist, show an empty state.

Weak Areas Drill:

- Compute category performance from completed attempts.
- Identify the lowest-performing categories with answered questions.
- Select mostly or entirely from those categories.
- Limit to certification `quick_drill_question_count`.
- Immediate feedback.
- If there is no attempt history, show an empty state and suggest Quick Drill.

## Timer Behavior

Timers are server-authoritative:

- Timed exam attempts get `expires_at` at creation.
- The UI displays remaining time based on `expires_at`.
- Submit after expiry should be rejected or auto-submitted. Phase 1 should reject answer updates after expiry and allow submit to compute score from recorded answers.
- If time expires client-side, the UI should call submit and navigate to results.

Practice attempts have `expires_at = null`.

## Confidence Tracking

Confidence is optional per attempt.

When enabled:

- The UI asks after each answer or before moving next.
- Stored values are `guessed`, `somewhat_sure`, `confident`.
- Confidence is included in attempt review.

When disabled:

- No prompt is shown.
- `confidence` remains null.

Phase 1 uses confidence only for storage/review. Future readiness scoring can use it.

## UI Changes

Start page:

- Present Practice and Exam as two groups.
- Practice cards:
  - Quick Drill.
  - Category Drill with category selector.
  - Missed Questions Review.
  - Weak Areas Drill.
- Exam cards:
  - Exam Simulation.
  - Active Exam Forms.
- Confidence toggle shown for all variants.
- Timer labels shown only for exam variants.

Exam runner:

- Show timer only when `expiresAt` is present.
- Show feedback immediately for practice variants.
- Hide feedback until submit for exam variants.
- Show confidence prompt only when enabled.

Admin CertDrill page:

- Surface current drill/exam defaults.
- Surface active exam forms.
- Phase 1 admin UI is read-only for these settings and forms.
- Editing certification defaults and exam forms is deferred to a dedicated admin CRUD pass.

## Testing

Required tests:

- Contract validation for test modes/variants.
- DB schema migration checks.
- Selection behavior for quick drill, category drill, exam simulation, exam form, missed review, and weak areas.
- Timer expiry behavior in service.
- Confidence storage on answer.
- UI start page renders Practice and Exam groups.
- UI runner shows timer only for timed exam attempts.
- Translation parity remains enforced.

## Rollout

Existing attempts remain readable.

For existing rows, migration should set:

- `test_mode = feedback_mode` mapped from `practice|exam`.
- `test_variant = category_drill` when `selection_mode=category_focus` and `feedback_mode=practice`.
- `test_variant = quick_drill` when `selection_mode=weighted_random` and `feedback_mode=practice`.
- `test_variant = exam_simulation` when `feedback_mode=exam`.

New attempts should always write both legacy and new fields until a later cleanup removes legacy columns.
