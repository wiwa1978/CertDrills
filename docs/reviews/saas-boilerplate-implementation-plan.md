# SaaS Boilerplate Implementation Plan

This plan combines the security/performance/modularity review, the feature functionality review, and the API portability/OpenAPI review. It is ordered so the codebase gets safer first, then the API contract becomes standalone and technology-independent, then feature behavior is made correct, then broader SaaS capabilities can be added.

## Execution Order

1. Add baseline safety nets.
2. Make the API contract portable, complete, and OpenAPI-driven.
3. Harden security-sensitive flows.
4. Fix billing and payment lifecycle correctness.
5. Fix discount and voucher semantics.
6. Make notifications, logging, and audit reliable.
7. Complete frontend feature wiring and i18n.
8. Improve modularity and performance.
9. Add larger SaaS boilerplate capabilities.

## Implementation Strategy

The plan should be implemented as small, independently verifiable slices. Do not try to complete a whole phase in one pass. Start with safety rails and contract foundations, then use those rails to make behavior changes.

Recommended first implementation sequence:

1. Add package typechecking and CI-style scripts.
2. Add API contract/route coverage scaffolding without changing endpoint behavior.
3. Standardize the lowest-risk contract mismatch first, such as `/countries`.
4. Fix bearer-token and mobile-refresh auth lifecycle issues.
5. Add OpenAPI coverage endpoint-by-endpoint, starting with public/system and `/me` routes.
6. Add payment webhook storage only after migration tooling exists.
7. Continue into billing, discounts, vouchers, notifications, and audit once the above foundations are stable.

Definition of done for each slice:

- Typecheck passes for all touched apps and packages.
- Existing tests pass, or failures are documented as pre-existing.
- New behavior has tests at the API/service boundary.
- Public API changes are reflected in wire contracts and OpenAPI.
- Response/error shape changes are either backward-compatible or explicitly handled as a versioned API change.
- Security-sensitive changes include negative tests.

## Phase 1: Baseline Safety Nets

Goal: make the existing codebase safer to change before modifying behavior.

- Add `tsconfig` files for all `packages/*`.
- Add root scripts for `typecheck:packages` and `typecheck:all`.
- Add Drizzle config, migrations folder, migration generation/apply scripts, and CI migration validation.
- Add tests for mobile refresh and bearer-token auth gates.
- Add tests for admin ban step-up enforcement.
- Add tests for checkout redirect allowlisting.
- Add tests for webhook idempotency and replay behavior.
- Add tests for `pending -> completed` payment transitions.
- Add tests for failed/refunded payment handling.
- Add tests for discount provider sync and selected-user eligibility.
- Add tests for voucher redemption when notification creation fails.
- Add tests for notification limits and banner retrieval.
- Add contract tests for JSON-safe wire schemas.
- Add route coverage tests that fail when a mounted API route is missing from OpenAPI.
- Add OpenAPI validation in CI.
- Add generated API client typecheck in CI.
- Align implementation responses with contracts before expanding new behavior.

## Phase 2: API Portability And OpenAPI Contract

Goal: make the API a standalone, technology-independent contract that can be consumed by web, admin, iOS, Android, and future backend implementations in .NET, Python, or another stack.

### OpenAPI As The External Contract

- Make OpenAPI the authoritative external API contract.
- Replace the current partial manual OpenAPI spec with a complete route manifest or colocated route metadata.
- Document every mounted route, including system, logs, payments, mobile auth, admin auth, session, `/me/*`, `/admin/*`, webhooks, and BetterAuth-compatible auth routes.
- Add `operationId`, tags, security, path params, query schemas, request bodies, success responses, and error responses for every endpoint.
- Generate OpenAPI from `packages/contracts/src/wire` schemas instead of ad hoc descriptions.
- Replace the current OpenAPI test that protects the small path list with route coverage tests that fail when any route is undocumented.
- Validate the OpenAPI document in CI with a spec validator.
- Generate API clients from OpenAPI in CI and typecheck them.
- Align Swagger/Scalar docs routes with README and expose one clear docs entrypoint.
- Document webhook signature headers, raw-body requirements, auth schemes, pagination, errors, rate limits, and examples for external clients.

