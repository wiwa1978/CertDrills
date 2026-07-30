# Phase 7 Frontend Integration And I18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing single-tenant user/admin flows work end-to-end and consistently across locales.

**Architecture:** Keep Phase 7 focused on current web/admin apps and existing API routes. Improve frontend data flow, impersonation/session UX, checkout outcome handling, and i18n without adding organizations, teams, tenants, subscriptions, or recurring billing.

**Tech Stack:** Next.js, React, next-intl, TanStack Query, Bun, TypeScript, Hono API, shared contracts.

---

## Scope Notes

This phase is single-tenant only. Do not add organizations, teams, tenant IDs, memberships, seat management, subscription plans, trials, upgrades, downgrades, cancellations, or renewal webhooks.

Credits remain the only billing model. Billing UI work must focus on credit purchases, credit transactions, credit usage, and checkout outcome messaging.

## File Structure

Expected files to inspect and modify:

- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/users/page.tsx`: admin users table data flow.
- `apps/admin/src/components/layout/backend/admin/users/users-table.tsx`: admin user search/pagination UI behavior.
- `apps/admin/src/lib/api/admin.ts`: admin API wrappers for search/pagination query params.
- `apps/admin/src/lib/services/admin.ts`: admin service wrappers and typed result normalization.
- `apps/admin/src/app/[locale]/(backend)/(admin)/admin/billing/page.tsx`: admin billing server-side initial data and checkout/credit table wiring.
- `apps/admin/src/components/layout/backend/admin/shared/transaction-history-table.tsx`: billing transaction table search/pagination behavior.
- `apps/admin/src/components/layout/backend/admin/shared/purchase-history-table.tsx`: billing purchase table search/pagination behavior.
- `apps/web/src/app/[locale]/(backend)/billing/page.tsx`: user billing checkout success/cancel handling.
- `apps/web/src/app/[locale]/(backend)/billing/client-wrapper.tsx`: billing outcome display if present.
- `apps/web/src/components/layout/backend/shared/user-dropdown.tsx`: session-sensitive refresh/redirect behavior if needed.
- `apps/admin/src/components/layout/backend/shared/user-dropdown.tsx`: session-sensitive refresh/redirect behavior if needed.
- `apps/web/src/app/[locale]/layout.tsx`: set active locale on `<html lang>`.
- `apps/admin/src/app/[locale]/layout.tsx`: set active locale on `<html lang>`.
- `apps/web/src/messages/en.json`, `apps/web/src/messages/nl.json`, `apps/web/src/messages/fr.json`: web locale tree fixes.
- `apps/admin/src/messages/en.json`, `apps/admin/src/messages/nl.json`, `apps/admin/src/messages/fr.json`: admin locale tree fixes.
- `apps/web/src/i18n/routing.ts`, `apps/admin/src/i18n/routing.ts`: locale-aware routing helpers.
- `apps/web/src/proxy.ts`, `apps/admin/src/proxy.ts`: locale preservation in redirects if needed.

## Task 1: Admin Users Server-Backed Search And Pagination

**Files:**
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/admin.ts`
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/users/page.tsx`
- Modify: `apps/admin/src/components/layout/backend/admin/users/users-table.tsx`

- [ ] **Step 1: Write failing test or type-level check for search param forwarding**

Add a focused test if an admin frontend test harness exists. If there is no frontend test harness, add a small type-safe wrapper test under the closest existing frontend test setup. The behavior to prove is that `getUsers(limit, offset, search)` forwards `search` to `/admin/users?limit=...&offset=...&search=...`.

If no frontend tests exist, document the missing harness in the commit body and verify by typecheck plus targeted code review.

- [ ] **Step 2: Update API wrapper**

Modify `apps/admin/src/lib/api/admin.ts`:

```ts
export async function getAdminUsersApi(limit = 20, offset = 0, search?: string) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (search?.trim()) {
    params.set("search", search.trim());
  }

  const result = await apiRequest<{ success: boolean; data: unknown }>(`/admin/users?${params.toString()}`);
  return result.data;
}
```

- [ ] **Step 3: Update service wrapper**

Modify `apps/admin/src/lib/services/admin.ts`:

```ts
export async function getUsers(limit = 20, offset = 0, search?: string) {
  try {
    const result = (await getAdminUsersApi(limit, offset, search)) as {
      users: Array<{
        id: string;
        name: string;
        email: string;
        image: string | null;
        role: string | null;
        banned: boolean | null;
        emailVerified: boolean;
        createdAt: Date;
      }>;
      total: number;
    };

    return { data: result, error: null };
  } catch {
    return { data: { users: [], total: 0 }, error: "Failed to fetch users" };
  }
}
```

- [ ] **Step 4: Remove client-side filtering from users page**

Modify `apps/admin/src/app/[locale]/(backend)/(admin)/admin/users/page.tsx` so query key and query function include `searchQuery`:

```tsx
const [submittedSearch, setSubmittedSearch] = React.useState("");

