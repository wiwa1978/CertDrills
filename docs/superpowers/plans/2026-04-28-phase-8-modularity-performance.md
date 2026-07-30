# Phase 8 Modularity And Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce frontend duplication, improve package boundaries, and remove avoidable API/cache overhead without introducing new product concepts.

**Architecture:** Keep public web and admin apps as thin app-specific shells over shared frontend primitives. Split admin-only auth/client capability away from public web imports, then centralize safe duplicated request/session/query helpers. Keep shared code dependency direction app -> package and never package -> app.

**Tech Stack:** Next.js, React, next-intl, TanStack Query, Bun, TypeScript, Better Auth, Hono API, Drizzle, shared workspace packages.

---

## Scope Notes

This phase is single-tenant only. Do not add organizations, teams, tenant IDs, memberships, seat management, subscription plans, trials, upgrades, downgrades, cancellations, recurring billing, or renewal webhooks.

Credits remain the only billing model. Modularity changes must preserve current behavior and existing API response envelopes unless a task explicitly updates a tested contract.

## File Structure

Expected files to inspect and modify:

- `packages/auth-client/src/web.ts`: split user/admin auth client factories.
- `packages/auth-client/src/index.ts`: export split auth factories.
- `packages/auth-client/src/types.ts`: shared auth client factory options.
- `apps/web/src/lib/auth-client.ts`: consume public user auth client only.
- `apps/admin/src/lib/auth-client.ts`: consume admin-capable auth client.
- `apps/web/package.json`, `apps/admin/package.json`: explicit workspace dependency hygiene if needed.
- `packages/frontend-shared/src/api-client.ts`: configurable cookie/bearer API request factories.
- `packages/frontend-shared/src/index.ts`: export new shared helpers.
- `apps/web/src/lib/api/client.ts`, `apps/admin/src/lib/api/client.ts`: app-specific API request adapters.
- `packages/frontend-shared/src/query.tsx`: shared QueryProvider defaults.
- `packages/frontend-shared/src/query-keys.ts`: shared query key factories.
- `packages/frontend-shared/src/me-api.ts`: shared current-user API helpers.
- `packages/frontend-shared/src/credits.ts`: shared credit API/service helper factories.
- `packages/frontend-shared/src/notifications.ts`: shared notification helper factories.
- `apps/web/src/lib/api/me.ts`, `apps/admin/src/lib/api/me.ts`: thin adapters.
- `apps/web/src/lib/services/credits.ts`, `apps/admin/src/lib/services/credits.ts`: thin adapters.
- `apps/web/src/lib/services/notifications.ts`, `apps/admin/src/lib/services/notifications.ts`: thin adapters.
- `apps/web/src/components/providers/query-provider.tsx`, `apps/admin/src/components/providers/query-provider.tsx`: shared provider wrappers.
- `apps/web/src/lib/query/keys.ts`: app query-key exports.
- `packages/frontend-shared/src/server-session.ts`: shared Next server session helper factory.
- `apps/web/src/lib/auth-session.ts`, `apps/admin/src/lib/auth-session.ts`: thin session adapters.
- `packages/contracts/src/wire/**`: JSON-safe wire response schemas where still using `Date` coercion.
- `apps/api/src/modules/{billing,admin,discounts,vouchers,notifications}/service.ts`: typed service boundaries.
- `packages/platform-db/src/index.ts`: export DB type if needed.
- `apps/web/package.json`, `apps/admin/package.json`: stable framework pins if canary is not required.

## Task 1: Split Public And Admin Auth Clients

**Files:**
- Modify: `packages/auth-client/src/web.ts`
- Modify: `packages/auth-client/src/index.ts`
- Modify: `packages/auth-client/src/types.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/admin/src/lib/auth-client.ts`
- Modify: `apps/web/package.json` if `@platform/auth-client` is missing
- Modify: `apps/admin/package.json` if `@platform/auth-client` is missing
- Test: `apps/web/tests/lib/auth-client-exports.test.ts`
- Test: `apps/admin/tests/lib/auth-client-exports.test.ts`

