# CertDrill Core Exam Platform Design

## Goal

Build CertDrill as a certification practice exam module on top of the existing
single-tenant Hono/Next/Bun boilerplate. CertDrill owns exam content,
question-generation operations, attempts, results, and review. It does not own
billing, pricing, checkout, credits, subscriptions, or transactional purchases.

The implementation must stay namespaced so a future boilerplate update can be
merged with minimal conflicts.

## Scope

In scope:

- Certification catalog.
- Blueprint/category management.
- Learn resources and ingestion.
- LLM question generation jobs and handoff runs.
- Question and answer editing, validation, draft review, and publishing.
- User exam attempts in practice and exam-simulation modes.
- Category-focus and blueprint-weighted random selection.
- Stable attempt review from stored snapshots.
- Admin analytics for attempts, scores, question pools, categories, and jobs.
- User catalog split between all exams and purchased exams.

Out of scope for this pass:

- Billing, credits, subscriptions, transactional purchases, pricing, refunds,
  checkout, carts, and payment provider changes.
- CertDrill-owned purchase or entitlement tables.
- Expiring promotional credit lots.
- Any change to billing, payments, vouchers, or subscription boilerplate logic.

## Boilerplate Boundary

CertDrill must be implemented as a namespaced feature module. The expected
module locations are:

- `apps/api/src/modules/certdrill/*`
- `apps/admin/src/modules/certdrill/*`
- `apps/web/src/modules/certdrill/*`
- `packages/contracts/src/certdrill/*`
- `packages/platform-db/src/schema/certdrill.ts`

Allowed boilerplate integration points:

- Route mounting under `/api/certdrill/*` and `/api/admin/certdrill/*`.
- Existing auth/session user ID lookup.
- Existing admin/user role guards.
- Existing DB connection and migration tooling.
- Optional feature flag `FEATURE_CERTDRILL_ENABLED`.

Do not mix CertDrill logic into billing, payments, vouchers, subscriptions, or
generic boilerplate services. If a core edit is unavoidable, keep it to a small
generic mount or feature-flag seam.

## Access Boundary

The user UI needs to distinguish purchased exams from exams available to
purchase, but CertDrill should not implement the purchase mechanism.

Add a small internal access seam:

```ts
type CertificationAccessStatus = "not_purchased" | "purchased";

interface CertificationAccessProvider {
  getAccessForUser(
    userId: string,
    certificationIds: string[],
  ): Promise<Map<string, CertificationAccessStatus>>;

  assertCanStartAttempt(userId: string, certificationId: string): Promise<void>;
}
```

Initial behavior treats all active exams as purchased by default so CertDrill can
be built and tested independently from billing. Tests and UI component stories
must be able to inject both `purchased` and `not_purchased` states so the
catalog still supports `Purchase` vs `View` rendering before core billing lands.
When the boilerplate later supports transactional billing, only this provider
should change.

The enforcement point is `POST /api/certdrill/exams`. Catalog access state is
informational and must not be the only protection.

## User Experience

The user app has two certification views:

- All exams: every active certification, including exams not yet purchased.
- My exams: certifications with `accessStatus = "purchased"`.

In the all-exams list:

- Purchased exams show `View` or `Start`.
- Not-yet-purchased exams show `Purchase` or `Add to cart`.
- Purchase/cart actions are placeholders or links into future core billing.
- No CertDrill route performs checkout or deducts credits.

Authenticated users who have access can start unlimited attempts for a
certification. Attempts are never consumed, decremented, or expired by CertDrill.

Exam start options:

- Feedback mode: `practice` or `exam`.
- Selection mode: `category_focus` or `weighted_random`.
- Category focus drills selected domains/tasks.
- Weighted random builds an attempt matching top-level category weights.

## Attempt Snapshot Requirement

Every attempt must be reviewable later exactly as it was taken. Starting an
attempt stores an ordered snapshot of all questions and answer options used in
the attempt. Review and scoring use the snapshot, not the current question bank.

This prevents old reviews from changing after admins edit stems, options,
correct answers, explanations, citations, categories, difficulty, or media.

The snapshot must include, per question:

- Question ID.
- Stem.
- Media assets.
- Category ID, code, and name.
- Difficulty.
- Ordered options.
- Option IDs.
- Option text.
- Option media assets.
- `is_correct`.
- Explanation.
- Citation URLs.

`ExamAttemptAnswer` stores the selected option, correctness, and answer
timestamp. It should tie back to the snapshot item or snapshot option identity
so review remains stable.

## Data Model

Add CertDrill tables in `packages/platform-db/src/schema/certdrill.ts`.

Core tables:

- `Certification`: catalog metadata only. No price or billing fields.
- `ExamCategory`: hierarchical blueprint domains/tasks with optional weights.
- `LearnResource`: source URLs/content used for generation.
- `QuestionGenerationJob`: async LLM generation job metadata.
- `HandoffRun`: autopilot orchestration run metadata.
- `Question`: question stem, category, difficulty, status, media, provenance.
- `AnswerOption`: option text, correctness, explanation, citations, media.
- `ExamAttempt`: user attempt metadata, modes, score, status, question IDs, and
  snapshot storage.
- `ExamAttemptAnswer`: selected answers and correctness.

Snapshot storage can be implemented as either:

- A JSONB `question_snapshot_json` column on `ExamAttempt`, or
- Normalized attempt-question and attempt-option snapshot tables.

Prefer the smallest implementation that preserves stable review and supports
efficient scoring. If JSONB is used initially, keep the shape versioned with a
`snapshot_version` field.

Indexes required for analytics:

- `ExamAttempt(certification_id, completed_at, status)`.
- `Question(certification_id, status)`.

## API Design

Use `@hono/zod-openapi` for all CertDrill routes.

User routes:

- `GET /api/certdrill/certifications`: all active certifications with published
  question counts and `accessStatus`.
- `GET /api/certdrill/my-certifications`: purchased certifications only.
- `GET /api/certdrill/certifications/:id/categories`: category tree with
  published question counts.
- `POST /api/certdrill/exams`: validates access, selects questions, creates an
  attempt, stores the snapshot, and returns questions without correctness or
  explanations.
- `POST /api/certdrill/exams/:id/answers`: upserts the selected answer. In
  practice mode, returns selected-option and correct-option feedback from the
  snapshot.
- `POST /api/certdrill/exams/:id/submit`: validates all questions are answered,
  computes score and category breakdown from persisted answers/snapshot, and
  marks the attempt completed.
- `GET /api/certdrill/exams/:id/review`: returns completed-attempt review from
  the snapshot.
- `GET /api/certdrill/users/me/attempts`: attempt history.

Admin routes:

- Certification CRUD.
- Category CRUD with sibling weight validation.
- Blueprint parse/import.
- Learn resource CRUD, ingest, and manual content override.
- Generation job CRUD/status/review.
- Handoff run start/list/detail/cancel.
- Question CRUD, publish, bulk publish, and bulk archive.
- LLM model list.
- Admin analytics overview and certification detail.

No CertDrill admin or user route should implement billing, pricing, carts,
checkout, credit consumption, subscriptions, or refunds.

## Question Selection

Category-focus mode:

- Expand selected categories to include descendants.
- Draw published questions from those subtrees.
- Shuffle the ordered attempt set.

Weighted-random mode:

- Allocate target question count by top-level category weight.
- Use largest-remainder allocation so the total equals the requested count.
- Draw from each top-level category subtree.
- Backfill shortages from categories with surplus.
- Return warnings if the available published pool is smaller than requested.

The final ordered question list is snapshotted at attempt creation.

## Validation Rules

Category validation:

- Siblings with non-null weights must sum to 100.
- Invalid sums return HTTP 422 with actionable details.

Question validation:

- Exactly one option must be correct.
- Every option must have a non-empty explanation.
- Every option must have at least one citation URL.
- Question and option media assets must be PNG or JPG/JPEG.
- Publish operations must enforce the same validations.

Generation validation:

- Generated model output must be normalized and validated before DB insert.
- Invalid generated items are skipped with warnings.
- Fatal job errors mark the generation job failed.

## UI Visual Language

The UI must implement the visual language from these HTML references using
Tailwind CSS and shadcn/ui primitives:

- `docs/certdrill/saa_c03_domain1_drill.html`
- `docs/certdrill/sdlc_copilot_exam_drill.html`

Do not replace this with a generic shadcn dashboard style.

Design tokens:

- Background: `#0f1720`.
- Panel: `#16212f`.
- Raised panel: `#1c293a`.
- Border: `#2a3b57`.
- Accent: `#e8a33d`.
- Accent dim: `rgba(232, 163, 61, 0.16)`.
- Success: `#4cae7d`.
- Success dim: `rgba(76, 174, 125, 0.14)`.
- Incorrect/destructive: `#d9614f`.
- Incorrect dim: `rgba(217, 97, 79, 0.14)`.
- Foreground: `#e8ecf1`.
- Muted foreground: `#7e8ca3`.
- Grid line: `rgba(94, 200, 216, 0.07)`.
- Radius: `0.25rem`.

Fonts:

- Space Grotesk for headings and actions.
- Inter for body text.
- JetBrains Mono for labels, counters, badges, and stamps.

Shared components:

- `StampBox`.
- `TickRuler`.
- `QuestionCounter`.
- `CategoryTag`.
- `OptionButton`.
- `ExplainBox`.
- `ActionButton`.

Use shadcn components for forms, dialogs, tables, selects, and tabs where useful,
but theme them to this visual system. Admin question editor and generation review
must reuse the same exam preview components as the user exam flow.

## Admin Experience

Admin pages include:

- Dashboard with KPIs, recent jobs, and analytics widgets.
- Certification list and create/edit flows.
- Certification detail tabs for blueprint, resources, generate, and questions.
- Question editor with live user-preview panel.
- Generation job list and draft review queue.
- Handoff run list/detail pages.
- Analytics dashboard and certification drill-down.

Admin UX should allow full content operation without direct database scripts:

- Create certification.
- Parse/import blueprint URL.
- Add/ingest resources.
- Generate draft questions.
- Review/edit/publish questions.
- Inspect attempts and analytics.

## Testing

Required tests:

- Category weight validation.
- Question validation.
- Weighted-random allocation and backfill warnings.
- Attempt snapshot creation.
- Stable review after source question changes.
- Practice feedback from snapshot.
- Exam submit scoring and category breakdown.
- Access seam allows/blocks `POST /api/certdrill/exams` based on provider
  result.
- Feature flag off path.

Verification commands should include the relevant app/package checks after each
implementation slice:

- `bun run test:api` or focused API test command used by the repo.
- `bun run test:web` when web UI changes.
- `bun run test:admin` when admin UI changes.
- `bun run typecheck:all`.
- `bun run db:check` when schema or migrations change.

## Open Decisions

The purchase/cart integration target is intentionally deferred until the
boilerplate transactional billing model exists. CertDrill will use the access
provider seam when that model is ready. Until then, production and development
default to all active certifications being purchased, while tests and component
fixtures cover the `not_purchased` state.