const usersQuery = useQuery({
  queryKey: [USERS_QUERY_KEY, currentPage, limit, submittedSearch],
  queryFn: async () => {
    const result = await getUsers(limit, offset, submittedSearch);
    if (result.error) {
      throw new Error(result.error);
    }
    return result.data;
  },
});

const users = (usersQuery.data?.users ?? []) as User[];
const totalUsers = usersQuery.data?.total ?? 0;
const displayTotal = totalUsers;
```

Update search submit:

```tsx
const handleSearch = (e: React.FormEvent) => {
  e.preventDefault();
  setCurrentPage(1);
  setSubmittedSearch(searchQuery.trim());
};
```

Pass `users={users}` instead of filtered users.

- [ ] **Step 5: Run admin typecheck**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/api/admin.ts apps/admin/src/lib/services/admin.ts apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/users/page.tsx apps/admin/src/components/layout/backend/admin/users/users-table.tsx
git commit -m "fix: use server search for admin users"
```

## Task 2: Admin Billing Server-Backed Search And Pagination

**Files:**
- Modify: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/billing/page.tsx`
- Modify: `apps/admin/src/components/layout/backend/admin/shared/transaction-history-table.tsx`
- Modify: `apps/admin/src/components/layout/backend/admin/shared/purchase-history-table.tsx`
- Modify: `apps/admin/src/lib/services/admin.ts`
- Modify: `apps/admin/src/lib/api/admin.ts`

- [ ] **Step 1: Verify current API wrapper supports search**

Confirm `getAdminAllTransactionsApi(limit, offset, searchEmail)` and `getAdminAllPurchasesApi(limit, offset, searchEmail)` append `searchEmail` with `encodeURIComponent`. If not, update them to do so.

- [ ] **Step 2: Update billing tables to request server data on search/page changes**

If the current tables filter local arrays when `enableSearch` is true, replace local filtering with callback props:

```tsx
type SearchPageState = {
  searchEmail?: string;
  limit: number;
  offset: number;
};
```

Use TanStack Query in client table wrappers or lift state into a client wrapper around each table. Keep the server page responsible for initial stats and chart data.

- [ ] **Step 3: Preserve server initial data**

Keep `AdminBillingPage` as a server component for stats and chart data. Fetch first page of transactions and purchases on the server and pass it as initial data to client wrappers.

```tsx
const [initialTransactions, initialPurchases] = await Promise.all([
  getAdminAllTransactions(20, 0),
  getAdminAllPurchases(20, 0),
]);
```

- [ ] **Step 4: Remove hardcoded English stat descriptions**

Replace:

```tsx
description: `${Number(stats.purchasedCredits).toFixed(2)} purchased credits + ${Number(stats.bonusCredits).toFixed(2)} bonus`,
description: `across ${Number(stats.totalPurchases).toFixed(0)} purchases`,
```

with translation keys such as:

```tsx
description: statsT("totalCreditsPurchasedDescription", {
  purchased: Number(stats.purchasedCredits).toFixed(2),
  bonus: Number(stats.bonusCredits).toFixed(2),
}),
description: statsT("totalRevenueDescription", {
  count: Number(stats.totalPurchases).toFixed(0),
}),
```

- [ ] **Step 5: Add locale messages**

Update all three admin message files:

```json
{
  "admin": {
    "billing": {
      "stats": {
        "totalCreditsPurchasedDescription": "{purchased} purchased credits + {bonus} bonus credits",
        "totalRevenueDescription": "Across {count} purchases"
      }
    }
  }
}
```

Add Dutch and French translations with the same key path.

- [ ] **Step 6: Run admin typecheck**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/billing/page.tsx apps/admin/src/components/layout/backend/admin/shared/transaction-history-table.tsx apps/admin/src/components/layout/backend/admin/shared/purchase-history-table.tsx apps/admin/src/lib/services/admin.ts apps/admin/src/lib/api/admin.ts apps/admin/src/messages/en.json apps/admin/src/messages/nl.json apps/admin/src/messages/fr.json
git commit -m "fix: use server search for admin billing"
```

