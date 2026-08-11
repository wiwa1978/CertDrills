# Remaining Single-Tenant Phases Design

## Goal

Complete the remaining SaaS boilerplate work while keeping the product explicitly single-tenant and credits-billing based. This design covers Phase 7, Phase 8, and a re-scoped Phase 9. It intentionally excludes multi-tenant, organization, team, seat-management, subscription, trial, upgrade, downgrade, cancellation, and renewal-webhook support.

## Scope Decisions

- The boilerplate remains single-tenant.
- Credits are the primary billing model.
- Dodo payments remain focused on credits purchases and related credit/payment operations.
- Organization/team/seat/subscription capabilities are out of scope unless explicitly reintroduced later.
- Frontend and backend improvements should preserve existing public route behavior unless a tested contract update is included.

## Phase 7: Frontend Integration And I18n

Phase 7 makes existing user/admin flows work end-to-end and consistently across locales.

### Frontend Data Flow

- Replace client-side-only admin user search with API-backed search and pagination where current UI still filters local data.
- Replace client-side-only admin billing search with API-backed search and pagination for credits purchases, transactions, and related billing views.
- Wire checkout success/cancel outcome states into the billing page using existing server-generated checkout return behavior.
- Use server-side initial data for heavy admin pages where it reduces visible loading and duplicate client fetches without large rewrites.

### Auth And Session UX

- Use the existing impersonation banner and stop-impersonating control.
- Ensure stop impersonation works while impersonating a non-admin user.
- Refresh session/UI after 2FA, passkey, password, and other security-sensitive changes.

### I18n

- Fix locale JSON key tree mismatches across `en`, `nl`, and `fr`.
- Remove hardcoded English strings from discount, billing, notification, and admin UI touched by this phase.
- Set `<html lang>` from the active route locale.
- Preserve locale in redirects.

## Phase 8: Modularity And Performance

Phase 8 reduces duplication and avoids avoidable overhead without introducing new product concepts.

### Shared Frontend Boundaries

- Split public and admin auth clients so the public web app does not bundle admin auth capabilities.
- Move duplicated web/admin auth-session helpers into shared frontend packages when the dependency direction is clean.
- Move duplicated API client wrappers into shared frontend packages where app-specific routing/config can be injected.
- Move duplicated query providers, query keys, credits helpers, settings helpers, notification helpers, and i18n helpers where it reduces repetition without hiding app-specific behavior.

### API Client And Cache Behavior

- Split browser-cookie and bearer-token API client helpers.
- Make frontend API cache behavior configurable per request instead of forcing global `no-store`.
- Keep app service functions as thin wrappers over shared client primitives.

### Type Safety And Dependencies

- Convert wire contracts to JSON-safe types where contracts still expose non-wire-safe values.
- Keep ergonomic `Date` conversions in TypeScript/client helper layers rather than wire schemas.
- Remove `any` from critical service boundaries over time, prioritizing billing, admin, discount, voucher, and notification code.
- Pin framework dependencies to stable versions unless canary is explicitly required.

## Phase 9: Single-Tenant Credits Operations

Phase 9 is re-scoped from broad SaaS capabilities to operational features for a single-tenant credits-billing product.

### Credits And Admin Operations

- Add a credit usage API with idempotency keys and feature metering.
- Add admin credit adjustments with required reason, durable audit entry, and optional user notification.
- Keep billing adjustments credits-only; do not add subscription plans or recurring billing concepts.
- Add re-authentication for destructive admin actions where already supported by auth/session flows.
- Add optional approvals only for high-risk single-tenant admin actions if they can be implemented without organizations or teams.
- Add forced password reset after admin-set password changes if supported by the auth provider or platform-owned user state.

### Email And Webhook Operations

- Add email template management for platform emails used by the existing single-tenant app.
- Add email delivery logs.
- Add a webhook retry dashboard and dead-letter handling for payment webhook events.

### Account And Data Lifecycle

- Add data export and account deletion lifecycle for individual users.
- Add a configurable data retention policy for existing single-tenant data.

## Error Handling

- Preserve existing response envelopes and status codes unless a route-specific contract change is tested and documented.
- Avoid leaking secrets, tokens, raw webhook payloads, or full payment payloads in UI, logs, audit, or email logs.
- Treat operational side effects such as audit, notifications, and emails as best-effort unless the mutation requires them for correctness.

## Testing

Each implementation slice must include focused tests at the API, service, or frontend boundary that prove the behavior under change.

Required final verification for each phase:

- `bun run --cwd apps/api test`
- `bun run typecheck:all`
- Additional app-specific checks for changed frontend packages/apps.
- `bun run db:check` when DB schema or migrations change.

## Out Of Scope

- Multi-tenancy.
- Organizations.
- Teams.
- Invitations and seat management.
- Team roles and permissions.
- Subscription plans, trials, upgrades, downgrades, cancellations, renewal webhooks, and recurring subscription billing.
- Native app clients beyond keeping APIs and contracts ready for future clients.
