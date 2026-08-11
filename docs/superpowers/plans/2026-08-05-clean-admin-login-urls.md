# Clean Admin Login URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove public admin diagnostic reason parameters while preserving secure redirects and functional callback URLs.

**Architecture:** Normalize authenticated admin-route failures in the admin proxy to the same localized login URL. Delete the unused helper that generates the separate forbidden-admin reason URL, while leaving dashboard URL construction and unauthenticated callback behavior intact.

**Tech Stack:** TypeScript, Next.js proxy middleware, Vitest, Bun

---

### Task 1: Cover Clean Admin Proxy Redirects

**Files:**
- Modify: `apps/admin/tests/proxy-locale.test.ts`

- [ ] **Step 1: Write failing redirect tests**

Add tests after the existing admin-status URL test:

```ts
it("uses a clean localized login URL when the API URL is unavailable", async () => {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_API_URL;
  vi.doMock("better-auth/cookies", () => ({
    getSessionCookie: () => "session-token",
  }));

  const { proxy } = await import("../src/proxy");
  const response = await proxy(new NextRequest("http://localhost/nl/admin/overview"));

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost/nl/login");
});

it("uses a clean localized login URL when the admin status request fails", async () => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_API_URL = "http://public-api.example";
  vi.doMock("better-auth/cookies", () => ({
    getSessionCookie: () => "session-token",
  }));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API unavailable")));

  const { proxy } = await import("../src/proxy");
  const response = await proxy(new NextRequest("http://localhost/nl/admin/overview"));

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost/nl/login");
});
```

The existing `uses NEXT_PUBLIC_API_URL for server-side admin session checks` test already covers a denied status response and expects a clean URL. The existing unauthenticated-route test must continue expecting its `callbackUrl`.

- [ ] **Step 2: Run the proxy tests and verify failure**

Run: `bun run --cwd apps/admin test -- tests/proxy-locale.test.ts`

Expected: the two new tests fail because the redirects contain `?reason=admin-unavailable`.

- [ ] **Step 3: Simplify the proxy login URL builder**

In `apps/admin/src/proxy.ts`, replace the optional-reason helper with:

```ts
function adminLoginUrl(request: NextRequest, locale: string) {
  return new URL(`/${locale}/login`, request.url);
}
```

Update both availability redirects to call it without a reason:

```ts
return NextResponse.redirect(adminLoginUrl(request, activeLocale));
```

Use the same helper for the non-OK admin status response:

```ts
return NextResponse.redirect(adminLoginUrl(request, activeLocale));
```

- [ ] **Step 4: Run the proxy tests and verify success**

Run: `bun run --cwd apps/admin test -- tests/proxy-locale.test.ts`

Expected: all proxy locale tests pass, including the unchanged callback URL assertion.

### Task 2: Remove the Forbidden-Reason URL Helper

**Files:**
- Modify: `apps/admin/src/lib/main-app-url.ts`
- Modify: `apps/admin/tests/lib/main-app-url.test.ts`

- [ ] **Step 1: Remove obsolete login-helper expectations**

Change the test import to:

```ts
import { getMainAppDashboardUrl } from "../../src/lib/main-app-url";
```

Delete the `prefers NEXT_PUBLIC_MAIN_APP_URL` and `falls back to NEXT_PUBLIC_API_URL and NEXT_PUBLIC_APP_URL` tests because they only cover the unused reason-producing login helper. Retain the dashboard URL test unchanged.

- [ ] **Step 2: Remove the unused helper**

Delete `getMainAppLoginUrl` from `apps/admin/src/lib/main-app-url.ts`, leaving `getMainAppDashboardUrl` as the only export:

```ts
export function getMainAppDashboardUrl(locale: string) {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return "";

  const normalized = base.replace(/\/$/, "");
  return `${normalized}/${locale}/dashboard`;
}
```

- [ ] **Step 3: Verify no public admin reason producers remain**

Run: `rg "admin-unavailable|forbidden-admin|reason=" apps/admin/src`

Expected: no matches.

- [ ] **Step 4: Run focused admin tests**

Run: `bun run --cwd apps/admin test -- tests/proxy-locale.test.ts tests/lib/main-app-url.test.ts`

Expected: both test files pass.

### Task 3: Full Verification

**Files:**
- No additional code changes expected.

- [ ] **Step 1: Run formatting checks on the diff**

Run: `git diff --check`

Expected: exit code 0 with no output.

- [ ] **Step 2: Run the complete CI suite**

Run: `bun run test:ci`

Expected: API, web, admin, and frontend-shared test suites all pass.

- [ ] **Step 3: Inspect the final reason search and worktree**

Run: `rg "admin-unavailable|forbidden-admin|reason=" apps/admin/src && git status --short`

Expected: `rg` has no matches; `git status --short` lists only intended existing worktree changes plus the clean-login URL implementation and documentation.
