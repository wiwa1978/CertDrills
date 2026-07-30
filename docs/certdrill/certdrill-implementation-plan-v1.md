# CertDrill Implementation Plan (Executable Guide)

Reference spec: `certdrill-coding-agent-prompt-v3.md`

This plan is written for a coding agent to execute sequentially with clear
gates and deliverables.

---

## 0) Execution contract

1. Work in small PR-sized increments (one milestone at a time).
2. Keep CertDrill fully namespaced (`modules/certdrill`, API namespace mount).
3. Do not modify boilerplate core unless creating a generic extension seam.
4. Every schema/runtime change must include migration + tests + docs updates in
   the same milestone.
5. Stop at each gate and confirm all acceptance checks before moving on.

---

## 1) Repo bootstrap + module skeleton

### Tasks
1. Create module folders:
   - `apps/api/src/modules/certdrill/`
   - `apps/admin/src/modules/certdrill/`
   - `apps/web/src/modules/certdrill/`
   - `packages/contracts/src/certdrill/`
2. Add feature flag plumbing (`FEATURE_CERTDRILL_ENABLED`) in env parsing.
3. Add API mount points:
   - `/api/certdrill/*`
   - `/api/admin/certdrill/*`
4. Add placeholder route handlers and health endpoint under CertDrill namespace.

### Deliverables
- Module tree exists and compiles.
- CertDrill routes mount only when feature flag is enabled.

### Gate checks
- `bun run typecheck:all`
- `bun run test:ci`

---

## 2) Data model + migrations + contracts

### Tasks
1. Implement schema in `packages/platform-db/src/schema/certdrill.ts`:
   - `Certification`
   - `ExamCategory`
   - `LearnResource`
   - `HandoffRun`
   - `QuestionGenerationJob`
   - `Question` (with `media_assets`)
   - `AnswerOption` (with `media_assets`, `explanation`, `citation_urls`)
   - `ExamAttempt`
   - `ExamAttemptAnswer`
2. Export schema from `schema/index.ts`.
3. Add indexes for analytics performance:
   - `ExamAttempt(certification_id, completed_at, status)`
   - `Question(certification_id, status)`
4. Generate + apply migration.
5. Add shared contracts/types in `packages/contracts/src/certdrill/*`.

### Deliverables
- Migration committed.
- Types compile in API + web + admin.

### Gate checks
- `bun run db:generate -- --name add_certdrill_core`
- `bun run db:check`
- `DATABASE_URL=<...> bun run db:migrate`
- `bun run typecheck:all`

---

## 3) Admin core API (CRUD + validation)

### Tasks
1. Implement admin routes with `@hono/zod-openapi`:
   - certifications/categories/resources/questions/generation-jobs
2. Implement category weight validation (siblings with non-null weights sum to 100).
3. Implement question validation:
   - exactly one correct option
   - explanation required on every option
   - at least one citation URL per option
   - media assets are PNG/JPG only
4. Implement resource ingest endpoint + manual content override endpoint.
5. Implement optional media upload endpoint (`/admin/media/upload`).

### Deliverables
- All admin CRUD routes available under CertDrill namespace.
- Validation errors return 422 with actionable messages.

### Gate checks
- OpenAPI endpoints visible for new routes.
- `bun run test:api`
- `bun run typecheck:api`

---

## 4) Blueprint URL parse/import + full handoff API

### Tasks
1. Add blueprint parse endpoint:
   - `POST /admin/certifications/:id/blueprint/parse`
   - returns parsed tree + warnings + confidence
2. Add blueprint import endpoint:
   - `POST /admin/certifications/:id/blueprint/import`
   - supports `merge` and `replace`
3. Add handoff orchestration endpoints:
   - `POST /admin/certifications/:id/handoff/start`
   - `GET /admin/handoff-runs`
   - `GET /admin/handoff-runs/:id`
   - `POST /admin/handoff-runs/:id/cancel`
4. Persist `blueprint_source_url`, `HandoffRun`, provider metadata.

### Deliverables
- Blueprint URL can create/update category tree with preview-first flow.
- Handoff run object lifecycle works (`pending/running/completed/failed/cancelled`).

### Gate checks
- API tests for parse/import happy path + failure path.
- `bun run test:api`

---

## 5) Queue provider abstraction + orchestration runtime

### Tasks
1. Implement `JobQueueProvider` interface + factory (`QUEUE_PROVIDER`).
2. Implement Inngest provider (default).
3. Implement pg-boss provider (fallback).
4. Ensure shared worker entrypoint (`runGenerationJob(jobId)`) is provider-agnostic.
5. Store `provider`, `provider_run_id`, `provider_run_url` on jobs/handoff runs.

### Deliverables
- Switching queue provider is env-only.
- Admin can deep-link to run URL when available (Inngest).

### Gate checks
- Integration tests for provider factory resolution.
- One end-to-end dry run with Inngest and one with pg-boss in local/dev mode.

---

## 6) LLM generation pipeline (Azure AI Foundry)