### Contract And Versioning

- Add API versioning before native clients ship, preferably `/api/v1`.
- Decide a compatibility strategy for existing unversioned routes.
- Standardize all API success responses on one envelope.
- Standardize all API error responses with `success: false`, `error`, stable `errorCode`, optional `details`, and `requestId`.
- Convert wire date fields to ISO 8601 strings with OpenAPI `date-time` format.
- Standardize pagination, preferably one model for list endpoints and cursor pagination for mobile feeds.
- Reconcile runtime/contract mismatches such as `/countries` returning a raw array while the wire contract expects an envelope.
- Enforce imports from `@platform/contracts/wire` in API code.
- Reserve `@platform/contracts/ts` for TypeScript client helpers and route builders.

### Generated Clients

- Replace hand-written frontend API path strings and inline response types with generated OpenAPI types/client wrappers.
- Remove or deprecate the current tiny `openapi-types.ts` files.
- Keep app-specific service functions as thin wrappers around generated clients where useful.
- Generate or document Swift/Kotlin clients once the OpenAPI contract is complete and versioned.
- Add drift tests that compare mounted routes, contract schemas, OpenAPI output, and generated clients.

### Platform Auth Facade

- Define platform-owned auth endpoints and response contracts instead of exposing BetterAuth behavior as the long-term client contract.
- Keep BetterAuth as the current implementation behind the platform facade.
- Add facade contracts for login, logout, session, refresh, revoke, email verification, password reset, 2FA challenge/verify, social/native auth, device sessions, and admin auth operations.
- Update clients to call platform-owned endpoints where possible.
- Document cookie and bearer flows separately.
- Ensure a future .NET or Python API can implement the same auth contract without reusing BetterAuth internally.

### Multi-Client And Native Readiness

- Add a bearer-token-first API client for non-browser clients.
- Add access-token provider and refresh/retry handling to shared clients.
- Avoid `credentials: include` by default for bearer/native clients.
- Add mobile device metadata: `deviceId`, `deviceName`, `platform`, `lastUsedAt`, and token family/client ID.
- Add per-device session list and revoke endpoints.
- Add a mobile 2FA challenge/verify flow.
- Plan native social/OIDC flows for iOS and Android.
- Re-check account lifecycle state on bearer requests and mobile refresh.
- Add token revocation or session-version support for bans, password resets, and security changes.

## Phase 3: Security Hardening

Goal: close the highest-risk auth, admin, logging, and request-abuse issues.

- Catch JWT verification errors in bearer-token auth and return `401` instead of surfacing server errors.
- Re-check banned, email-verified, and 2FA-required account state on bearer-token auth.
- Re-check banned, email-verified, and 2FA-required account state on mobile refresh-token exchange.
- Revoke mobile refresh tokens when users are banned, deleted, password-reset, or security-sensitive state changes.
- Enforce admin ban step-up on the actual ban mutation, not only in a UI pre-check.
- Apply the regular password policy to admin-set passwords.
- Add global request body limits.
- Add stricter per-route limits for auth, checkout, voucher redemption, admin mutations, logs, and webhooks.
- Add rate limiting for auth, mobile token exchange, mobile refresh, voucher redemption, checkout, ban-secret verification, and client log ingestion.
- Redact logs before persistence.
- Restrict checkout `successUrl` and `cancelUrl` to first-party origins, or accept relative paths and construct URLs server-side.
- Strengthen environment validation for production secrets and provider configuration.
- Require a webhook secret when Dodo payments are enabled.

## Phase 4: Billing And Payments

Goal: make credit purchases correct, idempotent, and reconcilable.

- Add webhook event storage with provider event ID, signature timestamp, event type, processing status, and error details.
- Use webhook event storage for idempotency and replay protection.
- Validate webhook product ID, user ID metadata, amount, currency, and tax before granting credits.
- Reject successful payment events with missing or invalid amount/currency.
- Add explicit handlers for `pending`, `completed`, `failed`, `refunded`, and dispute/chargeback events supported by Dodo.
- Add a `creditsGrantedAt` marker or equivalent idempotency field for purchases.
- Grant credits exactly once when a purchase first transitions to `completed`.
- Implement refund/reversal credit transactions.
- Update admin billing views to show real payment lifecycle states.
- Add provider call timeouts and sanitized error handling for Dodo invoice and discount calls.
- Generate checkout success/cancel URLs server-side.
- Wire frontend success/cancel outcome messaging after checkout.
- Consider storing invoice/customer/tax snapshots locally for accounting and support.

