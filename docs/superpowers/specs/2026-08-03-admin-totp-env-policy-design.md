# Admin TOTP Environment Policy Design

## Context

The admin API currently reads `authConfig.adminPortalTotpRequired`, a static shared value, when deciding whether every administrator must enable two-factor authentication. Better Auth separately enforces account-level two-factor authentication during sign-in when a user has personally enabled it.

The admin-wide policy should be configurable per API deployment without exposing a browser-controlled security flag.

## Design

- Add `ADMIN_PORTAL_TOTP_REQUIRED` to `apps/api/src/env.ts` as a boolean environment variable that defaults to `false`.
- Document `ADMIN_PORTAL_TOTP_REQUIRED=false` in `apps/api/.env.example` under admin protections.
- Extend `AuthModuleOptions.admin` with `totpRequired: boolean`.
- Pass the API environment value from `apps/api/src/bootstrap.ts` into `createAuthModule`.
- Pass the value from `createAuthModule` into `createRequireAdminAccess`.
- Update `createRequireAdminAccess` to enforce the injected policy rather than importing the static `authConfig.adminPortalTotpRequired` value.
- Update `GET /admin/status` to report the same API environment value.
- Keep Better Auth account-level 2FA unchanged. If an administrator has personally enabled 2FA, sign-in still requires their authenticator code even when the admin-wide policy is disabled.

## Environment

Add to `apps/api/.env` or the deployed API container environment:

```env
ADMIN_PORTAL_TOTP_REQUIRED=false
```

Do not add this setting to `apps/admin/.env`; the browser must not control the enforcement policy.

## Error Handling

When the policy is enabled and the authenticated administrator has not enabled 2FA, admin access continues to return `403` with `TWO_FACTOR_REQUIRED` and redirects to the settings enrollment flow. Invalid boolean values fail API environment validation during startup.

## Testing

- Verify the API environment defaults the policy to `false`.
- Verify explicit `true` and `false` values are parsed correctly.
- Verify admin middleware allows an eligible admin without 2FA when the policy is disabled.
- Verify admin middleware rejects the same admin when the policy is enabled.
- Verify `/admin/status` reports the injected policy value.
- Run API tests, API typecheck, and package typechecks.
