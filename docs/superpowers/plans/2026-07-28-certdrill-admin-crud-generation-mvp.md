# CertDrill Admin CRUD And Generation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-production CertDrill admin MVP for managing certifications, categories, exam forms, questions, and mock/manual question generation.

**Architecture:** Build on the existing CertDrill schema and API foundation. Keep the backend generation provider as a deterministic mock/manual generator for now so the UI and review flow work without Azure Foundry/Inngest. Keep all code namespaced under CertDrill paths.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/PostgreSQL, Zod contracts, Next.js App Router, shadcn/Tailwind, Vitest.

---

## Scope

Included:

- Admin API routes for certifications, categories, questions, exam forms, resources, and generation jobs.
- Mock generation backend that creates draft questions from admin-provided prompt/topic and selected category.
- Admin UI page `/admin/certdrill` with tabs for Certifications, Categories, Questions, Exam Forms, Resources, and Generate.
- Read-only/edit forms sufficient for non-prod management.
- Tests for route delegation and critical validation.

Deferred:

- Azure Foundry real LLM integration.
- Inngest/pg-boss orchestration.
- Blueprint URL parser.
- File/media uploads.
- Rich drag/drop question ordering.

## Tasks

### Task 1: Admin API Contracts And Service

**Files:**
- Create/modify: `apps/api/src/modules/certdrill/admin-service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Test: `apps/api/tests/modules/certdrill/admin-service.test.ts`
- Test: `apps/api/tests/certdrill.admin.routes.test.ts`

Steps:

- [ ] Add tests for certification create/list/update.
- [ ] Add tests for category create/list/update with sibling weight validation.
- [ ] Add tests for question create/update/publish validation.
- [ ] Add tests for exam form create/list/update.
- [ ] Add tests for mock generation job creating draft questions.
- [ ] Implement `createCertDrillAdminService({ db })` with the methods covered above.
- [ ] Mount admin routes under existing `/api/admin/certdrill` router.
- [ ] Run `bun run --cwd apps/api test tests/modules/certdrill/admin-service.test.ts tests/certdrill.admin.routes.test.ts`.
- [ ] Run `bun run --cwd apps/api typecheck`.

### Task 2: Admin API Client Helpers

**Files:**
- Create/modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Create: `apps/admin/tests/lib/certdrill-admin-api.test.ts`

Steps:

- [ ] Add tests for server helper paths and payloads.
- [ ] Implement helpers for certifications, categories, questions, exam forms, resources, and generation.
- [ ] Run `bun run --cwd apps/admin test tests/lib/certdrill-admin-api.test.ts`.
- [ ] Run `bun run --cwd apps/admin typecheck`.

### Task 3: Admin Management UI

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Create: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Create: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

Steps:

- [ ] Extend existing copy test to assert tabs: Certifications, Categories, Questions, Exam Forms, Resources, Generate.
- [ ] Add server actions for create/update operations using admin API helpers.
- [ ] Implement tabbed page with forms and tables:
  - Certifications: create/update active/default counts/timer.
  - Categories: create/update code/name/weight/drill count.
  - Questions: create/update/publish simple multiple-choice questions.
  - Exam Forms: create/update form name/duration/question IDs.
  - Resources: create/list URL/title/content mode placeholders.
  - Generate: mock generation form and draft result list.
- [ ] Run `bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts`.
- [ ] Run `bun run --cwd apps/admin typecheck`.

### Task 4: Final Verification

Steps:

- [ ] Run API focused CertDrill tests.
- [ ] Run admin focused CertDrill tests.
- [ ] Run `bun run typecheck:all`.
- [ ] Run `bun run db:check`.

## Plan Self-Review

This plan intentionally implements a non-prod MVP rather than the full Foundry/Inngest generation system. It provides the admin management surfaces needed to configure and test CertDrill content overnight, while keeping real LLM orchestration as a later dedicated phase.