- [ ] **Step 1: Add failing web export test**

Create `apps/web/tests/lib/auth-client-exports.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as authExports from "../../src/lib/auth-client";

describe("web auth client exports", () => {
  it("does not expose admin auth plugin helpers", () => {
    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run web test and verify it fails**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web test tests/lib/auth-client-exports.test.ts`

Expected: FAIL because `apps/web/src/lib/auth-client.ts` currently exports `admin`.

- [ ] **Step 3: Split auth-client factories**

Modify `packages/auth-client/src/web.ts` so public and admin client creation are separate:

```ts
import { createAuthClient } from "better-auth/react";
import { dodopaymentsClient } from "@dodopayments/better-auth";
import { inferAdditionalFields, adminClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

import { authAdditionalUserFields } from "@platform/auth-shared";

import type { CreateWebAuthClientOptions } from "./types";

function createBasePlugins(options: CreateWebAuthClientOptions) {
  return [
    inferAdditionalFields({ user: authAdditionalUserFields }),
    dodopaymentsClient(),
    twoFactorClient(),
    passkeyClient(),
    magicLinkClient(),
    ...(options.plugins ?? []),
  ];
}

function createClientOptions(options: CreateWebAuthClientOptions, plugins: unknown[]) {
  return {
    baseURL: options.baseURL,
    plugins,
    fetchOptions: {
      onError(e: { error: unknown }) {
        options.onError?.({ error: e.error, context: e });
      },
    },
  };
}

export function createWebUserAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient(createClientOptions(options, createBasePlugins(options)));
}

export function createWebAdminAuthClient(options: CreateWebAuthClientOptions) {
  return createAuthClient(createClientOptions(options, [...createBasePlugins(options), adminClient()]));
}

export const createWebAuthClient = createWebAdminAuthClient;
```

If TypeScript rejects `unknown[]` for plugin types, infer the plugin type locally from `createAuthClient` usage rather than using `any`.

- [ ] **Step 4: Update app auth clients**

Modify `apps/web/src/lib/auth-client.ts` to import `createWebUserAuthClient` and remove `admin` from destructuring:

```ts
import { createWebUserAuthClient } from "@platform/auth-client";

export const authClient = createWebUserAuthClient({
  baseURL: authBaseURL,
  plugins: [nextCookies()],
  onError({ error, context }) {
    // keep existing body unchanged
  },
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  updateUser,
  changePassword,
  changeEmail,
  requestPasswordReset,
  resetPassword,
  listSessions,
  revokeSession,
  revokeSessions,
  deleteUser,
  linkSocial,
  unlinkAccount,
  listAccounts,
  twoFactor,
  passkey,
  magicLink,
} = authClient;
```

Modify `apps/admin/src/lib/auth-client.ts` to import `createWebAdminAuthClient` and keep the existing `admin` export.

- [ ] **Step 5: Add admin export test**

Create `apps/admin/tests/lib/auth-client-exports.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as authExports from "../../src/lib/auth-client";

describe("admin auth client exports", () => {
  it("keeps admin auth plugin helpers available", () => {
    expect(Object.prototype.hasOwnProperty.call(authExports, "admin")).toBe(true);
  });
});
```

- [ ] **Step 6: Run focused tests and typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web test tests/lib/auth-client-exports.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin test tests/lib/auth-client-exports.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:packages
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/auth-client/src/web.ts packages/auth-client/src/index.ts packages/auth-client/src/types.ts apps/web/src/lib/auth-client.ts apps/admin/src/lib/auth-client.ts apps/web/tests/lib/auth-client-exports.test.ts apps/admin/tests/lib/auth-client-exports.test.ts apps/web/package.json apps/admin/package.json
git commit -m "fix: split public and admin auth clients"
```

## Task 2: Add Configurable API Request Factories

**Files:**
- Modify: `packages/frontend-shared/src/api-client.ts`
- Modify: `packages/frontend-shared/src/index.ts`
- Modify: `apps/web/src/lib/api/client.ts`
- Modify: `apps/admin/src/lib/api/client.ts`
- Test: `packages/frontend-shared/tests/api-client.test.ts`

- [ ] **Step 1: Add failing shared API client tests**

Create `packages/frontend-shared/tests/api-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApiRequest, createBearerApiRequest } from "../src/api-client";

