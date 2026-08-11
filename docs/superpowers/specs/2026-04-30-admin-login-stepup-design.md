# Admin Portal Login Step-Up Design (Better Auth TOTP + Global Admin Secret)

## Context

`apps/admin` is a dedicated admin portal. Only users with role `admin` are allowed to access it. Normal users must never access admin pages or admin APIs.

The admin login flow must require four factors at login time:

1. Email
2. Password
3. Global `ADMIN_BAN_SECRET` (env secret already in use)
4. Better Auth TOTP code (30-second rotating authenticator code)

This design treats all login attempts in `apps/admin` as admin-only attempts and adds strict, defense-in-depth enforcement in both the web app and Hono API layer.

Admin bootstrap enrollment visibility is additionally restricted by server-side allowlist policy: only authenticated users with role `admin` whose email is present in `ADMIN_ALLOWLIST` may see TOTP enrollment setup artifacts (secret/URI/QR) or complete first-time enrollment in the admin portal.

## Goals

- Ensure normal users can never access the admin portal.
- Require `ADMIN_BAN_SECRET` + Better Auth TOTP for admin login.
- Avoid security gaps between primary auth and step-up verification.
- Support first-time mandatory TOTP enrollment for admin users who are not yet enrolled.

## Non-Goals

- No changes to normal user login in `apps/web`.
- No custom OTP algorithm; Better Auth remains source of truth for TOTP.
- No role changes, no new roles, no superadmin branch in this codebase.

## High-Level Approach

Use a two-phase admin-app login, with hard gating:

1. Primary credential check (`email` + `password`) through Better Auth.
2. Step-up verification (`ADMIN_BAN_SECRET` + TOTP) in `apps/admin`.
3. Admin access is blocked until a server-issued, short-lived "step-up verified" marker is present.

Key safety point: even if Better Auth establishes a base session after phase 1, admin pages and admin APIs still deny access until phase 2 finishes.

## Architecture

### 1) Admin Login UI (`apps/admin`)

- Keep login in `apps/admin/src/app/[locale]/(frontend)/(auth)/login/page.tsx`.
- Extend form to collect `adminSecret` and `totpCode` in addition to existing fields.
- Submission behavior:
  1. Authenticate with email/password.
  2. Enforce role is `admin`.
  3. Verify global admin secret server-side.
  4. Verify TOTP with Better Auth for the authenticated user.
  5. Set step-up marker.
  6. Redirect to admin landing page.

If any check fails, return a generic failure message and do not grant admin access.

### 2) Step-Up Marker

Create a dedicated "admin step-up verified" marker with the following properties:

- HttpOnly cookie (or equivalent server session attribute), scoped to `apps/admin`.
- Bound to current user/session identity.
- Short TTL (recommended: 12 hours).
- Cleared on logout and when session changes.

This marker is mandatory for all admin route access after authentication.

### 3) Route Guard in Admin App

Update `apps/admin/src/proxy.ts` route checks:

- Keep existing authenticated + admin-role requirements.
- Add a new check for step-up marker validity.
- If marker missing/invalid:
  - Redirect to admin login or dedicated step-up route.
  - Never allow backend page render for protected admin routes.

### 4) API Guard in Hono (`apps/api`)

For `/admin/*` API handlers:

- Keep existing `requireAuth` and `requireAdminAccess`.
- Add middleware/guard requiring valid step-up marker in addition to role check.
- Return `403` for missing/invalid marker.

This guarantees defense in depth: UI and API both enforce step-up.

### 5) Admin Secret Verification

- Reuse existing env-backed secret (`ADMIN_BAN_SECRET`) in API/service layer.
- Verify using timing-safe compare.
- Never expose secret details to client.
- Failure response remains generic.

### 6) Better Auth TOTP Verification

- Use Better Auth 2FA verification APIs for current session user.
- TOTP code accepted as 6-digit authenticator code (30-second rotation).
- No custom TOTP implementation.

### 7) Mandatory First-Time TOTP Enrollment (Chosen Option 2)

If authenticated `admin` has no TOTP enrolled:

- Redirect to forced enrollment flow before portal access.
- Enrollment must complete successfully before step-up can be marked verified.
- Do not permit access to protected admin routes while enrollment is pending.
- Enrollment UI and setup artifacts are shown only when backend confirms:
  - user role is `admin`, and
  - user email is in `ADMIN_ALLOWLIST`.
