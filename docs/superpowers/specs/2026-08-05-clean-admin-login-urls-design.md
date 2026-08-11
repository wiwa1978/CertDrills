# Clean Admin Login URLs Design

## Goal

Prevent admin routing diagnostics such as `admin-unavailable` and `forbidden-admin` from appearing in public login URLs.

## Design

Every admin authentication or availability failure redirects to the localized login path without a `reason` query parameter. The admin proxy will use `/{locale}/login` when the API URL is missing, the admin status endpoint rejects access, or the status request fails.

The existing `callbackUrl` query parameter remains on redirects for unauthenticated protected routes because it controls post-login navigation rather than exposing a diagnostic reason.

The unused main-app login URL helper that generates `reason=forbidden-admin` will be removed. Dashboard URL generation remains unchanged.

## Error Handling

Availability failures continue to fail closed by redirecting away from protected admin pages. This change only removes public diagnostic details from the redirect URL; it does not grant access or alter status checks.

## Testing

Admin proxy tests will verify clean localized login redirects when:

- `NEXT_PUBLIC_API_URL` is unavailable.
- The admin status request throws.
- The admin status response denies access.

Existing coverage will continue to verify that unauthenticated protected routes retain their `callbackUrl`. Main-app URL tests will no longer expect or import the removed reason-producing login helper.
