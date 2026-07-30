# Billing Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable credit-vs-subscription billing mode support to the Hono API while preserving existing credit billing behavior.

**Architecture:** Add a central application billing mode config and small guard/helper modules, then wire mode decisions into checkout, Dodo product registration, webhooks, routes, contracts, and DB schema. Subscription billing is implemented as a parallel path with its own tables and service helpers; credit billing remains unchanged except for mode guards.

**Tech Stack:** Bun, TypeScript, Hono, Zod, Drizzle ORM, PostgreSQL, Better Auth Dodo Payments plugin, Vitest.

---

## File Structure

- Create `apps/api/src/config/application.ts`: authoritative billing mode and feature flags.
- Create `apps/api/src/lib/billing-mode.ts`: billing mode read helpers.
- Create `apps/api/src/lib/feature-guards.ts`: mode and feature guard errors.
- Create `apps/api/src/lib/dodo-billing-products.ts`: Dodo product selection by mode.
- Modify `apps/api/src/config/billing.ts`: add `subscriptionPlans` alongside existing credit config.
- Modify `packages/platform-db/src/schema/billing.ts`: add subscription tables and relations.
- Modify `packages/platform-db/drizzle/*`: add generated migration for subscription tables.
- Modify `packages/contracts/src/wire/payments/requests.ts`: make checkout request mode-aware.
- Modify `packages/contracts/src/wire/billing/responses.ts`: add subscription response schemas.
- Modify `apps/api/src/bootstrap.ts`: register mode-aware Dodo products and inject subscription handler.
- Create `apps/api/src/modules/billing/subscription-service.ts`: subscription persistence and reporting helpers.
- Create `apps/api/src/modules/billing/subscription-webhooks.ts`: Dodo subscription webhook normalization and handling.
- Modify `apps/api/src/modules/billing/payment-event-handler.ts`: route credit and subscription events through mode guards.
- Modify `apps/api/src/routes/payments.ts`: mode-aware checkout.
- Modify `apps/api/src/routes/me.ts`: guard credit endpoints and add current subscription endpoint.
- Modify `apps/api/src/routes/admin.ts`: guard credit admin endpoints and add subscription admin endpoints.
- Add tests under `apps/api/tests` for helpers, webhook handling, and route/service behavior.

## Tasks

### Task 1: Billing Mode Helpers

**Files:**
- Create: `apps/api/src/config/application.ts`
- Create: `apps/api/src/lib/billing-mode.ts`
- Create: `apps/api/src/lib/feature-guards.ts`
- Test: `apps/api/tests/lib/billing-mode.test.ts`

- [ ] Write tests for default mode, helper booleans, and guard errors.
- [ ] Implement the application config with default `credits` mode to preserve current Hono behavior.
- [ ] Implement billing mode helpers and feature guards.
- [ ] Run `bun run --cwd apps/api test apps/api/tests/lib/billing-mode.test.ts` and ensure it passes.

### Task 2: Product Config And Contracts

**Files:**
- Modify: `apps/api/src/config/billing.ts`
- Create: `apps/api/src/lib/dodo-billing-products.ts`
- Modify: `packages/contracts/src/wire/payments/requests.ts`
- Modify: `packages/contracts/src/wire/billing/responses.ts`
- Test: `apps/api/tests/lib/dodo-billing-products.test.ts`

- [ ] Write tests proving product selection returns credit packages for `credits` and subscription plans for `subscriptions`.
- [ ] Add `subscriptionPlans` and `SubscriptionPlan` to billing config.
- [ ] Add Dodo product mapping helper.
- [ ] Extend checkout request schema to accept either `{ billingMode: "credits", packageKey }`, `{ billingMode: "subscriptions", planKey }`, or legacy `{ packageKey }` as credit shorthand for current consumers.
- [ ] Add subscription response schemas and exports.
- [ ] Run targeted product and contract tests.

### Task 3: Subscription Schema And Service

**Files:**
- Modify: `packages/platform-db/src/schema/billing.ts`
- Modify: `packages/platform-db/drizzle/*`
- Create: `apps/api/src/modules/billing/subscription-service.ts`
- Test: `apps/api/tests/modules/billing/subscription-service.test.ts`

- [ ] Write tests for status normalization, active status detection, event recording, subscription upsert input, subscription listing, and recurring revenue calculation.
- [ ] Add `userSubscriptions`, `subscriptionEvents`, `SubscriptionStatus`, and relations to platform DB schema.
- [ ] Generate a Drizzle migration with `bun run db:generate`.
- [ ] Implement subscription service functions with dependency-injected `db`.
- [ ] Run targeted subscription service tests.

### Task 4: Subscription Webhooks And Payment Event Routing

**Files:**
- Create: `apps/api/src/modules/billing/subscription-webhooks.ts`
- Modify: `apps/api/src/modules/billing/payment-event-handler.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Test: `apps/api/tests/modules/billing/subscription-webhooks.test.ts`
- Test: `apps/api/tests/modules/billing/payment-event-handler.test.ts`

- [ ] Write tests for detecting subscription events, mapping statuses, recording/upserting webhook payloads, and rejecting wrong-mode events.
- [ ] Implement Dodo subscription webhook handling.
- [ ] Update payment event handler dependencies to include current mode guards and subscription handling.
- [ ] Update bootstrap to register mode-aware Dodo checkout products.
- [ ] Run targeted webhook tests.

### Task 5: Routes And Admin Subscription Surfaces

**Files:**
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Test: existing API route tests where present, plus targeted service tests if route harness is not practical.

- [ ] Update checkout to choose package or plan based on configured mode and request mode.
- [ ] Add helper handling that maps billing mode guard errors to `400` JSON responses.
- [ ] Guard credit-only user and admin endpoints.
- [ ] Add `/me/subscription`, `/admin/users/:userId/subscription`, `/admin/billing/subscriptions`, and `/admin/billing/subscription-stats`.
- [ ] Run targeted API tests.

### Task 6: Full Verification

**Files:**
- All changed files.

- [ ] Run `bun run --cwd apps/api test`.
- [ ] Run `bun run --cwd apps/api typecheck`.
- [ ] Run `bun run typecheck:packages`.
- [ ] Run `bun run db:check`.
- [ ] If verification fails, fix the smallest cause and rerun the failed command.