## Task 3: Checkout Outcome Messaging On Billing Page

**Files:**
- Modify: `apps/web/src/app/[locale]/(backend)/billing/page.tsx`
- Modify: `apps/web/src/app/[locale]/(backend)/billing/client-wrapper.tsx`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/nl.json`
- Modify: `apps/web/src/messages/fr.json`

- [ ] **Step 1: Inspect billing page search params**

Confirm whether `billing/page.tsx` receives `searchParams`. If not, add:

```tsx
type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
```

- [ ] **Step 2: Pass checkout outcome to client wrapper**

In the server page:

```tsx
const resolvedSearchParams = await searchParams;
const checkoutOutcome = resolvedSearchParams?.success === "true"
  ? "success"
  : resolvedSearchParams?.cancel === "true"
    ? "cancel"
    : null;
```

Pass `checkoutOutcome` to the billing client wrapper.

- [ ] **Step 3: Render localized alert**

In `client-wrapper.tsx`, render a dismissible or static alert when `checkoutOutcome` is `success` or `cancel`:

```tsx
{checkoutOutcome === "success" ? (
  <Alert>
    <AlertTitle>{t("checkout.successTitle")}</AlertTitle>
    <AlertDescription>{t("checkout.successDescription")}</AlertDescription>
  </Alert>
) : null}
{checkoutOutcome === "cancel" ? (
  <Alert variant="destructive">
    <AlertTitle>{t("checkout.cancelTitle")}</AlertTitle>
    <AlertDescription>{t("checkout.cancelDescription")}</AlertDescription>
  </Alert>
) : null}
```

- [ ] **Step 4: Add locale messages**

Add matching keys to web `en`, `nl`, and `fr` messages under the existing billing namespace.

- [ ] **Step 5: Run web typecheck**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/\(backend\)/billing/page.tsx apps/web/src/app/[locale]/\(backend\)/billing/client-wrapper.tsx apps/web/src/messages/en.json apps/web/src/messages/nl.json apps/web/src/messages/fr.json
git commit -m "feat: show checkout outcome on billing page"
```

## Task 4: Impersonation Stop UX And Session Refresh

