# Phase 6 Notifications, Logging, And Audit Design

## Goal

Make operational and user-facing communication reliable across notifications, logging, and audit. Phase 6 will be implemented as one larger branch, but internally staged into reviewable slices so each subsystem can be verified independently.

## Current State

Notifications already have API/service support for user listing, unread counts, marking read, admin listing, send-to-all, and targeted sends. Gaps remain: `/me/notifications?limit=` is ignored, active banners are not rendered in web/admin layouts, targeted sends do not validate recipients, targeted sends return only a count, and there is no durable recipient history.

Client log ingestion is constrained and rate-limited, and server logs are structured JSONL. Gaps remain: client log `message`, `url`, and `context` need consistent redaction before persistence; file log reads should be bounded by bytes instead of reading whole files into memory.

Audit currently exists only as JSONL logger plumbing and is not called by mutation paths. There is no DB-backed audit store. Phase 6 will add durable DB audit entries as the source of truth.

## Product Decisions

- Audit entries are durable DB records, not only file-based JSONL.
- Notification `title` and `message` are literal canonical text fields.
- Optional multilingual notification content may continue to live in `data.translations`, but clients and contracts treat `title` and `message` as required canonical text.
- Whole Phase 6 will be completed in one larger implementation branch, staged internally by subsystem.

## Architecture

### Audit Store

Add an `audit_entries` table in `packages/platform-db` and migration coverage. The table stores:

- `id`
- `action`
- `outcome`
- `actorId`
- `targetType`
- `targetId`
- `requestId`
- `ip`
- `userAgent`
- `before`
- `after`
- `metadata`
- `createdAt`

`before`, `after`, and `metadata` are safe JSON summaries only. They must not contain secrets, tokens, raw headers, passwords, raw webhook payloads, or full payment payloads.

Add an API audit service/helper responsible for validating and redacting audit input before insert. It should accept request context from route handlers and expose a small interface such as `recordAuditEntry(input)`. Domain services that do not have request context should either receive an optional audit context or be wrapped by route-level audit calls.

### Audit Instrumentation

Record DB audit entries for:

- Admin role changes.
- Admin bans and unbans.
- Impersonation start and stop.
- Admin-set passwords. Password reset events are audited only when the current code exposes a platform-owned route or callback that can safely identify the target user; Better Auth internal flows without an observable hook are documented as a remaining gap instead of guessed.
- Discount create, update, and delete.
- Voucher create and update.
- Notification send-to-all and send-to-users.
- Webhook processing failures, with safe provider event metadata only.

Billing adjustments and refunds will be audited when the corresponding mutation paths exist. Current webhook processing failures are in scope because webhook handling exists.

### Notifications

Honor `/me/notifications?limit=` by parsing `optionalLimitQuerySchema` and passing the normalized limit to `notificationsService.listForUser`.

Render active banner notifications in web and admin authenticated layouts. Use existing notification services where possible and avoid adding a separate banner endpoint unless the current list call becomes insufficient. A banner is active when `showAsBanner` is true and `bannerExpiresAt` is absent or in the future.

Expose targeted notification sending in the admin UI. The send form should allow send-to-all or selected users. Selected-user sending should use user search and submit `userIds` to the existing admin endpoint.

Validate target users before targeted sends. The service should dedupe submitted IDs, query existing users, skip invalid/missing IDs, send to valid users, and return recipient counts:

- `sentCount`
- `skippedCount`
- `invalidRecipientCount`
- `invalidRecipientIds`

Add recipient history backed by durable data. The preferred model is a notification batch/campaign identifier stored in notification metadata plus audit entries for sends. Admin history should be able to show what was sent, who initiated it, scope, recipient counts, and timestamp.

Send-to-all will be batched in the service to avoid loading and inserting all users in one unbounded operation. A full background job/outbox is out of scope for Phase 6.

### Logging

Centralize redaction for logs. Redaction must cover:

- Sensitive keys such as password, token, secret, authorization, cookie, apiKey, accessToken, refreshToken.
- Bearer tokens and token-like patterns in strings.
- Sensitive URL query parameters in `message`, `url`, and nested `context`.