describe("frontend shared API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults cookie requests to no-store", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await request("/me/session");

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/me/session", expect.objectContaining({
      cache: "no-store",
      credentials: "include",
    }));
  });

  it("allows per-request cache options", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createApiRequest({ baseURL: "https://api.example.test" });

    await request("/public/countries", { cache: "force-cache" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/public/countries", expect.objectContaining({
      cache: "force-cache",
    }));
  });

  it("adds bearer authorization without cookies", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const request = createBearerApiRequest({ baseURL: "https://api.example.test", getToken: () => "token-123" });

    await request("/mobile/me");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token-123");
  });
});
```

- [ ] **Step 2: Run shared test and verify it fails**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests/api-client.test.ts`

Expected: FAIL because `createBearerApiRequest` does not exist and cache behavior is not configurable.

- [ ] **Step 3: Implement request options**

Modify `packages/frontend-shared/src/api-client.ts`:

```ts
type RequestHeadersResolver = () => HeadersInit | undefined | Promise<HeadersInit | undefined>;
type TokenResolver = () => string | undefined | Promise<string | undefined>;

type ApiRequestFactoryOptions = {
  baseURL: string;
  nodeEnv?: string;
  getHeaders?: RequestHeadersResolver;
  credentials?: RequestCredentials;
  defaultCache?: RequestCache;
};

export function createApiRequest(options: ApiRequestFactoryOptions) {
  return async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const requestHeaders = new Headers(init?.headers ?? {});
    const hasBody = init?.body !== undefined && init?.body !== null;

    if (hasBody && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }

    if (options.getHeaders) {
      const extraHeaders = await options.getHeaders();
      if (extraHeaders) {
        const resolvedHeaders = new Headers(extraHeaders);
        for (const [key, value] of resolvedHeaders.entries()) {
          requestHeaders.set(key, value);
        }
      }
    }

    const response = await fetch(`${options.baseURL}${path}`, {
      credentials: options.credentials ?? "include",
      cache: init?.cache ?? options.defaultCache ?? "no-store",
      ...init,
      headers: requestHeaders,
    });

    // keep existing error handling and json parsing unchanged
  };
}

export function createBearerApiRequest(options: Omit<ApiRequestFactoryOptions, "credentials" | "getHeaders"> & { getToken: TokenResolver }) {
  return createApiRequest({
    ...options,
    credentials: "omit",
    getHeaders: async () => {
      const token = await options.getToken();
      return token ? { Authorization: `Bearer ${token}` } : undefined;
    },
  });
}
```

Keep the existing `ApiRequestError` behavior byte-for-byte where possible.

- [ ] **Step 4: Keep app adapters conservative**

Inspect `apps/web/src/lib/api/client.ts` and `apps/admin/src/lib/api/client.ts`. Keep their current app exports named `apiRequest` and keep default authenticated behavior as `cache: "no-store"` unless individual callers opt into another cache mode.

