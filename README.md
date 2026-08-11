# CertDrills

CertDrills is a certification practice and exam platform built on the production single-tenant Hono/Next.js/Bun SaaS platform.

- `apps/api`: Hono API and backend authority
- `apps/web`: learner-facing Next.js application
- `apps/admin`: certification and question-bank administration

The platform layer owns authentication, billing, payments, email, privacy, operations, and deployment. CertDrill functionality is isolated behind the product composition seams and owns certification blueprints, resources, generated question banks, exam forms, attempts, scoring, review queues, and question feedback.

## Current Status

- Current production boilerplate platform, auth realms, billing, privacy, operational controls, and Azure deployment are retained.
- CertDrill learner routes are mounted under `/api/certdrill`, `/exams`, and `/profile/attempts`.
- CertDrill admin routes are mounted under `/admin/certdrill` and `/admin/questions`.
- Database schema and migration cover certifications, categories, resources, questions, exam forms, attempts, scenarios, feedback, and review queues.
- Azure AI Foundry adapters support blueprint parsing and question/scenario generation when configured.
- Inngest runs pending blueprint, question-generation, and scenario-generation work.
- The default access adapter makes enabled certifications available; durable billing entitlements remain a separate integration decision.

## Applications

### `apps/api`

Hono API on port `8787`. Owns:

- Better Auth server runtime and `/auth/*` routes
- browser session validation and native JWT token flows
- PostgreSQL access through `packages/platform-db`
- billing, discounts, vouchers, notifications, admin, audit, privacy, and operational services
- Dodo Payments checkout, webhook, and reconciliation flows
- email sending through `packages/email-core`
- OpenAPI, API docs, logs, health, readiness, and job routes
- CertDrill product routes, scoring, content ingestion, and AI generation jobs

### `apps/web`

Next.js user-facing client on port `3100`. Owns:

- localized public and authenticated user pages
- Better Auth browser client configuration
- SSR and client calls to API-owned session/data endpoints
- learner catalog, drills, exam attempts, results, readiness, and attempt history

### `apps/admin`

Next.js admin client on port `3101`. Owns:

- localized admin dashboards and workflows
- Better Auth browser client configuration
- SSR and client calls to API-owned admin endpoints
- certification, category, resource, question, scenario, exam-form, feedback, and learner-progress administration

## Packages

```txt
packages/
  auth-client/        # Browser and mobile auth client helpers
  auth-core/          # Server-side auth runtime and middleware
  auth-shared/        # Client-safe shared auth fields, roles, and types
  contracts/          # Shared API contracts and wire types
  email-core/         # API-side email abstractions
  frontend-shared/    # Shared frontend API/query/session helpers
  payments-core/      # API-side payment abstractions
  platform-db/        # Drizzle schema, migrations, and DB access
  module-contracts/   # Product composition interfaces
```

Product-owned code is concentrated in:

```txt
apps/api/src/product/certdrill/
apps/web/src/modules/certdrill/
apps/admin/src/modules/certdrill/
packages/contracts/src/certdrill/
packages/platform-db/src/schema/certdrill.ts
```

## Development

Install dependencies:

```bash
bun install
```

Run individual apps:

```bash
bun run dev:api
bun run dev:web
bun run dev:admin
```

Run the full local stack:

```bash
bun run dev:all
```

Common quality checks:

```bash
bun run test:ci
bun run typecheck:all
bun run test:api
bun run test:web
bun run test:admin
bun run test:packages
```

## Environment

Use these templates:

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/admin/.env.example`

### API Runtime

Required core values:

- `DATABASE_URL`
- `APP_URL`
- `API_URL`
- `ADMIN_APP_URL`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_SECRET`
- `ADMIN_ALLOWLIST`

Production-only required secrets enforced by `apps/api/src/env.ts`:

- `BETTER_AUTH_SECRET`: at least 32 characters
- `JWT_SECRET`: at least 32 characters
- `ADMIN_SECRET`: at least 32 characters
- `BILLING_RECONCILIATION_SECRET`: at least 32 characters

Billing and background execution:

