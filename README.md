# CertDrills

CertDrills is a certification practice exam platform built as a namespaced module on top of a single-tenant Hono/Next.js/Bun SaaS boilerplate.

The product goal is to manage certification blueprints, source learning resources, generated question banks, practice/exam attempts, answer review, and question-quality feedback. Billing, checkout, purchases, and durable entitlements are intentionally outside the CertDrill module for now so the underlying boilerplate can evolve independently.

## Applications

- `apps/api`: Hono API on port `8877`.
- `apps/web`: user-facing Next.js app on port `3200`.
- `apps/admin`: admin Next.js app on port `3201`.

## Azure Production Deployment

CertDrills production runs as three Azure Container Apps:

- `certdrills-api` on port `8877` for the Hono API.
- `certdrills-web` on port `3200` for the learner app.
- `certdrills-admin` on port `3201` for the admin app.

The Azure infrastructure is Bicep-managed and provisions ACR, Log Analytics, and the Container Apps environment. The production app stack uses the external PostgreSQL server `pgwimwymedia` in `RG-Wim-Wymedia`. The workflow does not create the PostgreSQL database.

### Prerequisites

- Manually create the `certdrills` database in PostgreSQL before the first deployment.
- Create the GitHub `production` environment.
- Configure the production variables and secrets below.
- Leave `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, and `PUBLIC_ADMIN_URL` unset for bootstrap so Azure-generated URLs can be used first.
- Use the generated Azure Container Apps URLs after infrastructure is created.
- Local development secrets must not be reused in production.

### Production variables

Set these GitHub environment variables with the intended values:

- `AZURE_SUBSCRIPTION_ID`: Azure subscription that owns the deployment.
- `AZURE_TENANT_ID`: tenant used for `azure/login`.
- `AZURE_LOCATION`: `germanywestcentral`.
- `AZURE_RESOURCE_GROUP_NAME`: `RG-CertDrills`.
- `AZURE_ENVIRONMENT_NAME`: `production`.
- `APP_NAME`: `certdrills`.
- `NEXT_PUBLIC_APP_NAME`: `CertDrills`.
- `NEXT_PUBLIC_ADMIN_APP_NAME`: `CertDrills Admin`.
- `POSTGRES_SERVER_FQDN`: FQDN of the external PostgreSQL server.
- `POSTGRES_ADMIN_LOGIN`: admin login for the PostgreSQL server.
- `POSTGRES_DATABASE_NAME`: `certdrills`.
- `POSTGRES_FIREWALL_RESOURCE_GROUP_NAME`: `RG-Wim-Wymedia`.

### Production secrets

Set these GitHub environment secrets:

- `ADMIN_ALLOWLIST`
- `ADMIN_SECRET`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `BILLING_RECONCILIATION_SECRET`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JOBS_SECRET_KEY`
- `JWT_SECRET`
- `OAUTH_GITHUB_CLIENT_ID`
- `OAUTH_GITHUB_CLIENT_SECRET`
- `POSTGRES_ADMIN_PASSWORD`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### Deployment flow

Use `.github/workflows/deploy-production-infra.yml` for the first deployment. Run it manually to validate the production settings, provision the Azure resources, create the initial Container Apps, and output the Generated Azure Container Apps URLs.

After CI passes on `main`, `.github/workflows/deploy-production.yml` handles subsequent app deployments automatically. It can also be run manually with `confirm_ci_bypass=deploy-without-ci`, detects which apps changed, reuses the existing infrastructure, and updates only the deployed images. It runs any required migrations and waits for healthy revisions. Runtime secret or environment-variable changes require rerunning `.github/workflows/deploy-production-infra.yml`.

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