### Tasks
1. Add Foundry client utility and model catalog (`FOUNDRY_MODELS`).
2. Implement generation prompt + JSON schema with:
   - per-option explanation
   - per-option citation URLs
   - optional media assets (question + option)
3. Validate and normalize model output before DB insert.
4. Insert generated drafts with traceability (`generation_job_id`, source refs).
5. Implement retries + partial success handling for batch generation.

### Deliverables
- Generation jobs produce draft question banks reliably.
- Bad items are skipped with warnings; fatal errors mark job failed.

### Gate checks
- `bun run test:api`
- unit tests for validation/normalization functions

---

## 7) Admin UI implementation

### Tasks
1. Build `/admin` dashboard:
   - KPI cards
   - recent jobs
   - analytics widgets/charts
2. Build `/admin/analytics` deep-dive dashboard + filters.
3. Build certification flows:
   - list + create
   - detail tabs (Blueprint/Resources/Generate/Questions)
4. Blueprint tab:
   - URL parse preview
   - import merge/replace
   - full handoff start
5. Questions editor:
   - option editing
   - explanation/citation editing
   - image attachments (question + options)
   - live preview
6. Generation job review queue page.
7. Handoff runs list/detail pages with run progress and links.

### Deliverables
- Full admin operation without direct DB/manual scripts.

### Gate checks
- `bun run test:admin`
- `bun run typecheck:admin`

---

## 8) User API + exam engine

### Tasks
1. Implement user endpoints:
   - certifications + categories
   - create attempt
   - answer question
   - submit attempt
   - review attempt
   - attempt history
2. Implement selection modes:
   - category_focus
   - weighted_random with largest remainder + backfill warnings
3. Include media assets in payloads where required.
4. Include per-option rationale + citation links in review responses.

### Deliverables
- Exam engine works for both practice and exam modes.
- Review output is complete and evidence-linked.

### Gate checks
- `bun run test:api`
- unit tests for allocation/backfill algorithm

---

## 9) User UI implementation (reference-accurate)

### Tasks
1. Implement shared visual components:
   - `StampBox`, `TickRuler`, `OptionButton`, `ExplainBox`, `CategoryTag`
2. Apply reference design tokens and blueprint grid.
3. Build pages:
   - `/exams`
   - `/exams/[certId]/start`
   - `/exams/[attemptId]`
   - `/exams/[attemptId]/results`
   - `/profile/attempts`
4. Practice mode UI:
   - show selected-option rationale + citations
   - show correct-option rationale + citations
5. Review/results:
   - show correct/incorrect explanations
   - show evidence links
   - render question/option images

### Deliverables
- UI behavior matches reference style and product requirements.

### Gate checks
- `bun run test:web`
- `bun run typecheck:web`

---

## 10) Analytics backend + frontend completion

### Tasks
1. Implement analytics aggregations:
   - overview KPIs
   - time series (attempts, avg score, pass/fail)
   - certification summary
   - score distribution
   - category and difficulty performance
2. Optimize queries and validate index usage.
3. Wire charts/tables with date-range filters in admin UI.

### Deliverables
- “Usual statistics” dashboard usable by admins.

### Gate checks
- API response snapshot tests for analytics routes.
- Admin UI chart render tests/smoke checks.

---

## 11) Hardening + readiness

### Tasks
1. Add error boundaries and actionable error states (ingest failures, parse confidence low, run failures).
2. Add rate-limit protections for generation/handoff endpoints.
3. Add observability:
   - logs for handoff lifecycle
   - run IDs surfaced in UI
4. Verify feature-flag off path (module disabled).
5. Update `PROGRESS.md` with final status and known follow-ups.

### Final gate
- `bun run test:ci`
- Manual smoke pass:
  1. create certification
  2. parse/import blueprint URL
  3. start full handoff
  4. review drafts, edit, publish
  5. take exam in practice mode
  6. submit and review rationale + citation links + images
  7. verify analytics updates

---

## Dependency order (must follow)

1. Module skeleton
2. Schema + migrations + contracts
3. Admin core API
4. Blueprint parse/import + handoff API
5. Queue abstraction + providers
6. LLM generation pipeline
7. Admin UI
8. User API + exam engine
9. User UI
10. Analytics completion
11. Hardening

---

## Suggested commit slicing

1. `feat(certdrill): scaffold namespaced module mounts`
2. `feat(certdrill): add schema and migrations`
3. `feat(certdrill): admin core routes and validations`
4. `feat(certdrill): blueprint parse/import and handoff run APIs`
5. `feat(certdrill): queue provider abstraction with inngest + pgboss adapters`
6. `feat(certdrill): foundry generation worker and draft persistence`
7. `feat(certdrill): admin certification and question management UI`
8. `feat(certdrill): user exam engine and attempt review APIs`
9. `feat(certdrill): user exam UI with reference styling`
10. `feat(certdrill): admin analytics dashboard and aggregations`
11. `chore(certdrill): hardening, docs, and final CI cleanup`