- `PAYMENT_PROVIDER`: defaults to `dodo`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`: verifies Dodo webhook deliveries
- `DODO_PAYMENTS_ENVIRONMENT`: defaults to `test_mode`
- `DODO_CREDITS_BRAND_ID`
- `DODO_SUBSCRIPTIONS_BRAND_ID`
- `DODO_TRANSACTIONS_BRAND_ID`
- `BILLING_RECONCILIATION_SECRET`: bearer token for manual reconciliation
- `INNGEST_EVENT_KEY`: authenticates events sent to Inngest
- `INNGEST_SIGNING_KEY`: verifies Inngest function invocations
- `AZURE_AI_FOUNDRY_PROJECT_ENDPOINT`, `AZURE_AI_FOUNDRY_API_KEY`, and `AZURE_AI_FOUNDRY_MODEL`: optional AI content generation

Dodo webhook URLs:

- Preferred: `${PUBLIC_API_URL}/auth/dodopayments/webhooks`
- Transitional compatibility route: `${PUBLIC_API_URL}/payments/webhooks/dodo`

Better Auth is mounted at `/auth` in this repository, not `/api/auth`. Configure
the preferred URL above rather than the `/api/auth/dodopayments/webhooks`
example used by integrations that mount Better Auth elsewhere. Both routes feed
the same idempotent webhook processing and fulfillment pipeline during rollout.

Transaction billing products are one-time purchases. Prices in
`packages/contracts/src/ts/billing/transaction-products.ts` are tax-exclusive
subtotals in minor currency units; Dodo calculates tax and the final total at
checkout. Create the corresponding one-time products in Dodo and place their
provider product IDs in that file's `providerProductIds` entries.

Optional OAuth values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Email:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### Web Runtime

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ADMIN_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_API_URL`

### Admin Runtime

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_MAIN_APP_URL`

## CertDrill Development

Apply migrations, then seed the demo certification catalog:

```bash
bun run db:migrate
bun run --cwd apps/api seed:certdrill
```

Learner routes:

- `/exams`
- `/profile/attempts`

Admin routes:

- `/admin/certdrill`
- `/admin/questions`

## Database

The Drizzle schema lives in `packages/platform-db/src/schema`, and migrations live in `packages/platform-db/drizzle`.

Common commands:

```bash
bun run db:generate -- --name describe_change
bun run db:check
MIGRATION_DATABASE_URL=postgres://migration_owner:password@host:5432/database bun run db:migrate
```

Any PR that adds or changes DB-backed runtime behavior must include the corresponding generated migration. See `packages/platform-db/README.md` for the full workflow.

### Transaction Billing Rollout

1. Create the configured one-time, tax-exclusive products in Dodo and update their IDs in `packages/contracts/src/ts/billing/transaction-products.ts`.
2. Apply database migrations before deploying the application:

```bash
MIGRATION_DATABASE_URL=postgres://migration_owner:password@host:5432/database bun run db:migrate
```

3. Deploy while Dodo still targets `${PUBLIC_API_URL}/payments/webhooks/dodo`.
4. Confirm `POST ${PUBLIC_API_URL}/auth/dodopayments/webhooks` rejects an unsigned request with a verification error rather than `404`.
5. Change the Dodo webhook URL to `${PUBLIC_API_URL}/auth/dodopayments/webhooks`, send a test event, and confirm it appears exactly once in the admin webhook monitor.
6. Keep the compatibility endpoint available during the transition; remove it only in a separately approved cleanup.

## API Documentation

The API serves its own documentation:

- OpenAPI JSON: `/openapi.json` and `/api/openapi.json`
- Swagger UI: `/api/docs`
- Scalar docs: `/docs`

API versioning policy:

- current runtime routes remain unversioned while contract hardening continues
- `/api/v1` is reserved as the canonical stable prefix for generated SDKs and native clients
- unversioned routes should become temporary compatibility aliases once `/api/v1` is mounted

## Azure Deployment

Deployment files are included for GitHub Actions and Azure:

- `.github/workflows/test.yml`: CI on PRs and pushes to `main`
- `.github/workflows/deploy-production-infra.yml`: manual Azure infra/bootstrap deployment
- `.github/workflows/deploy-production.yml`: production app deployment after successful CI, or manual bypass with confirmation
- `infra/main.bicep` and `infra/main.resources.bicep`: Azure resources
- `infra/main.parameters.example.json`: example Bicep parameters
- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/admin/Dockerfile`: app images
- [`docs/operations/production-recovery.md`](docs/operations/production-recovery.md): executable production recovery, rollback, restore, rotation, and verification runbooks

