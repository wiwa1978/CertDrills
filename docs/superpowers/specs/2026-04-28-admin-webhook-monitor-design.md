# Admin Webhook Monitor Design

## Goal

Add a read-only webhook monitor to the Hono admin portal, matching the non-Hono reference webhook table as closely as the Hono API-first architecture allows.

## Scope

- Add an `/admin/webhooks` page to the Hono admin app.
- Add admin API endpoints backed by `payment_webhook_events`.
- Support listing, filtering, pagination, status metrics, and detail/error inspection.
- Use `admin` terminology in Hono, even when adapting reference code from `superadmin` paths.

## Non-Goals

- Do not add webhook retry or reprocessing actions in this slice.
- Do not change webhook ingestion behavior.
- Do not rename Hono roles or routes to `superadmin`.

## Architecture

The admin app remains API-first. The UI calls admin app service wrappers, which call Hono admin API routes. The Hono API queries `payment_webhook_events` through existing platform DB exports and returns shaped DTOs for the table and detail views.

## API Design

- `GET /admin/webhooks`: returns paginated webhook events with optional filters for status, provider, event type, payment id, and search text where supported by the stored columns.
- `GET /admin/webhooks/stats`: returns aggregate counts by processing status and recent failure information needed by summary cards.
- `GET /admin/webhooks/:eventId`: returns the full event record for detail/error inspection.

All routes use existing admin authorization. Responses follow the existing `{ success: true, data }` admin route convention.

## UI Design

Port the reference webhook table layout and behavior as closely as possible:

- Summary cards for webhook health and status counts.
- Filterable table with provider, event type, payment id, status, timestamps, and processing result.
- Status badges that reflect `processing`, `processed`, and `failed` states.
- Detail view or drawer/dialog for error details and event metadata.
- Navigation entry under the Hono admin backend menu.

The implementation should preserve Hono admin visual patterns and existing component imports when the reference repo uses project-specific equivalents.

## Data Flow

1. Admin opens `/admin/webhooks`.
2. Page loads the monitor component.
3. Component fetches stats and a paginated list through admin services.
4. Filters update query parameters or component state and refetch the list.
5. Opening a row detail fetches the full event if the list response does not already contain enough detail.

## Error Handling

- Invalid API query parameters return validation errors consistent with existing admin routes.
- UI fetch failures show the same error/empty-state pattern used by other Hono admin tables.
- Missing event detail returns a not-found style API response and a user-visible failure state.

## Testing

- Add targeted API tests for webhook list, filters, pagination, stats, and detail where the existing test harness can mock DB/admin dependencies cleanly.
- Run existing API authorization tests to ensure admin auth boundaries remain intact.
- Run API TypeScript checks.
- Run admin TypeScript checks and report the known existing `.next/types` issue separately if it remains.