- Non-allowlisted or non-admin users must never receive enrollment secret, TOTP URI, or QR payload.

### 8) Allowlist-Gated Enrollment Capability

Add explicit backend capability flag in admin status response:

- `canEnrollTotp: boolean`
- Computed server-side from authenticated identity (not from client-submitted email):
  - `isAdminRole && isEmailInAdminAllowlist`

Usage contract:

- Frontend may render enrollment setup (including QR code) only when:
  - `totpRequired === true`
  - `twoFactorEnabled === false`
  - `canEnrollTotp === true`
- If enrollment is required but `canEnrollTotp === false`, deny with generic message and no setup payload.
- Enrollment endpoints must enforce the same rule and return `403` on violation.

## Detailed Flow

### Existing Admin User With TOTP

1. User submits email/password/adminSecret/totpCode.
2. Email/password auth succeeds.
3. Role is verified as `admin`.
4. `ADMIN_BAN_SECRET` matches.
5. Better Auth TOTP verifies.
6. Step-up marker is set.
7. User is redirected to `/admin/overview`.

### Admin User Without TOTP

1. User submits login form.
2. Email/password + role + admin secret checks pass.
3. System detects no TOTP enrollment.
4. Backend computes `canEnrollTotp` from role + `ADMIN_ALLOWLIST`.
5. If `canEnrollTotp` is false, enrollment is denied and no setup secret/URI/QR is returned.
6. If `canEnrollTotp` is true, user is redirected to forced TOTP enrollment UI.
7. On successful enrollment and first verification, step-up marker is set.
8. User can access admin routes.

### Non-Admin User Attempt

1. Email/password may be valid for non-admin account.
2. Role check fails for admin portal context.
3. Attempt is rejected with generic message.
4. No admin access, no step-up marker.

## Security Considerations

- Admin-only app does not imply trust; every request still checks role + step-up marker.
- No "half-auth" access: base session alone cannot access admin routes/API.
- Secret compare uses timing-safe logic.
- Step-up endpoints are rate-limited per IP/session.
- Error messages remain intentionally generic to reduce enumeration and side-channel leakage.
- Step-up marker TTL limits blast radius if session is stolen.
- Frontend never grants enrollment based on typed email; only server-evaluated authenticated identity may unlock enrollment setup.
- QR/setup secrets are only emitted to allowlisted admin identities.

## Testing Strategy (TDD)

### Unit/Service

- Secret verification: configured/unconfigured/invalid/valid cases.
- Step-up marker issue/validate/expire behaviors.
- Enrollment-required detection for admin users.

### Route/Middleware

- Admin route requires authenticated admin role.
- Admin route also requires valid step-up marker.
- Missing marker redirects/denies even with valid base session.
- Non-admin users are always denied.

### API Integration

- `/admin/*` rejects missing marker (`403`).
- `/admin/*` accepts valid marker + admin role.
- Secret+TOTP verification endpoint denies invalid inputs.
- Rate limiting behavior verified.
- Enrollment capability endpoint returns `canEnrollTotp=false` for non-allowlisted identities.
- Enrollment endpoint rejects attempts when `canEnrollTotp=false` even if client calls it directly.

### E2E

- Happy path: admin login with all factors -> dashboard.
- Invalid secret path -> denied.
- Invalid TOTP path -> denied.
- No-enrollment path -> forced enrollment -> access granted only after completion.
- Non-admin credentials in admin app -> denied.

## Rollout Notes

- Deploy behind feature flag if needed for safe rollout.
- Seed/confirm `ADMIN_BAN_SECRET` in admin environments.
- Communicate mandatory authenticator enrollment to current admins.

## Acceptance Criteria

1. Admin login in `apps/admin` requires password + global admin secret + Better Auth TOTP.
2. Non-admin users cannot access `apps/admin` routes or `/admin/*` APIs.
3. No admin access is possible with only primary auth session.
4. Admin users without TOTP are forced through enrollment before access.
5. All new behaviors are covered by automated tests.
6. TOTP enrollment setup artifacts (including QR code) are visible only to authenticated users with role `admin` and email in `ADMIN_ALLOWLIST`.
