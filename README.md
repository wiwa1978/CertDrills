# CertDrills

CertDrills is a certification practice exam platform built as a namespaced module on top of a single-tenant Hono/Next.js/Bun SaaS boilerplate.

The product goal is to manage certification blueprints, source learning resources, generated question banks, practice/exam attempts, answer review, and question-quality feedback. Billing, checkout, purchases, and durable entitlements are intentionally outside the CertDrill module for now so the underlying boilerplate can evolve independently.

## Applications

- `apps/api`: Hono API on port `8877`.
- `apps/web`: user-facing Next.js app on port `3200`.
- `apps/admin`: admin Next.js app on port `3201`.

## Current Scope

Implemented CertDrill foundation:

- Database schema, migrations, and demo seed data for vendors, certifications, categories, questions, answer options, resources, exam forms, attempts, feedback, and review queues.
- Contract schemas under `packages/contracts/src/certdrill`.
- User API namespace under `/api/certdrill`.
- Admin API namespace under `/api/admin/certdrill`.
- Access provider seam that currently treats active enabled certifications as available.
- Category and question validation helpers.
- Stable attempt snapshots, randomized answer option order, answer persistence, resume, scoring, submit, review, and attempt history.
- Practice modes: Quick Drill, Category Drill, Missed Questions, and Weak Areas.
- Exam modes: Exam Simulation and Exam Forms.
- Timers, confidence tracking, readiness summary, spaced review queue, and question feedback/dispute reporting.
- Admin overview at `/admin/certdrill` and certification detail pages at `/admin/certdrill/[certificationId]`.
- Admin CRUD for certifications, categories, questions, exam forms, resources, mock generation, lifecycle/archive controls, feedback resolution, readiness widgets, filters, and source-level validation guidance.

Deferred product areas:

- Real Azure AI Foundry generation runtime.
- Inngest or pg-boss orchestration for long-running generation/import jobs.
- Blueprint URL parser/import flow.
- Media upload/attachment workflow.
- Billing, pricing, cart, checkout, transactional purchases, and durable entitlements.

## Architecture Boundary

CertDrill code should stay isolated in these paths:

- `apps/api/src/modules/certdrill/*`
- `apps/admin/src/modules/certdrill/*`
- `apps/web/src/modules/certdrill/*`
- `packages/contracts/src/certdrill/*`
- `packages/platform-db/src/schema/certdrill.ts`

Do not mix CertDrill logic into billing, payments, vouchers, subscriptions, or other boilerplate service files. The only intended boilerplate seams are route mounting, auth/session access, DB access, migrations, and feature flags.

## Requirements

- Bun `1.3.9` or compatible.
- PostgreSQL database.
- Node-compatible environment for Next.js and Hono tooling.

Install dependencies:

```bash
bun install
```

## Environment Files

Copy and fill the example env files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
```

Minimum local API values:

- `DATABASE_URL`
- `APP_URL`, usually `http://localhost:3200`
- `API_URL`, usually `http://localhost:8877`
- `ADMIN_APP_URL`, usually `http://localhost:3201`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_SECRET`
- `ADMIN_ALLOWLIST`
- `FEATURE_CERTDRILL_ENABLED=true`

The local `.env` files are ignored by Git. Do not upload real secrets.

## Feature Flag

CertDrill pages and routes are expected to run with:

```bash
FEATURE_CERTDRILL_ENABLED=true
```

## Database

The Drizzle schema lives in `packages/platform-db/src/schema`. Migrations live in `packages/platform-db/drizzle`.

Check migration consistency:

```bash
bun run db:check
```

Apply migrations using `apps/api/.env` or an explicit `DATABASE_URL`:

```bash
DRIZZLE_REQUIRE_DATABASE_URL=1 bun run db:migrate
```

Or:

```bash
DATABASE_URL="postgres://user:password@host:5432/database" DRIZZLE_REQUIRE_DATABASE_URL=1 bun run db:migrate
```

Generate a future migration after schema changes:

```bash
bun run db:generate -- --name describe_change
```

## Seed Demo Certifications

After migrations, seed demo CertDrill data:

```bash
bun run --cwd apps/api seed:certdrill
```

This creates demo active certifications, vendors, blueprint categories, published questions, and answer options. It is idempotent by certification code.

Visible CertDrill routes:

- Web catalog: `/exams`
- Web attempt history: `/profile/attempts`
- Admin overview: `/admin/certdrill`
- Admin certification detail: `/admin/certdrill/[certificationId]`

## Run Locally

Run all apps together:

```bash
bun run dev:all
```

Run apps individually:

```bash
bun run dev:api
bun run dev:web
bun run dev:admin
```

Local URLs:

- API: `http://localhost:8877`
- Web app: `http://localhost:3200`
- Admin app: `http://localhost:3201`
- API docs: `http://localhost:8877/api/docs`
- OpenAPI JSON: `http://localhost:8877/openapi.json`

Production-style starts after building the Next.js apps use each app's `start` script:

```bash
bun run --cwd apps/web build
bun run --cwd apps/web start
```

```bash
bun run --cwd apps/admin build
bun run --cwd apps/admin start
```

## Useful Checks

Focused CertDrill API tests:

```bash
bun run --cwd apps/api test tests/certdrill.admin.routes.test.ts tests/certdrill.routes.test.ts tests/modules/certdrill/validation.test.ts tests/modules/certdrill/selection.test.ts tests/modules/certdrill/snapshot.test.ts tests/modules/certdrill/access.test.ts tests/modules/certdrill/service.test.ts tests/modules/certdrill/admin-service.test.ts tests/env.test.ts
```

Translation parity checks:

```bash
bun run --cwd apps/web test tests/messages-parity.test.ts tests/messages-copy.test.ts
bun run --cwd apps/admin test tests/messages-parity.test.ts tests/messages-copy.test.ts
```

Type checks:

```bash
bun run typecheck:packages
bun run --cwd apps/api typecheck
bun run typecheck:all
```

Full API tests:

```bash
bun run test:api
```

Current note: the full API suite may fail on pre-existing admin TOTP expectation tests where `totpRequired` returns `false` while tests expect `true`. The focused CertDrill tests pass.

## Git Hygiene

Ignored files include local environment files, dependency directories, build output, coverage, Playwright reports, runtime logs, and local Superpowers scratch files. Confirm before pushing with:

```bash
git status --ignored
```

## Security Notes

- Never commit real `.env` files or provider secrets.
- Rotate secrets immediately if they are exposed.
- Use GitHub Actions secrets/variables for deployment values.
- Keep CertDrill billing integration behind the access provider seam until the boilerplate transactional billing model is ready.
