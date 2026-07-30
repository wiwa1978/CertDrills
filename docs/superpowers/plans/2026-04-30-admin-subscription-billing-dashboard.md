# Admin Subscription Billing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/billing` render subscription billing stats, plan distribution, subscriptions, and events when billing mode is `subscriptions`.

**Architecture:** Reuse the Hono API's local subscription tables and adapt the working reference dashboard from `Boilerplate-SingleTenant`. The admin page branches on application config and only calls endpoints for the active billing mode.

**Tech Stack:** Hono API, Drizzle, Next.js 16 admin app, React server/client components, Vitest, TypeScript.

---

### Task 1: API Contract And Routes

**Files:**
- Modify: `packages/contracts/src/wire/billing/responses.ts`
- Modify: `packages/contracts/src/ts/api/routes.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Test: `apps/api/tests/modules/billing/billing-mode.test.ts`

- [ ] Add contract types for `SubscriptionPlanDistributionPoint` and `SubscriptionEvent`.
- [ ] Add route constants for `/admin/billing/subscription-plan-distribution` and `/admin/billing/subscription-events`.
- [ ] Add admin API routes guarded by `ensureSubscriptionBillingEnabled()`.
- [ ] Query local `userSubscriptions` for plan counts and local `subscriptionEvents` for recent events.
- [ ] Run API billing tests.

### Task 2: Admin API And Service Helpers

**Files:**
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/admin.ts`
- Test: `apps/admin/tests/lib/admin-api.test.ts`
- Test: `apps/admin/tests/lib/admin-services.test.ts`

- [ ] Add API helpers for subscription stats, subscriptions, plan distribution, and events.
- [ ] Add service helpers with empty fallbacks for disabled subscription mode errors.
- [ ] Add tests for endpoint URLs and fallback behavior.
- [ ] Run admin lib tests.

### Task 3: Subscription Dashboard UI

**Files:**
- Create: `apps/admin/src/components/layout/backend/admin/billing/subscription-stats-grid.tsx`
- Create: `apps/admin/src/components/layout/backend/admin/billing/subscription-plan-distribution.tsx`
- Create: `apps/admin/src/components/layout/backend/admin/billing/subscription-tables.tsx`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/billing/page.tsx`

- [ ] Adapt reference stats grid to admin components and Hono contract types.
- [ ] Adapt reference plan distribution card.
- [ ] Adapt reference subscriptions and events tables.
- [ ] Branch `AdminBillingPage` by `getMyApplicationConfig().billing.mode`.
- [ ] In subscription mode, call only subscription loaders.
- [ ] Run admin typecheck.

### Task 4: Verification And PR

**Files:**
- Verify all modified code.

- [ ] Run targeted API tests.
- [ ] Run targeted admin tests.
- [ ] Run admin typecheck.
- [ ] Run API typecheck if API code changed.
- [ ] Check git diff for unrelated changes.
- [ ] Commit the implementation.
- [ ] Push branch and create PR with summary and test evidence.
