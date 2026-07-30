# Azure Container Apps Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions, Dockerfiles, Azure Bicep infrastructure, and README documentation for deploying the monorepo to Azure Container Apps.

**Architecture:** Port the proven deployment structure from the reference repository, replacing project-specific defaults and keeping PostgreSQL external. Build and deploy API, web, and admin as separate Azure Container Apps.

**Tech Stack:** GitHub Actions, Docker, Bun, Hono, Next.js, Azure Bicep, Azure Container Apps, Azure Container Registry, Azure Database for PostgreSQL Flexible Server.

---

### Task 1: Add Container Build Files

**Files:**
- Create: `.dockerignore`
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/admin/Dockerfile`

- [x] Add `.dockerignore` entries for git metadata, workflow metadata, local worktrees, node modules, Next.js build output, coverage, reports, runtime logs, local storage, env files, and logs.
- [x] Add API Dockerfile using `node:24-slim`, Bun `1.3.9`, workspace package manifest copy, `bun install --frozen-lockfile`, API/package source copy, port `8787`, and `bun --cwd apps/api src/server.ts`.
- [x] Add web Dockerfile using build args for `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_APP_URL`, `NEXT_PUBLIC_APP_NAME`, and `NEXT_PUBLIC_API_URL`, then `bun run --cwd apps/web build` and `bun run --cwd apps/web start` on port `3100`.
- [x] Add admin Dockerfile using build args for `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_MAIN_APP_URL`, then `bun run --cwd apps/admin build` and `bun run --cwd apps/admin start` on port `3101`.
- [x] Verify with `docker build --check` for all three Dockerfiles.

### Task 2: Add Azure Bicep Infrastructure

**Files:**
- Create: `infra/main.bicep`
- Create: `infra/main.resources.bicep`
- Create: `infra/main.parameters.example.json`

- [x] Add subscription-scope Bicep entrypoint that creates/updates resource group `RG-Boilerplate-SingleTenant-Hono` by default and delegates resource creation to `main.resources.bicep`.
- [x] Add resource-group Bicep module for ACR, Log Analytics, Container Apps Environment, and three Container Apps.
- [x] Configure app names from `singletenant-hono`: `singletenant-hono-api`, `singletenant-hono-web`, and `singletenant-hono-admin` subject to Azure name truncation.
- [x] Keep PostgreSQL external and inject `DATABASE_URL` as a Container Apps secret.
- [x] Add example parameters for `germanywestcentral`, `RG-Boilerplate-SingleTenant-Hono`, `singletenant-hono`, and database `boilerplate-singletenant-hono`.
- [x] Verify with `az bicep build --file infra/main.bicep`.

### Task 3: Add GitHub Actions

**Files:**
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/deploy-production-infra.yml`
- Create: `.github/workflows/deploy-production.yml`

- [x] Add CI workflow with PostgreSQL service, Bun `1.3.9`, migration run, `bun run test:ci`, and deployment-scope artifact generation on `main` pushes.
- [x] Add manual production infra workflow with Azure login, validation, Bicep bootstrap, image build/push, migration execution, API secret/env configuration, liveness probe enablement, and URL output.
- [x] Add production app workflow triggered by successful CI or guarded manual dispatch, with changed-app detection, image build/push, migration execution, Container App updates, revision waits, and API health check.
- [x] Use defaults: `germanywestcentral`, `RG-Boilerplate-SingleTenant-Hono`, `singletenant-hono`, `boilerplate-singletenant-hono`, and PostgreSQL firewall RG `RG-Wim-Wymedia`.
- [x] Verify workflow YAML with Python YAML parsing.

### Task 4: Update README

**Files:**
- Modify: `README.md`

- [x] Replace stale root README with current codebase overview.
- [x] Document applications, packages, development commands, environment variables, database workflow, API docs, deployment topology, deployment flow, GitHub variables, GitHub secrets, logging, and security notes.
- [x] Include the exact variables and secrets needed for GitHub Actions.

### Task 5: Final Verification

**Files:**
- No new files.

- [x] Run `bun run db:check`.
- [x] Run `bun run typecheck:api` and document that it currently fails on existing application TypeScript errors unrelated to deployment files.
- [x] Run `git diff --check` for deployment/docs files.
- [x] Search deployment/docs files for leftover reference repo names or old Bun versions.