## Phase 5: Discounts And Vouchers

Goal: make discount and voucher behavior match what the UI promises.

### Discount Model Decision

Choose one model before implementation:

- Provider-enforced discounts: Dodo is the source of truth for eligibility and usage.
- Local-only discounts: the app validates eligibility before checkout and only passes valid discount usage to Dodo.
- Hybrid discounts: local eligibility is synced to Dodo and reconciled after provider events.

Recommendation: prefer provider-enforced eligibility if Dodo supports it. If not, remove selected-user semantics from discounts and use vouchers for user-specific credits.

### Discount Tasks

- Enforce selected-user discount eligibility at checkout or remove the selected-user UI.
- Stop using `currentUses` as assignment count.
- Separate assignment count from redemption count.
- Track actual discount redemptions from provider events or checkout completion.
- Add a unique DB constraint on `(discountId, userId)` for discount assignments.
- Make discount create/update/delete provider sync reliable with DB transactions plus provider compensation or an outbox.
- Sync provider-relevant updates including code, status, amount, expiry, usage limit, and restrictions.
- Prevent orphaned Dodo discounts when local persistence fails.
- Wire `sendEmail` and `sendNotification` toggles, or remove them until implemented.
- Make discount edit update user assignments.
- Recompute or refresh discount status consistently in list and detail views.
- Fix discount contract/schema mismatches around supported types.

### Voucher Tasks

- Add voucher delete/archive endpoint, or explicitly document vouchers as deactivate-only.
- Change all-user voucher default `maxRedemptions` away from `1`, or make the UI warning explicit.
- Reject voucher updates where `maxRedemptions < currentRedemptions`.
- Treat post-redemption notification failure as non-fatal.
- Prefer an outbox for voucher redemption notifications.
- Add tests for concurrent voucher redemption and duplicate user redemption.

## Phase 6: Notifications, Logging, And Audit

Goal: make operational and user-facing communication reliable.

### Notifications

- Honor `/me/notifications?limit=` in the API.
- Render active banner notifications in web and admin layouts.
- Expose targeted notification sending in the admin UI.
- Batch `sendNotificationToAllUsers`, or convert it to a background job/outbox.
- Validate target users for targeted sends.
- Return sent, skipped, and invalid recipient counts for targeted notifications.
- Add admin notification recipient history.
- Add read/delivery visibility where applicable.
- Decide whether notification title/message fields store literal text or translation keys, then make contracts and clients consistent.

### Logging

- Keep client log ingestion constrained and rate-limited.
- Redact sensitive keys and patterns from client log `message`, `url`, and `context`.
- Persist sanitized, bounded client log context locally; no external error-reporting provider is configured.
- Replace sync file logging with async/buffered logging or stdout plus a collector.
- Tail log files by bounded bytes instead of reading whole files into memory.

### Audit

- Add audit entries for role changes.
- Add audit entries for bans and unbans.
- Add audit entries for impersonation start/stop.
- Add audit entries for password resets and admin-set passwords.
- Add audit entries for discount and voucher mutations.
- Add audit entries for notification sends.
- Add audit entries for billing adjustments, refunds, and webhook processing failures.
- Include actor ID, target ID, request ID, IP, user-agent, action, outcome, and safe before/after summaries.
- Do not log secrets, tokens, passwords, raw headers, or full payment payloads.

## Phase 7: Frontend Integration And I18n

Goal: make user/admin flows work end-to-end and consistently across locales.

