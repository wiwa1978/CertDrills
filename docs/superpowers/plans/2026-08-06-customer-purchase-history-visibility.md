# Customer Purchase History Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter customer purchase histories to completed/refunded outcomes while preserving complete admin and internal payment-attempt records.

**Architecture:** Each customer-facing billing service defines an explicit visible-status tuple and applies it with Drizzle `inArray` at the database query boundary. Transaction list and direct detail share the same predicate; admin/internal queries are untouched.

**Tech Stack:** TypeScript, Drizzle ORM, Hono, Vitest, Bun

---

### Task 1: Filter Credit And Subscription Customer Histories

**Files:**
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/modules/billing/subscription-service.ts`
- Test: `apps/api/tests/modules/billing/service.test.ts`
- Test: `apps/api/tests/modules/billing/subscription-service.test.ts`

- [ ] Add failing tests asserting customer credit/subscription queries use `completed` and `refunded`, exclude `pending` and `failed`, preserve descending date order and limit, and do not alter admin list methods.
- [ ] Run the focused tests and verify they fail because queries filter only by user.
- [ ] Import Drizzle `inArray`, define typed customer-visible status tuples near each service, and combine user/status predicates with `and(...)`.
- [ ] Run focused tests and API typecheck.

### Task 2: Filter Transaction Customer Orders And Details

**Files:**
- Modify: `apps/api/src/modules/billing/transaction-service.ts`
- Test: `apps/api/tests/modules/billing/transaction-service.test.ts`
- Test: `apps/api/tests/app.authz.functional.test.ts`

- [ ] Add failing tests for all transaction statuses: list/detail include `paid`, `partially_refunded`, and `refunded`; hide `pending_payment`, `failed`, and `cancelled`.
- [ ] Add a functional route test proving direct hidden-order lookup returns 404.
- [ ] Define one shared typed visibility tuple/predicate and apply it to both `listOrders` and `getOrder` with user ownership.
- [ ] Verify focused service and route tests pass.

### Task 3: Verify Admin Completeness And Repository

**Files:**
- Modify tests only if an admin regression assertion is missing.

- [ ] Add or retain assertions that admin credit/subscription/payment/order queries do not apply customer-visible status filtering.
- [ ] Run `git diff --check`.
- [ ] Run `bun run test:ci` and require database checks, all typechecks, API/web/admin/shared tests to pass.
- [ ] Review the final diff to confirm no persistence, webhook, reconciliation, finance, or admin query was filtered.