- [ ] **Step 5: Run tests and typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests/api-client.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:packages
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend-shared/src/api-client.ts packages/frontend-shared/src/index.ts packages/frontend-shared/tests/api-client.test.ts apps/web/src/lib/api/client.ts apps/admin/src/lib/api/client.ts
git commit -m "feat: add configurable frontend api requests"
```

## Task 3: Share Query Provider, Query Keys, Me, Credits, And Notifications Helpers

**Files:**
- Create: `packages/frontend-shared/src/query.tsx`
- Create: `packages/frontend-shared/src/query-keys.ts`
- Create: `packages/frontend-shared/src/me-api.ts`
- Create: `packages/frontend-shared/src/credits.ts`
- Create: `packages/frontend-shared/src/notifications.ts`
- Modify: `packages/frontend-shared/src/index.ts`
- Modify: `apps/web/src/components/providers/query-provider.tsx`
- Modify: `apps/admin/src/components/providers/query-provider.tsx`
- Modify: `apps/web/src/lib/query/keys.ts`
- Modify: `apps/web/src/lib/api/me.ts`
- Modify: `apps/admin/src/lib/api/me.ts`
- Modify: `apps/web/src/lib/services/credits.ts`
- Modify: `apps/admin/src/lib/services/credits.ts`
- Modify: `apps/web/src/lib/services/notifications.ts`
- Modify: `apps/admin/src/lib/services/notifications.ts`
- Test: `packages/frontend-shared/tests/query-keys.test.ts`
- Test: `packages/frontend-shared/tests/service-factories.test.ts`

- [ ] **Step 1: Add shared query key tests**

Create `packages/frontend-shared/tests/query-keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { queryKeys } from "../src/query-keys";

describe("queryKeys", () => {
  it("returns stable user credit keys", () => {
    expect(queryKeys.credits.balance()).toEqual(["credits", "balance"]);
    expect(queryKeys.credits.history(25)).toEqual(["credits", "history", 25]);
    expect(queryKeys.credits.purchases(10)).toEqual(["credits", "purchases", 10]);
  });

  it("returns stable notification keys", () => {
    expect(queryKeys.notifications.list(20)).toEqual(["notifications", "list", 20]);
    expect(queryKeys.notifications.unreadCount()).toEqual(["notifications", "unread-count"]);
    expect(queryKeys.notifications.activeBanner()).toEqual(["notifications", "active-banner"]);
  });
});
```

- [ ] **Step 2: Add shared service factory tests**

Create `packages/frontend-shared/tests/service-factories.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createCreditsApi, createNotificationsApi } from "../src";

describe("shared service factories", () => {
  it("builds credit API calls with the provided request function", async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { balance: "5" } });
    const credits = createCreditsApi(request);

    await credits.getBalance();
    await credits.getHistory(25);

    expect(request).toHaveBeenNthCalledWith(1, "/me/credits/balance");
    expect(request).toHaveBeenNthCalledWith(2, "/me/credits/history?limit=25");
  });

  it("builds notification API calls with the provided request function", async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: [] });
    const notifications = createNotificationsApi(request);

    await notifications.list(10);
    await notifications.markAsRead("notification-id");

    expect(request).toHaveBeenNthCalledWith(1, "/me/notifications?limit=10");
    expect(request).toHaveBeenNthCalledWith(2, "/me/notifications/notification-id/read", { method: "POST" });
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests/query-keys.test.ts packages/frontend-shared/tests/service-factories.test.ts`

Expected: FAIL because new exports do not exist.

- [ ] **Step 4: Add shared query helpers**

Create `packages/frontend-shared/src/query-keys.ts`:

```ts
export const queryKeys = {
  credits: {
    balance: () => ["credits", "balance"] as const,
    history: (limit: number) => ["credits", "history", limit] as const,
    purchases: (limit: number) => ["credits", "purchases", limit] as const,
  },
  notifications: {
    list: (limit: number) => ["notifications", "list", limit] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
    activeBanner: () => ["notifications", "active-banner"] as const,
  },
};
```

Create `packages/frontend-shared/src/query.tsx`:

```tsx
"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function createDefaultQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function SharedQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => createDefaultQueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 5: Add shared API helper factories**

Create `packages/frontend-shared/src/credits.ts` and `packages/frontend-shared/src/notifications.ts` with pure factory functions that accept the app `apiRequest` function. Keep response shapes generic and do not import app-local env, routing, or components.

Use this request type in both files:

```ts
type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
```

For credits, export:

```ts
export function createCreditsApi(apiRequest: ApiRequest) {
  return {
    getBalance: () => apiRequest("/me/credits/balance"),
    getHistory: (limit = 50) => apiRequest(`/me/credits/history?limit=${encodeURIComponent(String(limit))}`),
    getPurchases: (limit = 50) => apiRequest(`/me/credits/purchases?limit=${encodeURIComponent(String(limit))}`),
    downloadInvoice: (paymentId: string) => apiRequest("/me/credits/invoice", {
      method: "POST",
      body: JSON.stringify({ paymentId }),
    }),
  };
}
```

For notifications, export list, unread count, active banner, mark as read, mark all read, and delete functions matching current app endpoints.

- [ ] **Step 6: Convert app adapters**

Modify web/admin provider files to re-export `SharedQueryProvider`:

```tsx
"use client";

export { SharedQueryProvider as QueryProvider } from "@platform/frontend-shared";
```

Modify app service files to instantiate shared factories with their local `apiRequest`. Keep exported function names stable.

- [ ] **Step 7: Run tests and typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests/query-keys.test.ts packages/frontend-shared/tests/service-factories.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:packages
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend-shared/src packages/frontend-shared/tests apps/web/src/components/providers/query-provider.tsx apps/admin/src/components/providers/query-provider.tsx apps/web/src/lib/query/keys.ts apps/web/src/lib/api/me.ts apps/admin/src/lib/api/me.ts apps/web/src/lib/services/credits.ts apps/admin/src/lib/services/credits.ts apps/web/src/lib/services/notifications.ts apps/admin/src/lib/services/notifications.ts
git commit -m "refactor: share frontend api helpers"
```

## Task 4: Share Server Session Helper Factory

**Files:**
- Create: `packages/frontend-shared/src/server-session.ts`
- Modify: `packages/frontend-shared/src/index.ts`
- Modify: `apps/web/src/lib/auth-session.ts`
- Modify: `apps/admin/src/lib/auth-session.ts`
- Test: `packages/frontend-shared/tests/server-session.test.ts`

- [ ] **Step 1: Add failing server session helper tests**

Create `packages/frontend-shared/tests/server-session.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createServerSessionReader } from "../src/server-session";

describe("createServerSessionReader", () => {
  it("returns null when there is no cookie header", async () => {
    const read = createServerSessionReader({ apiBaseUrl: "https://api.example.test", sessionPath: "/me/session", getCookieHeader: async () => undefined });

    await expect(read()).resolves.toBeNull();
  });

  it("forwards cookies and uses no-store", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: "user-1" } })));
    const read = createServerSessionReader({ apiBaseUrl: "https://api.example.test", sessionPath: "/me/session", getCookieHeader: async () => "sid=1" });

    await read();

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/me/session", expect.objectContaining({
      cache: "no-store",
      headers: { cookie: "sid=1" },
    }));
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests/server-session.test.ts`

Expected: FAIL because `server-session` does not exist.

- [ ] **Step 3: Implement shared helper**

Create `packages/frontend-shared/src/server-session.ts`:

```ts
type ServerSessionReaderOptions<TSession> = {
  apiBaseUrl: string;
  sessionPath: string;
  getCookieHeader: () => Promise<string | undefined> | string | undefined;
  parse?: (value: unknown) => TSession | null;
};

export function createServerSessionReader<TSession = unknown>(options: ServerSessionReaderOptions<TSession>) {
  return async function readServerSession(): Promise<TSession | null> {
    const cookieHeader = await options.getCookieHeader();
    if (!cookieHeader) {
      return null;
    }

    const response = await fetch(`${options.apiBaseUrl}${options.sessionPath}`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      return null;
    }

    const data = (payload as { data: unknown }).data;
    return options.parse ? options.parse(data) : (data as TSession);
  };
}
```

- [ ] **Step 4: Convert app session helpers**

Modify web/admin `auth-session.ts` files to call `createServerSessionReader` with `headers()` cookie forwarding and the current app-specific session path. Keep existing exported function names stable.

- [ ] **Step 5: Run tests and typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests/server-session.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:packages
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web typecheck
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/frontend-shared/src/server-session.ts packages/frontend-shared/src/index.ts packages/frontend-shared/tests/server-session.test.ts apps/web/src/lib/auth-session.ts apps/admin/src/lib/auth-session.ts
git commit -m "refactor: share server session reader"
```

