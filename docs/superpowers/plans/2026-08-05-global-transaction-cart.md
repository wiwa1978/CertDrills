# Global Transaction Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the transaction basket from a permanent billing-page column into a global top-bar cart icon and accessible right-side sheet.

**Architecture:** A backend-layout transaction-cart provider owns the user-scoped basket query, mutations, checkout redirect, and sheet state. The global top bar renders the trigger and sheet from that provider, while the transaction billing portal seeds server basket data and consumes the same provider for catalog quantity edits.

**Tech Stack:** React, Next.js, TanStack Query, Radix Sheet, next-intl, Vitest, Bun

---

### Task 1: Extract Shared Transaction Cart State

**Files:**
- Create: `apps/web/src/components/providers/transaction-cart-provider.tsx`
- Modify: `apps/web/src/app/[locale]/(backend)/layout.tsx`
- Test: `apps/web/tests/components/transaction-cart-provider.test.ts`
- Modify: `apps/web/tests/components/transaction-billing-portal.test.ts`

- [ ] Write failing tests for provider visibility, total-quantity calculation, disabled query outside transaction mode, user-scoped query keys, user-switch isolation, mutation synchronization, checkout user capture, and explicit sheet state.
- [ ] Run: `bun run --cwd apps/web test -- tests/components/transaction-cart-provider.test.ts`
- [ ] Move `createTransactionPortalActions`, quantity state/reducer, basket query, basket mutations, checkout mutation, and synchronization logic from the portal into the provider.
- [ ] Expose `useTransactionCart()` with `enabled`, `basket`, `quantities`, `totalQuantity`, query/error/pending flags, `open`, `setOpen`, and catalog/cart actions.
- [ ] Accept `userId` from the authenticated server layout. Read transaction-surface enablement from the existing application-config query and enable basket fetch only when both are available.
- [ ] Provide an idempotent `seedBasket(initialBasket)` behavior that does not overwrite newer cache data or dirty catalog edits.
- [ ] Wrap `DashboardNavProvider`/`DashboardSidebar` with the provider in backend layout.
- [ ] Verify focused provider tests pass.

### Task 2: Add Top-Bar Trigger And Cart Sheet

**Files:**
- Create: `apps/web/src/components/layout/backend/shared/backend-topbar-cart.tsx`
- Modify: `apps/web/src/components/layout/backend/shared/backend-topbar.tsx`
- Modify: `apps/web/src/components/layout/backend/billing/transaction-basket.tsx`
- Test: `apps/web/tests/components/backend-topbar-cart.test.ts`
- Modify: `apps/web/tests/components/transaction-billing-portal.test.ts`

- [ ] Write failing tests for transaction/auth visibility, empty icon without badge, total-unit badge, accessible label, explicit open/close behavior, responsive sheet width, scrollable items, anchored summary, retry feedback, and existing basket controls.
- [ ] Run: `bun run --cwd apps/web test -- tests/components/backend-topbar-cart.test.ts`
- [ ] Add a `ShoppingCart` icon button to the top bar before notifications, shown only when the cart provider is enabled and a user exists.
- [ ] Render a badge only when `totalQuantity > 0`; include the quantity in the localized trigger label.
- [ ] Use the existing Radix `Sheet` with `w-full sm:max-w-md`; render title/description, independently scrollable basket items, and fixed footer summary/checkout.
- [ ] Refactor `TransactionBasketView` into reusable basket content suitable for a sheet, preserving quantity bounds, remove, clear, subtotal, tax note, and checkout behavior.
- [ ] Keep failed-query retry feedback inside the sheet while retaining the last successful basket.
- [ ] Verify focused top-bar and basket tests pass.

### Task 3: Convert Billing Page To Full-Width Catalog

**Files:**
- Modify: `apps/web/src/components/layout/backend/billing/transaction-billing-portal.tsx`
- Test: `apps/web/tests/components/transaction-billing-portal.test.ts`

- [ ] Update tests first to require no permanent `TransactionBasketView`, no two-column basket grid, and full-width catalog rendering.
- [ ] Add a regression proving a successful product add updates basket/badge state but does not call `setOpen(true)`.
- [ ] Run the portal test and verify RED.
- [ ] Replace local basket state/mutations with `useTransactionCart()` values and actions.
- [ ] Seed the server-provided initial basket into the provider without stale overwrite.
- [ ] Render header, basket error alert where appropriate, full-width product catalog, orders, and entitlements only.
- [ ] Preserve all existing dirty-edit/refetch/user-switch/checkout redirect semantics in provider-focused tests.
- [ ] Verify portal and provider tests pass.

### Task 4: Localize And Verify

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/nl.json`
- Modify: `apps/web/src/messages/fr.json`
- Modify: `apps/web/tests/messages.test.ts`
- Modify: `apps/web/tests/messages-copy.test.ts`

- [ ] Add failing message assertions for cart trigger labels with quantity, sheet description, close semantics if needed, and retry action.
- [ ] Add equivalent English, Dutch, and French strings under `billing.transaction.basket`.
- [ ] Run message and focused cart tests.
- [ ] Run `git diff --check`.
- [ ] Run `bun run test:ci` and require all database checks, typechecks, API, web, admin, and shared-package tests to pass.
- [ ] Search for the old sticky basket classes and ensure they no longer appear in production transaction-billing code.
- [ ] Review desktop and mobile structure for top-bar fit, full-width sheet on small screens, focus labels, and scroll containment.