**Files:**
- Modify: `apps/admin/src/components/layout/backend/shared/user-dropdown.tsx`
- Modify: `apps/web/src/components/layout/backend/shared/user-dropdown.tsx`
- Modify: `apps/admin/src/lib/services/admin.ts`
- Modify: `apps/admin/src/messages/en.json`
- Modify: `apps/admin/src/messages/nl.json`
- Modify: `apps/admin/src/messages/fr.json`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/nl.json`
- Modify: `apps/web/src/messages/fr.json`

- [ ] **Step 1: Locate current impersonation indicator**

Search for `impersonat` in web/admin. Confirm whether the backend layout or dropdown already knows impersonation state from the session.

- [ ] **Step 2: Add stop action to visible impersonation UI**

Use existing `stopAdminImpersonationApi` / service wrapper. The action should:

```tsx
await stopAdminImpersonation();
router.push("/admin/overview");
router.refresh();
```

If the current app is the public web app while impersonating a non-admin user, redirect to a safe admin URL or configured admin app URL where possible.

- [ ] **Step 3: Refresh session after security mutations**

For settings cards that change 2FA, passkeys, password, email, or linked accounts, call `router.refresh()` or invalidate the relevant session query after success. Keep changes focused to existing success handlers.

- [ ] **Step 4: Localize labels and toasts**

Move hardcoded strings introduced or touched by this task to message files.

- [ ] **Step 5: Run typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/layout/backend/shared/user-dropdown.tsx apps/web/src/components/layout/backend/shared/user-dropdown.tsx apps/admin/src/lib/services/admin.ts apps/admin/src/messages/en.json apps/admin/src/messages/nl.json apps/admin/src/messages/fr.json apps/web/src/messages/en.json apps/web/src/messages/nl.json apps/web/src/messages/fr.json
git commit -m "fix: refresh session after security changes"
```

## Task 5: Locale Tree And Html Lang Sweep

**Files:**
- Modify: `apps/web/src/app/[locale]/layout.tsx`
- Modify: `apps/admin/src/app/[locale]/layout.tsx`
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/nl.json`
- Modify: `apps/web/src/messages/fr.json`
- Modify: `apps/admin/src/messages/en.json`
- Modify: `apps/admin/src/messages/nl.json`
- Modify: `apps/admin/src/messages/fr.json`
- Modify: `apps/web/src/proxy.ts` if redirects drop locale.
- Modify: `apps/admin/src/proxy.ts` if redirects drop locale.

- [ ] **Step 1: Set html lang from route locale**

In each `[locale]/layout.tsx`, ensure params are awaited and used:

```tsx
export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  return <html lang={locale}>{children}</html>;
}
```

Adapt to the existing layout structure without nesting duplicate `<html>` tags.

- [ ] **Step 2: Check message key parity**

Write or run a small existing script if available to compare keys between `en`, `nl`, and `fr`. If no script exists, use a temporary local Node/Bun one-liner and do not commit it.

Expected: no missing keys after fixes.

- [ ] **Step 3: Fix missing keys and hardcoded touched strings**

Update all three locale files so keys used by Phase 7 components exist in every locale.

- [ ] **Step 4: Verify locale redirects**

Inspect `apps/web/src/proxy.ts` and `apps/admin/src/proxy.ts`. If a redirect constructs a non-localized path, update it to preserve the active locale.

- [ ] **Step 5: Run typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/layout.tsx apps/admin/src/app/[locale]/layout.tsx apps/web/src/messages/en.json apps/web/src/messages/nl.json apps/web/src/messages/fr.json apps/admin/src/messages/en.json apps/admin/src/messages/nl.json apps/admin/src/messages/fr.json apps/web/src/proxy.ts apps/admin/src/proxy.ts
git commit -m "fix: align locale behavior"
```

## Task 6: Final Phase 7 Verification

**Files:**
- Inspect: all files changed in Phase 7.

- [ ] **Step 1: Run API tests**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test`

Expected: PASS.

- [ ] **Step 2: Run full typecheck**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all`

Expected: PASS.

- [ ] **Step 3: Inspect scope**

Run: `git diff --stat main...HEAD`

Expected: changes are limited to Phase 7 frontend/i18n files and any directly required API/client wrappers. No organization, team, tenant, subscription, or recurring billing support.

- [ ] **Step 4: Commit final fixes if needed**

If the sweep required fixes, commit them:

```bash
git add <fixed-files>
git commit -m "chore: finalize phase 7 verification"
```

If no files changed, do not create an empty commit.
