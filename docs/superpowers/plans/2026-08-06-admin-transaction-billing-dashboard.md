# Admin Transaction Billing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an operational transaction-mode admin dashboard with local order analytics and optional provider enrichment.

**Architecture:** A dedicated API service aggregates local transaction order data for a normalized reporting range and enriches refunds/products/payments through provider finance capabilities without making provider availability mandatory. A typed contract and route feed a purpose-built admin dashboard selected by the existing billing-mode page.

**Tech Stack:** TypeScript, Drizzle ORM, Hono, Zod, Next.js, React, Recharts, TanStack Table, next-intl, Vitest, Bun

---

### Task 1: Transaction Dashboard Contract And Aggregation Service

**Files:**
- Modify: `packages/contracts/src/wire/billing/requests.ts`
- Modify: `packages/contracts/src/wire/billing/responses.ts`
- Modify: `packages/contracts/src/ts/api/routes.ts`
- Create: `apps/api/src/modules/billing/transaction-finance-dashboard-service.ts`
- Create: `apps/api/tests/modules/billing/transaction-finance-dashboard-service.test.ts`

- [ ] Define query filters for range (`7d|30d|90d|12m|custom`), dates, grouping, currency, status, product key, search, and page; default to 30 days and page 1.
- [ ] Define a response contract covering normalized filters, overview totals, revenue/attempt/success series, paginated all/successful order rows with items and user identity, local/provider refunds, product summaries/provider products, and warnings.
- [ ] Write failing aggregation tests for every status, gross/pre-tax/tax/refund math, conversion rate, date grouping, currency/status/product/search filtering, pagination, item batching, and provider failure warnings.
- [ ] Implement local queries with bounded pagination and batched item/user loading; use all local statuses for admin views.
- [ ] Add optional provider `listPayments`, `listRefunds`, and `listProducts` enrichment with independent warning capture.
- [ ] Run focused tests and package/API typechecks.

### Task 2: Admin Endpoint And Client Wiring

**Files:**
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/api/tests/app.functional.test.ts`
- Modify: `packages/contracts/src/ts/api/routes.ts`
- Modify: `apps/admin/src/lib/api/admin.server.ts`
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/admin.ts`

- [ ] Add failing route tests for admin authorization, transaction-mode guard, query validation, and successful typed response.
- [ ] Register the service in bootstrap and expose `GET /admin/billing/transaction-dashboard` behind transaction billing and existing admin middleware.
- [ ] Document the route in OpenAPI.
- [ ] Add typed server/client API helpers and service exports.
- [ ] Run API route tests, contract tests, and API/admin typechecks.

### Task 3: Transaction Admin Dashboard UI

**Files:**
- Create: `apps/admin/src/components/layout/backend/admin/billing/transaction-finance-dashboard.tsx`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/billing/page.tsx`
- Create: `apps/admin/tests/components/transaction-finance-dashboard.test.ts`
- Modify: relevant page tests

- [ ] Write failing component/page tests for transaction-mode selection, six tabs, summary metrics, all-attempt and successful tables, refund/provider warning sections, product summaries, success chart, filters, and pagination.
- [ ] Build responsive cards, charts, and horizontally scrollable tables using existing admin primitives.
- [ ] Preserve the outer Billing/Discounts/Vouchers tabs.
- [ ] Parse transaction dashboard query parameters in the server page and fetch initial dashboard data.
- [ ] Keep refunds read-only and show every local status in the Orders tab.
- [ ] Run focused admin tests, lint, and typecheck.

### Task 4: Localization And Final Verification

**Files:**
- Modify: `apps/admin/src/messages/en.json`
- Modify: `apps/admin/src/messages/nl.json`
- Modify: `apps/admin/src/messages/fr.json`
- Modify: `apps/admin/tests/messages.test.ts`

- [ ] Add EN/NL/FR strings for headings, filters, metrics, statuses, tables, empty states, warnings, and chart labels with exact key parity.
- [ ] Run message and dashboard tests.
- [ ] Run `git diff --check` and `bun run test:ci`.
- [ ] Review the final diff to confirm customer history, credit/subscription dashboards, and admin completeness remain unchanged.
