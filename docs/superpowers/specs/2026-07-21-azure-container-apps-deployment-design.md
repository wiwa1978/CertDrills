# Azure Container Apps Deployment Design

## Goal

Update the repository documentation and add deployment infrastructure for the existing single-tenant Hono/Next.js monorepo.

## Scope

- Refresh the root `README.md` so it reflects the current codebase structure, environment model, database workflow, API docs, logging, and deployment process.
- Add GitHub Actions for CI, initial Azure infrastructure deployment, and production app deployment.
- Add Azure Bicep infrastructure for Azure Container Registry, Azure Container Apps Environment, Log Analytics, and three Container Apps.
- Add Dockerfiles for `apps/api`, `apps/web`, and `apps/admin`.

## Architecture

The deployment uses three independent containerized apps. The API container listens on port `8787`; the web app listens on port `3100`; the admin app listens on port `3101`. Azure Container Apps generated HTTPS FQDNs are used for the app URLs unless a later change adds custom domains.

PostgreSQL remains external to the Bicep stack. Workflows receive the PostgreSQL FQDN, login, database name, and password from GitHub variables/secrets, temporarily allow the GitHub Actions runner IP through the PostgreSQL firewall for migrations, then remove the rule.

## Azure Defaults

- Resource group: `RG-Boilerplate-SingleTenant-Hono`
- Location: `germanywestcentral`
- App name: `singletenant-hono`
- Database name: `boilerplate-singletenant-hono`
- PostgreSQL firewall resource group: `RG-Wim-Wymedia`

## GitHub Actions

- `CI` runs on pull requests and pushes to `main`, starts PostgreSQL, runs migrations, and executes `bun run test:ci`.
- `Azure Production Infra` is manual and bootstraps or reconciles Azure resources, builds/pushes all images, runs migrations, configures API secrets/env vars, and enables the API liveness probe.
- `Azure App Deploy to Production` runs after successful `CI` on `main`, deploys only changed apps, runs migrations when API/shared code changes, and supports a guarded manual bypass.

## GitHub Configuration

The README is the source of truth for required GitHub variables and secrets. GitHub OAuth secrets use `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_CLIENT_SECRET` because GitHub does not allow repository secrets beginning with `GITHUB_`.