## Task 5: Convert Priority Wire Response Dates To JSON-Safe Strings

**Files:**
- Modify: `packages/contracts/src/wire/billing/responses.ts`
- Modify: `packages/contracts/src/wire/admin/responses.ts`
- Modify: `packages/contracts/src/wire/vouchers/common.ts`
- Modify: `packages/contracts/src/wire/notifications/common.ts`
- Modify: API route mapping files only where typecheck requires explicit serialization.
- Test: `apps/api/tests/contracts/wire-date-safety.test.ts`

- [ ] **Step 1: Add failing contract tests**

Create `apps/api/tests/contracts/wire-date-safety.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  adminUserSchema,
  creditTransactionSchema,
  voucherSchema,
  notificationSchema,
} from "@platform/contracts/wire";

describe("wire response date safety", () => {
  it("accepts ISO strings for response dates", () => {
    const iso = "2026-04-28T10:00:00.000Z";
    expect(creditTransactionSchema.parse({ id: "t1", type: "usage", amount: "1", description: "usage", balanceAfter: "9", createdAt: iso }).createdAt).toBe(iso);
    expect(adminUserSchema.parse({ id: "u1", name: "User", email: "u@example.com", image: null, role: "user", banned: false, emailVerified: true, createdAt: iso }).createdAt).toBe(iso);
    expect(voucherSchema.parse({ id: "v1", code: "ABC", creditAmount: 5, status: "active", maxRedemptions: 1, currentRedemptions: 0, appliesToAllUsers: true, expiresAt: iso, createdAt: iso }).createdAt).toBe(iso);
    expect(notificationSchema.parse({ id: "n1", userId: "u1", title: "title", message: "message", type: "info", category: "system", read: false, showAsBanner: false, createdAt: iso }).createdAt).toBe(iso);
  });

  it("rejects Date instances for response dates", () => {
    const date = new Date("2026-04-28T10:00:00.000Z");
    expect(() => creditTransactionSchema.parse({ id: "t1", type: "usage", amount: "1", description: "usage", balanceAfter: "9", createdAt: date })).toThrow();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/contracts/wire-date-safety.test.ts`

Expected: FAIL because several response schemas still coerce `Date`.

- [ ] **Step 3: Add shared date schema and update responses**

Create or update a shared wire date helper in `packages/contracts/src/wire/common.ts` if one exists, otherwise add `packages/contracts/src/wire/date.ts`:

```ts
import { z } from "zod";

export const isoDateTimeStringSchema = z.string().datetime();
```

Replace response-side `z.coerce.date()` and `z.date()` fields with `isoDateTimeStringSchema`. Keep request schemas that intentionally parse incoming date filters unchanged.

- [ ] **Step 4: Fix type errors with explicit mappers**

If API routes now fail typecheck because services return `Date`, add local serialization helpers close to the route:

```ts
function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return value;
  return value instanceof Date ? value.toISOString() : value;
}
```

Map response DTOs before returning JSON for touched endpoints only.

- [ ] **Step 5: Run tests and typechecks**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/contracts/wire-date-safety.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/contracts/subpath-exports.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/wire apps/api/tests/contracts/wire-date-safety.test.ts apps/api/src/routes apps/admin/src/lib apps/web/src/lib
git commit -m "fix: use json safe wire dates"
```

## Task 6: Type Critical API Service Boundaries

**Files:**
- Modify: `packages/platform-db/src/index.ts`
- Modify: `apps/api/src/modules/billing/service.ts`
- Modify: `apps/api/src/modules/admin/service.ts`
- Modify: `apps/api/src/modules/discounts/service.ts`
- Modify: `apps/api/src/modules/vouchers/service.ts`
- Modify: `apps/api/src/modules/notifications/service.ts`
- Modify: `apps/api/src/openapi.ts` only for narrow `Record<string, unknown>` replacements.

- [ ] **Step 1: Export DB type**

Modify `packages/platform-db/src/index.ts` to export a usable DB type from the existing client setup. If the DB instance is created in a different file, export its inferred type there:

```ts
export type PlatformDb = typeof db;
```

If no singleton `db` export exists, export the Drizzle database type used by the API bootstrap without using `any`.

- [ ] **Step 2: Replace service dependency `db: any` one module at a time**

Start with billing:

```ts
import type { PlatformDb } from "@platform/platform-db";