- Replace client-side-only admin user search with API-backed search and pagination.
- Replace client-side-only admin billing search with API-backed search and pagination.
- Replace manual frontend API strings and inline response types with generated OpenAPI-backed clients.
- Wire checkout success/cancel states into the billing page.
- Use server-side initial data for heavy admin pages where practical.
- Use the existing impersonation banner and stop-impersonating control.
- Ensure stop impersonation works even while impersonating a non-admin user.
- Refresh session/UI after 2FA, passkey, password, and other security changes.
- Fix locale JSON key tree mismatches across `en`, `nl`, and `fr`.
- Remove hardcoded English strings from discount, billing, notification, and admin UI.
- Set `<html lang>` from the active route locale.
- Preserve locale in redirects.

## Phase 8: Modularity And Performance

Goal: reduce duplication, improve package boundaries, and remove avoidable overhead.

- Split public and admin auth clients so the public web app does not bundle admin auth capabilities.
- Move duplicated web/admin auth-session helpers into shared frontend packages.
- Move duplicated API client wrappers into shared frontend packages where app-specific routing/config can be injected.
- Move duplicated query providers and query keys where appropriate.
- Move duplicated credits, settings, notification, and i18n helpers where appropriate.
- Split browser-cookie and bearer-token API client helpers.
- Make frontend API cache behavior configurable per request instead of forcing global `no-store`.
- Convert wire contracts to JSON-safe types.
- Keep ergonomic `Date` conversions in TypeScript/client helper layers instead of wire schemas.
- Remove `any` from critical service boundaries over time, especially billing, admin, discount, voucher, and notification code.
- Pin framework dependencies to stable versions unless canary is explicitly required.

## Phase 9: Larger SaaS Boilerplate Capabilities

Goal: add features expected from a reusable SaaS starter after current behavior is correct.

- Organizations and teams.
- Invitations and seat management.
- Team roles and permissions.
- Subscription plans, trials, upgrades, downgrades, cancellations, and renewal webhooks.
- Credit usage API with idempotency keys and feature metering.
- Admin credit adjustments with required reason, audit trail, and optional user notification.
- Email template management.
- Email delivery logs.
- Webhook retry dashboard and dead-letter handling.
- Data export and account deletion lifecycle.
- Configurable data retention policy.
- Re-authentication for destructive admin actions.
- Optional approvals for high-risk admin actions.
- Forced password reset after admin-set password changes.

## Key Product Decisions

These should be answered before implementation starts on the related phase.

| Decision | Recommendation |
| --- | --- |
| Discount eligibility model | Prefer provider-enforced eligibility if Dodo supports it; otherwise remove selected-user discounts and use vouchers for user-specific credits. |
| Notification delivery | Prefer an outbox/job model for bulk sends and post-transaction notifications. |
| Logging storage | Prefer stdout/collector or structured async logging over local JSONL files for production. |
| Billing model | Decide whether credits are the primary billing model or whether subscriptions should become first-class. |
| API versioning | Prefer `/api/v1` before native clients ship; keep unversioned routes only as temporary compatibility aliases if needed. |
| API contract source | Make OpenAPI generated from `@platform/contracts/wire` the external source of truth. |
| Auth contract | Prefer a platform-owned auth facade so clients do not depend directly on BetterAuth semantics. |
| Client generation | Generate web, admin, Swift, and Kotlin clients from OpenAPI once the spec is complete. |
| Native auth model | Use bearer tokens with device-bound refresh tokens, per-device revocation, and mobile 2FA challenge/verify. |

## Initial Milestone Proposal

Milestone 1 should focus only on safety and correctness prerequisites. Split it into the work packages below so implementation can start immediately without blocking on large product decisions.

### Work Package 1: Typecheck And Package Safety

Goal: make shared packages independently verifiable.

- Add `tsconfig.json` for each package that exports TypeScript source.
- Add package-level `typecheck` scripts where useful.
- Add root `typecheck:packages` and `typecheck:all` scripts.
- Ensure app typechecks still pass.

Definition of done:

- `bun run typecheck:packages` passes.
- `bun run typecheck:all` passes, or any existing app failures are documented before follow-up fixes.

### Work Package 2: Contract And OpenAPI Baseline

Goal: make API documentation coverage measurable before filling every schema.

