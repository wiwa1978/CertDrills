# Admin TOTP Environment Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin-wide TOTP requirement configurable through the API-only `ADMIN_PORTAL_TOTP_REQUIRED` environment variable, defaulting to disabled.

**Architecture:** Parse the policy in the API environment layer and inject it through `AuthModuleOptions.admin` into auth-core middleware. Use the same parsed value for `/admin/status`, while leaving Better Auth account-level 2FA unchanged.

**Tech Stack:** Bun, TypeScript, Hono, Zod, Better Auth, Vitest.

---

## Task 1: Inject Admin TOTP Policy

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env.example`
- Modify: `packages/auth-core/src/types.ts`
- Modify: `packages/auth-core/src/create-auth-module.ts`
- Modify: `packages/auth-core/src/middleware/require-admin-access.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/tests/app.authz.functional.test.ts`
- Modify: `apps/api/tests/app.functional.test.ts`
- Modify: `apps/api/tests/auth-core/admin-totp-policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

Update middleware/auth tests to construct admin auth options with both `totpRequired: false` and `totpRequired: true`. Assert an allowed administrator without account 2FA is accepted when disabled and receives `TWO_FACTOR_REQUIRED` when enabled. Update API route tests so `/admin/status` expects the injected env policy.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun run --cwd apps/api test tests/auth-core/admin-totp-policy.test.ts tests/app.authz.functional.test.ts tests/app.functional.test.ts
```

Expected: failure because `AuthModuleOptions.admin.totpRequired` and `env.ADMIN_PORTAL_TOTP_REQUIRED` are not implemented.

- [ ] **Step 3: Add API environment parsing**

Add to `apps/api/src/env.ts`:

```ts
ADMIN_PORTAL_TOTP_REQUIRED: z.string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["true", "false"]))
  .transform((value) => value === "true")
  .default(false),
```

Document in `apps/api/.env.example`:

```env
# Require every admin account to enable TOTP before accessing admin APIs.
# Account-level 2FA remains enforced independently when a user enables it.
ADMIN_PORTAL_TOTP_REQUIRED=false
```

- [ ] **Step 4: Inject policy into auth-core**

Extend `AuthModuleOptions.admin` and middleware options:

```ts
admin: {
  allowlist: Set<string>;
  totpRequired: boolean;
};
```

Pass `options.admin.totpRequired` into `createRequireAdminAccess` and enforce:

```ts
if (options.totpRequired && user?.twoFactorEnabled !== true) {
```

- [ ] **Step 5: Wire API bootstrap and status route**

Pass the parsed value in `apps/api/src/bootstrap.ts`:

```ts
admin: {
  allowlist: adminAllowlist,
  totpRequired: env.ADMIN_PORTAL_TOTP_REQUIRED,
},
```

Report the same value from `/admin/status`:

```ts
totpRequired: env.ADMIN_PORTAL_TOTP_REQUIRED,
```

- [ ] **Step 6: Run targeted tests and typechecks**

```bash
bun run --cwd apps/api test tests/auth-core/admin-totp-policy.test.ts tests/app.authz.functional.test.ts tests/app.functional.test.ts
bun run --cwd apps/api typecheck
bun run typecheck:packages
```

Expected: all commands pass.

- [ ] **Step 7: Run full API tests**

```bash
bun run --cwd apps/api test
```

Expected: all API tests pass.