type BillingServiceDeps = {
  db: PlatformDb;
  // keep existing env and notifications fields
};
```

Then repeat for admin, discounts, vouchers, and notifications. For transactions, define the narrow local type needed by helper functions instead of falling back to `any`.

- [ ] **Step 3: Run module typecheck after each service**

Run after each service edit: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api typecheck`

Expected: PASS before moving to the next service.

- [ ] **Step 4: Run focused module tests**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/billing/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/admin/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/discounts/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/vouchers/service.test.ts
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test tests/modules/notifications/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform-db/src/index.ts apps/api/src/modules/billing/service.ts apps/api/src/modules/admin/service.ts apps/api/src/modules/discounts/service.ts apps/api/src/modules/vouchers/service.ts apps/api/src/modules/notifications/service.ts apps/api/src/openapi.ts
git commit -m "refactor: type critical api service boundaries"
```

## Task 7: Stabilize Framework Dependency Pins

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/admin/package.json`
- Modify: `apps/web/next.config.ts` if `as any` can be removed safely
- Modify: `apps/admin/next.config.ts` if `as any` can be removed safely
- Modify: `bun.lock`

- [ ] **Step 1: Identify current stable Next version compatible with repo features**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun pm view next version`

Expected: prints a stable semver version.

If the app uses a canary-only feature, stop and report `BLOCKED` with the file and feature name. Do not pin to an incompatible stable version.

- [ ] **Step 2: Replace canary package versions**

In both app package files, replace:

```json
"next": "canary",
"eslint-config-next": "16.1.1-canary.5"
```

with the selected stable `next` version and matching stable `eslint-config-next` version.

- [ ] **Step 3: Refresh lockfile**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun install`

Expected: lockfile updates without install errors.

- [ ] **Step 4: Run typechecks and builds**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all
NEXT_PUBLIC_APP_URL="http://localhost:3000" NEXT_PUBLIC_APP_NAME="Test App" PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web build
NEXT_PUBLIC_APP_URL="http://localhost:3001" NEXT_PUBLIC_APP_NAME="Test Admin" NEXT_PUBLIC_MAIN_APP_URL="http://localhost:3000" PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/admin/package.json apps/web/next.config.ts apps/admin/next.config.ts bun.lock
git commit -m "chore: pin stable next dependencies"
```

## Task 8: Final Phase 8 Verification

**Files:**
- Inspect all Phase 8 changed files.

- [ ] **Step 1: Run API tests**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/api test`

Expected: PASS.

- [ ] **Step 2: Run all app/package tests touched by Phase 8**

Run:

```bash
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/web test
PATH="/home/wim/.bun/bin:$PATH" bun run --cwd apps/admin test
PATH="/home/wim/.bun/bin:$PATH" bun test packages/frontend-shared/tests
```

Expected: PASS.

- [ ] **Step 3: Run full typecheck**

Run: `PATH="/home/wim/.bun/bin:$PATH" bun run typecheck:all`

Expected: PASS.

- [ ] **Step 4: Inspect scope**

Run: `git diff --stat main...HEAD`

Expected: changes are limited to modularity/performance, shared frontend boundaries, API client/cache helpers, JSON-safe wire types, typed service boundaries, dependency pins, and tests. No organization, team, tenant, subscription, recurring billing, seat, trial, upgrade, downgrade, cancellation, or renewal webhook support.

- [ ] **Step 5: Commit final fixes if needed**

If the sweep required fixes:

```bash
git add <fixed-files>
git commit -m "chore: finalize phase 8 verification"
```

If no files changed, do not create an empty commit.