The Azure topology is:

- one Azure Container Registry
- one Azure Container Apps Environment
- one Log Analytics workspace
- three separate Azure Container Apps:
- API: `${APP_NAME}-api`, port `8787`
- web: `${APP_NAME}-web`, port `3100`
- admin: `${APP_NAME}-admin`, port `3101`
- external PostgreSQL, managed outside this Bicep stack

Default deployment values:

- `AZURE_LOCATION`: `germanywestcentral`
- `AZURE_RESOURCE_GROUP_NAME`: `RG-CertDrills`
- `AZURE_ENVIRONMENT_NAME`: `production`
- `APP_NAME`: `certdrills`
- `NEXT_PUBLIC_APP_NAME`: `CertDrills`
- `NEXT_PUBLIC_ADMIN_APP_NAME`: `CertDrills Admin`
- `POSTGRES_DATABASE_NAME`: `certdrills`
- `POSTGRES_FIREWALL_RESOURCE_GROUP_NAME`: `RG-Wim-Wymedia`

The workflows use Azure Container Apps generated HTTPS FQDNs for `APP_URL`, `API_URL`, `ADMIN_APP_URL`, and the Next.js public URL build args.

### GitHub Repository Variables

Required. The Azure identity values may be configured as repository variables or as variables on the protected `production` environment:

- `AZURE_CLIENT_ID`: Microsoft Entra application (service principal) client ID used by GitHub OIDC
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TENANT_ID`
- `POSTGRES_SERVER_FQDN`: PostgreSQL host name without port, for example `pgwimwymedia.postgres.database.azure.com`
- `POSTGRES_ADMIN_LOGIN`
- `POSTGRES_MIGRATION_LOGIN`: schema owner used only by migration commands
- `POSTGRES_RUNTIME_LOGIN`: least-privilege login used only by the API
- `DODO_PAYMENTS_ENVIRONMENT`: required; set to `test_mode` for the current committed test catalog
- `DODO_CREDITS_BRAND_ID`
- `DODO_SUBSCRIPTIONS_BRAND_ID`
- `DODO_TRANSACTIONS_BRAND_ID`

Only the brand variable for the compile-time active billing mode is required; the other mode-specific brand variables may remain unset. Do not switch to `live_mode` until separate live product IDs and live brand IDs are configured.

Optional overrides:

- `AZURE_LOCATION`: defaults to `germanywestcentral`
- `AZURE_RESOURCE_GROUP_NAME`: defaults to `RG-CertDrills`
- `AZURE_ENVIRONMENT_NAME`: defaults to `production`
- `APP_NAME`: defaults to `certdrills`
- `NEXT_PUBLIC_APP_NAME`: defaults to `CertDrills`
- `NEXT_PUBLIC_ADMIN_APP_NAME`: defaults to `CertDrills Admin`
- `PUBLIC_WEB_URL`: public web origin; set to the custom web URL when using custom domains, for example `https://certdrills-web.example.com`
- `PUBLIC_API_URL`: public API origin; set to the custom API URL when using custom domains, for example `https://certdrills-api.example.com`
- `PUBLIC_ADMIN_URL`: public admin origin; set to the custom admin URL when using custom domains
- `COOKIE_DOMAIN`: shared browser cookie domain for custom subdomains, for example `.example.com`
- `BETTER_AUTH_ALLOWED_ORIGINS`: comma-separated extra trusted browser origins, for example `https://certdrills-web.example.com,https://certdrills-admin.example.com`
- `POSTGRES_DATABASE_NAME`: defaults to `certdrills`
- `POSTGRES_FIREWALL_RESOURCE_GROUP_NAME`: defaults to `RG-Wim-Wymedia`

When custom domains are configured on Azure Container Apps, set the `PUBLIC_*` variables before building the web/admin images. The API uses the same public URLs for Better Auth trusted origins, redirects, passkeys, and CORS, while the Next.js apps bake the public API URL into client-side auth calls at build time.