Client log ingestion persists sanitized, bounded structured logs locally; no external error-reporting provider is configured.

Admin log tailing should read bounded bytes from the end of the selected log file and then parse up to the requested number of JSONL entries. This prevents large log files from being fully loaded into memory.

Sync file writes can remain for this phase unless changing them is low-risk, because redaction and bounded reads are the higher-priority reliability fixes. If async writes are introduced, they must preserve process-exit safety and not drop high-severity logs silently.

## Contracts And API

Update wire contracts and OpenAPI for changed notification send responses and any new audit/recipient-history endpoints.

Expected API changes:

- `/me/notifications?limit=` honors `limit`.
- `/admin/notifications/send-users` returns recipient counts instead of only `{ count }`.
- `/admin/notifications/send-all` returns the same count field names as targeted sends: `sentCount`, `skippedCount`, `invalidRecipientCount`, and `invalidRecipientIds`.
- Add admin notification recipient/history endpoint if the existing list endpoint cannot represent send history cleanly.
- Add admin audit list endpoint only if required for Phase 6 UI. Otherwise DB audit entries can be implemented and tested without adding UI in this phase.

Response/error envelope behavior must remain consistent with existing API helpers.

## UI

Web and admin authenticated layouts render active banner notifications. The banner should be dismissible by marking the notification read or deleting/dismissing it using existing notification APIs. It should not block layout rendering if notification fetch fails.

Admin notification UI gains targeted send support with user search, selected recipients, send summary, and recipient count feedback. The existing send-to-all flow remains available.

Admin notification history should show recent sends with title, message preview, scope, actor ID or `system`, counts, and timestamp. It exposes send counts and read counts computed from notification rows; native delivery receipts remain out of scope.

## Data Flow

1. Admin submits a notification send request.
2. Route validates payload and captures actor/request context.
3. Notification service validates recipients and creates notification rows in batches.
4. Audit service writes a DB audit entry with action, outcome, actor, target/scope, counts, and safe metadata.
5. Admin UI receives sent/skipped/invalid counts and shows feedback.
6. User/admin layouts fetch notifications and render active banners.

For audited domain mutations, route handlers capture request context, execute the mutation, then write success/failure audit entries. Before/after summaries are required for role, ban, discount, voucher, and notification mutations. Webhook failure audit entries store safe provider event identifiers and error summaries instead of before/after state.

For client logs, route handlers parse payloads, sanitize message/url/context, and write sanitized structured logs locally.

## Error Handling

- Notification target validation should not fail the whole request because one recipient is invalid. Invalid recipients are skipped and reported.
- DB insert failures for notifications or audits should return clear API errors for admin-initiated sends.
- Audit write failure should not mask a successfully completed user-facing mutation unless the mutation itself depends on audit for compliance. For Phase 6, log audit write failures and return the mutation result.
- Banner fetch failures should not break layout rendering.
- Log redaction should be defensive and tolerate circular, deep, or unusual context values.

## Testing

Add API/service tests for:

- `/me/notifications?limit=` forwards and honors limit.
- Active banner selection/rendering behavior at service/client boundary.
- Targeted notification sends dedupe, validate users, skip invalid IDs, and return sent/skipped/invalid counts.
- Send-to-all batching.
- Notification send audit entries.
- DB audit entry creation and redaction.
- Audit entries for admin role/ban/unban/impersonation/password mutations.
- Audit entries for discount/voucher mutations.
- Webhook failure audit with no raw payload leakage.
- Client log redaction for message, URL, and nested context.
- Client log ingestion persists sanitized, bounded structured logs locally.
- Admin log reading tails bounded bytes rather than full files.

Run `bun run --cwd apps/api test` and `bun run typecheck:all` before completion.

## Out Of Scope

- A full distributed background job system.
- Native push notification delivery tracking.
- Full per-recipient delivery receipts beyond existing notification read state.
- Billing adjustment/refund audit for mutation paths that do not exist yet.
- Replacing all file logging with a collector-backed logging stack.