- Add a central list of app-owned API routes or route metadata.
- Replace the existing OpenAPI exact-small-list test with a coverage test that compares expected app-owned routes to the generated spec.
- Keep BetterAuth-generated routes separate from app-owned routes until the platform auth facade is designed.
- Add OpenAPI spec validation in API tests.
- Add the missing existing routes to OpenAPI with minimal schemas first, then enrich schemas in follow-up slices.

Definition of done:

- Every app-owned route is either documented in OpenAPI or explicitly listed as intentionally internal/excluded.
- The OpenAPI document validates.
- The test suite fails when a new route is added without documentation metadata.

### Work Package 3: Response And Error Envelope Baseline

Goal: make multi-client response handling predictable.

- Choose the canonical success envelope.
- Choose the canonical error envelope.
- Add helper functions for successful responses, validation errors, unauthorized errors, forbidden errors, not-found errors, and server errors.
- Start with low-risk endpoints such as `/health`, `/countries`, and `/me/session`.
- Decide whether envelope changes are made on existing unversioned routes or reserved for `/api/v1`.

Definition of done:

- Wire schemas, runtime responses, and OpenAPI agree for converted endpoints.
- Client code is updated for converted endpoints.
- Tests cover success and validation/error responses.

### Work Package 4: API Versioning Decision

Goal: avoid locking mobile clients into unstable unversioned URLs.

- Decide whether to introduce `/api/v1` now or after response-envelope cleanup.
- Decide whether unversioned routes remain as compatibility aliases.
- Document the versioning policy in this plan and README/API docs.

Decision:

- Introduce `/api/v1` as the canonical stable external prefix after the response
  and auth contract baseline is sufficiently hardened for native clients.
- Keep existing unversioned app-owned routes as temporary compatibility aliases
  when `/api/v1` is mounted.
- Do not point generated/native clients at unversioned routes. They should target
  `/api/v1` once aliases are available.
- Runtime aliases are intentionally deferred from this work package; this slice
  documents the policy and updates OpenAPI server strategy only.

Definition of done:

- Versioning decision is documented.
- Route mounting strategy is clear enough for implementation.
- OpenAPI server/path strategy is updated accordingly.

### Work Package 5: Auth Lifecycle Hardening

Goal: make bearer/native auth safe before relying on it for mobile clients.

- Catch invalid bearer-token verification and return `401`.
- Re-check account lifecycle state on bearer-token auth.
- Re-check account lifecycle state on mobile refresh.
- Add tests for invalid bearer token, banned bearer user, deleted bearer user, banned refresh user, and revoked refresh token.

Definition of done:

- Invalid bearer tokens never produce `500`.
- Banned/deleted/ineligible users cannot authenticate with existing bearer or refresh tokens.
- Tests cover the negative cases.

### Work Package 6: Logging Redaction And Request Abuse Guardrails

Goal: reduce sensitive data leakage and obvious abuse before expanding clients.

- Add centralized redaction for client and server logs.
- Limit client log payload size/depth.
- Add basic request body limits for JSON endpoints and webhooks.
- Add first-pass rate limits for auth, mobile refresh, checkout, voucher redemption, and client log ingestion.

Definition of done:

- Sensitive keys and URL token patterns are redacted in tests.
- Oversized payloads are rejected predictably.
- Rate-limited endpoints return a documented error shape.

### Work Package 7: Checkout And Admin Critical Security Fixes

Goal: close known high-risk business-flow gaps.

- Restrict checkout return URLs to first-party origins or server-generated relative paths.
- Enforce admin ban step-up on the actual ban mutation.
- Apply password policy to admin-set passwords.

Definition of done:

- Open redirect cases are rejected.
- Direct API ban calls cannot bypass step-up validation.
- Weak admin-set passwords are rejected.

### Work Package 8: Migration Tooling Before Payment Storage

Goal: make database changes safe before adding webhook event storage.

- Add Drizzle config and migration generation/apply scripts.
- Add a migrations folder and document the workflow.
- Add CI validation for schema/migration drift if feasible.

Definition of done:

- A developer can generate and apply migrations from documented commands.
- New DB-backed features are not implemented without migrations.

After these work packages, billing and discount behavior can be fixed with much lower regression risk.