### GitHub Repository Secrets

Database and required API runtime:

- `POSTGRES_ADMIN_PASSWORD`
- `POSTGRES_MIGRATION_PASSWORD`
- `POSTGRES_RUNTIME_PASSWORD`
- `BETTER_AUTH_SECRET`
- `JWT_SECRET`
- `ADMIN_SECRET`
- `ADMIN_ALLOWLIST`
- `BILLING_RECONCILIATION_SECRET`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`

Required Inngest runtime credentials:

- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

Optional Inngest deployment automation:

- `INNGEST_API_KEY`: enables the deployment workflow to resync the deployed `/api/inngest` endpoint through the Inngest REST API. Without it, deployment continues with a warning and an Inngest administrator must use **Sync App** or **Resync App** in Inngest Cloud after function changes.

`POSTGRES_ADMIN_LOGIN` and `POSTGRES_ADMIN_PASSWORD` are used only by the manually triggered infrastructure workflow to run `.github/scripts/provision-postgres-roles.sql`. The external administrator must be allowed to create roles and transfer ownership of existing objects in the application database.

The script creates or updates distinct migration and runtime logins, transfers the `public` schema and existing application objects to the migration owner, and grants the runtime role only database connect, schema usage, table DML, and sequence usage/read access. Migration-owner default privileges apply the same runtime grants to future tables and sequences.

The routine deployment workflow receives only the migration credential. The API receives only `DATABASE_URL` through the `database-url` Container App secret built from the runtime credential. Do not reuse a login or password across these roles.

Optional email:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional OAuth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_GITHUB_CLIENT_ID`
- `OAUTH_GITHUB_CLIENT_SECRET`

GitHub does not allow repository secret names starting with `GITHUB_`. The workflows therefore use `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_CLIENT_SECRET` as GitHub secret names, then map them into the API container as runtime `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### One-Time Azure OIDC and RBAC Setup

Before running either production workflow, an Azure administrator must prepare the GitHub deployment identity:

1. Create or select a Microsoft Entra application and its service principal. Add a federated identity credential with issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, and subject `repo:<owner>/<repository>:environment:production`.
2. Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` as GitHub repository variables or protected `production` environment variables. No Azure client secret is used.
3. Grant the service principal only the Azure permissions required to create/update the subscription deployment and target resource group, push images to the registry, create the scoped `AcrPull` assignments, and manage the configured PostgreSQL firewall. For a first deployment that creates the resource group, one possible bootstrap is `Contributor` plus `Role Based Access Control Administrator` at the deployment subscription, with separate access to an external PostgreSQL resource group when applicable; scope these grants down after bootstrap and assign `AcrPush` on the registry if the retained role does not allow image pushes.
4. Keep the GitHub `production` environment protection rules enabled and authorize the intended branches/reviewers before dispatching a workflow.

The Bicep deployment disables the ACR admin account. It declares one user-assigned managed identity per Container App, configures that identity for registry pulls, and grants it `AcrPull` only on the deployed registry. Verify these resources and assignments after the infrastructure workflow completes; this repository does not assert that the external OIDC credential or deployment-principal RBAC already exists.

### Deployment Flow

1. Configure the repository variables and secrets above.
2. Run `Azure Production Infra` manually from GitHub Actions to create or update Azure resources and deploy initial images.
3. Push to `main`; `CI` runs `bun run test:ci` and uploads deployment-scope metadata.
4. `Azure App Deploy to Production` builds changed app images, pushes them to ACR, runs migrations when needed, updates the Container Apps, waits for revisions, and checks API health.

The infra workflow only uses placeholder images for first-time bootstrap. If all three Container Apps already exist, it resolves existing resources and avoids replacing production apps with placeholders.

## Logging and Observability

- API logs default to stdout in production for platform collection.
- Local file logging is available through `LOG_FILE_PATH`.
- Browser logs are forwarded to the API via `POST /logs/client`.
- Azure deployment sends Container App logs to Log Analytics.

## Security Notes

- Never commit real secrets.
- Keep `.env` files local or managed by deployment secrets.
- Rotate secrets immediately if exposed.
- Production secrets must be non-placeholder values with sufficient length where enforced by `apps/api/src/env.ts`.
