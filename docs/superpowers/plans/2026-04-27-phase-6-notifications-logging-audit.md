# Phase 6 Notifications, Logging, And Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make notifications, logging, and audit reliable by honoring notification limits, adding targeted notification reliability and history, sanitizing client logs, bounding log reads, and recording durable DB audit entries for important mutations.

**Architecture:** Add a DB-backed audit subsystem in `apps/api/src/modules/audit` with an `audit_entries` table in `packages/platform-db`. Keep notification title/message as canonical literal text, add batch metadata for send history, and route admin mutations through audit recording. Keep local JSONL logging, but sanitize inputs consistently and tail bounded bytes instead of reading whole files.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest, Next.js apps for web/admin, shared contracts in `packages/contracts`.

---

## Scope Notes

This phase intentionally touches three subsystems because the approved Phase 6 design groups notifications, logging, and audit into one larger branch staged internally. Do not add organizations, tenants, teams, memberships, organization IDs, or multi-tenancy abstractions in this phase.

Notification `title` and `message` are required canonical literal text. Optional translations may stay in `data.translations`, but contracts and APIs must treat `title` and `message` as the canonical fields.

## File Structure

Create these files:

- `packages/platform-db/src/schema/audit.ts`: Drizzle schema for durable `audit_entries` records.
- `packages/platform-db/drizzle/0005_add_audit_entries.sql`: SQL migration for `audit_entries`.
- `apps/api/src/modules/audit/service.ts`: Audit service with redaction, insertion, list helpers, request context extraction helpers, and safe failure handling.
- `apps/api/tests/modules/audit/service.test.ts`: Unit tests for audit insertion, redaction, list filtering, and failure-safe recording.
- `apps/api/tests/observability/logger.test.ts`: Unit tests for bounded JSONL tailing.
- `apps/web/src/components/layout/backend/shared/backend-banner-notification.tsx`: Web banner component.
- `apps/admin/src/components/layout/backend/shared/backend-banner-notification.tsx`: Admin banner component.

Modify these files:

- `packages/platform-db/src/schema/index.ts`: Export `audit` schema.
- `apps/api/src/bootstrap.ts`: Construct and export `auditService`; pass it where needed.
- `apps/api/src/routes/me.ts`: Honor `/me/notifications?limit=`.
- `apps/api/src/routes/admin.ts`: Return notification send counts, add notification send history, add user search for notification targeting, record audit entries around admin mutations, discounts, vouchers, and notification sends.
- `apps/api/src/routes/auth.ts`: Record stop-impersonating audit entries.
- `apps/api/src/routes/logs.ts`: Ensure client log message, URL, user agent, and context are sanitized and bounded.
- `apps/api/src/observability/redaction.ts`: Add bounded context helper if needed for local structured logs.
- `apps/api/src/observability/logger.ts`: Tail bounded bytes from log files before parsing JSONL.
- `apps/api/src/modules/notifications/service.ts`: Return send result objects, validate recipient existence, batch send-all, attach send batch metadata, expose send history from audit or notification metadata.
- `apps/api/src/modules/payments/webhook-event-store.ts`: Record webhook failure audit entries for handler failures when audit dependency is available.
- `packages/payments-core/src/create-payments-module.ts`: Add optional webhook failure callback for signature/parse/handler failure audit metadata.
- `packages/contracts/src/wire/notifications/common.ts`: Add notification send result and send history schemas/types.
- `packages/contracts/src/wire/admin/requests.ts`: Add admin notification user search schema if no suitable shared schema exists.
- `apps/api/src/openapi.ts`: Document changed notification responses and new history/search endpoints.
- `apps/api/tests/app.functional.test.ts`: Route tests for notification limits, new response shapes, admin audit calls, and logging behavior.
- `apps/api/tests/modules/notifications/service.test.ts`: Service tests for recipient validation, send-all batching, and send metadata.
- `apps/api/tests/payments-core/webhook-verify.test.ts`: Webhook failure audit callback tests.
- `apps/api/tests/modules/payments/webhook-event-store.test.ts`: Optional store audit dependency tests if audit is wired at store level.
- `apps/admin/src/lib/api/admin.ts`: Update notification send response types, add notification user search and send history API wrappers.
- `apps/admin/src/lib/services/notifications.ts`: Return send count summaries, add selected-user send and send history services.
- `apps/admin/src/components/layout/backend/admin/notifications/send-notification-form.tsx`: Add all-users/selected-users mode and count feedback.
- `apps/admin/src/components/layout/backend/admin/notifications/notification-history-table.tsx`: Show send scope, actor, sent/skipped/invalid counts, and timestamp.
- `apps/web/src/app/[locale]/(backend)/layout.tsx`: Render web banner component without blocking layout when fetch fails.
- `apps/admin/src/app/[locale]/(backend)/layout.tsx`: Render admin banner component without blocking layout when fetch fails.

## Task 1: Add Durable Audit Schema And Service

**Files:**
- Create: `packages/platform-db/src/schema/audit.ts`
- Create: `packages/platform-db/drizzle/0005_add_audit_entries.sql`
- Create: `apps/api/src/modules/audit/service.ts`
- Create: `apps/api/tests/modules/audit/service.test.ts`
- Modify: `packages/platform-db/src/schema/index.ts`

- [ ] **Step 1: Write failing audit service tests**

Create `apps/api/tests/modules/audit/service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { auditEntries } from "@platform/platform-db";

import { createAuditService } from "../../../src/modules/audit/service";

describe("createAuditService", () => {
  it("records sanitized audit entries", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "audit-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const db = { insert: vi.fn().mockReturnValue({ values }) };
    const service = createAuditService({ db } as any);

    const result = await service.recordAuditEntry({
      action: "admin.user.set_role",
      outcome: "success",
      actorId: "actor-1",
      targetType: "user",
      targetId: "user-1",
      requestId: "req-1",
      ip: "127.0.0.1",
      userAgent: "Vitest",
      before: { role: "user", password: "secret" },
      after: { role: "admin", token: "abc" },
      metadata: { authorization: "Bearer abc.def.ghi", note: "ok" },
    });

    expect(result).toEqual({ success: true, entry: { id: "audit-1" } });
    expect(db.insert).toHaveBeenCalledWith(auditEntries);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.set_role",
      outcome: "success",
      actorId: "actor-1",
      targetType: "user",
      targetId: "user-1",
      requestId: "req-1",
      before: { role: "user", password: "[redacted]" },
      after: { role: "admin", token: "[redacted]" },
      metadata: { authorization: "[redacted]", note: "ok" },
    }));
  });

  it("does not throw when best-effort audit recording fails", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("db down")),
        }),
      }),
    };
    const logger = { warn: vi.fn() };
    const service = createAuditService({ db, logger } as any);

    await expect(service.recordAuditEntry({
      action: "notification.send_all",
      outcome: "success",
      metadata: { sentCount: 1 },
    })).resolves.toEqual({ success: false, error: "Failed to record audit entry" });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("lists audit entries by action prefix", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "audit-1", action: "notification.send_all" }]);
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const db = { select: vi.fn().mockReturnValue({ from }) };
    const service = createAuditService({ db } as any);

    await expect(service.listAuditEntries({ actionPrefix: "notification.", limit: 500 })).resolves.toEqual([
      { id: "audit-1", action: "notification.send_all" },
    ]);
    expect(limit).toHaveBeenCalledWith(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/api test apps/api/tests/modules/audit/service.test.ts`

Expected: FAIL because `../../../src/modules/audit/service` and `auditEntries` do not exist.

- [ ] **Step 3: Add DB schema and migration**

Create `packages/platform-db/src/schema/audit.ts`:

```ts
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id } from "./helpers";

export const auditEntries = pgTable(
  "audit_entries",
  {
    id,
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    actorId: uuid("actor_id").references(() => user.id, { onDelete: "set null" }),
    targetType: text("target_type"),
    targetId: text("target_id"),
    requestId: text("request_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    createdAt,
  },
  (table) => [
    index("audit_entries_action_idx").on(table.action),
    index("audit_entries_actor_idx").on(table.actorId),
    index("audit_entries_target_idx").on(table.targetType, table.targetId),
    index("audit_entries_created_at_idx").on(table.createdAt),
  ],
);
```

Modify `packages/platform-db/src/schema/index.ts`:

```ts
export * from "./helpers";
export * from "./auth";
export * from "./notifications";
export * from "./billing";
export * from "./audit";
```

Create `packages/platform-db/drizzle/0005_add_audit_entries.sql`:

```sql
CREATE TABLE IF NOT EXISTS "audit_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "outcome" text NOT NULL,
  "actor_id" uuid,
  "target_type" text,
  "target_id" text,
  "request_id" text,
  "ip" text,
  "user_agent" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_id_user_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "audit_entries_action_idx" ON "audit_entries" ("action");
CREATE INDEX IF NOT EXISTS "audit_entries_actor_idx" ON "audit_entries" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_entries_target_idx" ON "audit_entries" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_entries_created_at_idx" ON "audit_entries" ("created_at");
```

- [ ] **Step 4: Implement the audit service**

Create `apps/api/src/modules/audit/service.ts`:

```ts
import { desc, ilike } from "drizzle-orm";
import type { Context } from "hono";

import { auditEntries } from "@platform/platform-db";

import type { AppEnv } from "../../context";
import { logger as defaultLogger } from "../../observability/logger";
import { redactLogValue } from "../../observability/redaction";

type AuditOutcome = "success" | "failure";

type AuditInput = {
  action: string;
  outcome: AuditOutcome;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

type ListAuditEntriesInput = {
  actionPrefix?: string;
  limit?: number;
};

type AuditServiceDeps = {
  db: any;
  logger?: Pick<typeof defaultLogger, "warn">;
};

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit ?? 50), 1), 100);
}

function sanitizeJson(value: unknown) {
  if (value === undefined) return null;
  return redactLogValue(value);
}

export function getAuditRequestContext(c: Context<AppEnv>) {
  const forwardedFor = c.req.header("x-forwarded-for");
  return {
    actorId: c.get("authUser")?.id ?? null,
    requestId: c.get("requestId") ?? null,
    ip: forwardedFor?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null,
    userAgent: c.req.header("user-agent") ?? null,
  };
}

export function createAuditService(deps: AuditServiceDeps) {
  const auditLogger = deps.logger ?? defaultLogger;

  async function recordAuditEntry(input: AuditInput) {
    try {
      const [entry] = await deps.db
        .insert(auditEntries)
        .values({
          action: input.action,
          outcome: input.outcome,
          actorId: input.actorId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          requestId: input.requestId ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          before: sanitizeJson(input.before),
          after: sanitizeJson(input.after),
          metadata: sanitizeJson(input.metadata),
        })
        .returning();

      return { success: true as const, entry };
    } catch (error) {
      auditLogger.warn({ error, action: input.action }, "Failed to record audit entry");
      return { success: false as const, error: "Failed to record audit entry" };
    }
  }

  async function listAuditEntries(input: ListAuditEntriesInput = {}) {
    const limit = normalizeLimit(input.limit);
    const query = deps.db.select().from(auditEntries);
    const filtered = input.actionPrefix
      ? query.where(ilike(auditEntries.action, `${input.actionPrefix}%`))
      : query;

    return filtered.orderBy(desc(auditEntries.createdAt)).limit(limit);
  }

  return {
    recordAuditEntry,
    listAuditEntries,
  };
}
```

- [ ] **Step 5: Run audit service tests**

Run: `bun run --cwd apps/api test apps/api/tests/modules/audit/service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/platform-db/src/schema/audit.ts packages/platform-db/src/schema/index.ts packages/platform-db/drizzle/0005_add_audit_entries.sql apps/api/src/modules/audit/service.ts apps/api/tests/modules/audit/service.test.ts
git commit -m "feat: add durable audit entries"
```

## Task 2: Wire Audit Service Into Bootstrap

**Files:**
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Write failing bootstrap route test setup**

Modify the hoisted mocks in `apps/api/tests/app.functional.test.ts` to include an audit service:

```ts
const auditService = {
  recordAuditEntry: vi.fn(),
  listAuditEntries: vi.fn(),
};
```

Return it from the hoisted object:

```ts
return {
  billingService,
  adminService,
  notificationsService,
  discountsService,
  vouchersService,
  auditService,
  adminAuthApi,
  db,
  env: {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/test",
    APP_URL: "http://localhost:3100",
    API_URL: "http://localhost:8787",
    DODO_PAYMENTS_ENVIRONMENT: "test_mode" as const,
    BETTER_AUTH_SECRET: "this-is-a-long-enough-secret",
    JWT_SECRET: "this-is-a-long-enough-jwt-secret",
    JWT_ISSUER: "api",
    JWT_AUDIENCE: "mobile-clients",
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2592000,
  },
};
```

Add this mock:

```ts
vi.mock("../src/modules/audit/service", () => ({
  createAuditService: () => mocks.auditService,
  getAuditRequestContext: () => ({
    actorId: "auth-user",
    requestId: "req-test",
    ip: "127.0.0.1",
    userAgent: "vitest",
  }),
}));
```

In `beforeEach`, reset the default audit behavior:

```ts
mocks.auditService.recordAuditEntry.mockResolvedValue({ success: true, entry: { id: "audit-1" } });
mocks.auditService.listAuditEntries.mockResolvedValue([]);
```

- [ ] **Step 2: Run route tests to verify bootstrap import fails**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: FAIL because `bootstrap.auditService` is not exported yet or because the audit service mock is unused by bootstrap.

- [ ] **Step 3: Wire bootstrap**

Modify `apps/api/src/bootstrap.ts` imports:

```ts
import { createAuditService } from "./modules/audit/service";
```

Construct the service after `db` is created:

```ts
const auditService = createAuditService({ db });
```

Export it in `bootstrap`:

```ts
export const bootstrap = {
  db,
  authModule,
  adminService,
  auditService,
  billingService,
  discountsService,
  notificationsService,
  vouchersService,
  paymentsModule,
};
```

- [ ] **Step 4: Run route tests**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bootstrap.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: wire audit service"
```

## Task 3: Honor Notification Limit And Standardize Send Result Contracts

**Files:**
- Modify: `packages/contracts/src/wire/notifications/common.ts`
- Modify: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/tests/app.functional.test.ts`
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/notifications.ts`
- Modify: `apps/api/src/openapi.ts`

- [ ] **Step 1: Write failing route tests for limit and send response shape**

Modify the notification route test in `apps/api/tests/app.functional.test.ts` so it expects the new response shape:

```ts
it("routes notifications endpoints", async () => {
  mocks.notificationsService.getAllNotifications.mockResolvedValueOnce([{ id: "n1" }]);
  mocks.notificationsService.sendNotificationToAllUsers.mockResolvedValueOnce({
    sentCount: 5,
    skippedCount: 0,
    invalidRecipientCount: 0,
    invalidRecipientIds: [],
    batchId: "11111111-1111-4111-8111-111111111111",
  });
  mocks.notificationsService.sendNotificationToUsers.mockResolvedValueOnce({
    sentCount: 2,
    skippedCount: 1,
    invalidRecipientCount: 1,
    invalidRecipientIds: ["77777777-7777-4777-8777-777777777777"],
    batchId: "22222222-2222-4222-8222-222222222222",
  });

  const listRes = await app.request("/admin/notifications?limit=10");
  const sendAllRes = await app.request("/admin/notifications/send-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "T", message: "M" }),
  });
  const sendUsersRes = await app.request("/admin/notifications/send-users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userIds: ["66666666-6666-4666-8666-666666666666"],
      title: "T",
      message: "M",
    }),
  });

  expect(listRes.status).toBe(200);
  expect(sendAllRes.status).toBe(200);
  expect(sendUsersRes.status).toBe(200);
  await expect(listRes.json()).resolves.toEqual({ success: true, data: [{ id: "n1" }] });
  await expect(sendAllRes.json()).resolves.toEqual({
    success: true,
    data: { sentCount: 5, skippedCount: 0, invalidRecipientCount: 0, invalidRecipientIds: [], batchId: "11111111-1111-4111-8111-111111111111" },
  });
  await expect(sendUsersRes.json()).resolves.toEqual({
    success: true,
    data: {
      sentCount: 2,
      skippedCount: 1,
      invalidRecipientCount: 1,
      invalidRecipientIds: ["77777777-7777-4777-8777-777777777777"],
      batchId: "22222222-2222-4222-8222-222222222222",
    },
  });
});
```

Add a dedicated `/me` notification limit test:

```ts
it("honors current user notification limit query", async () => {
  mocks.notificationsService.listForUser.mockResolvedValueOnce([{ id: "n-limited" }]);

  const res = await app.request("/me/notifications?limit=7");

  expect(res.status).toBe(200);
  expect(mocks.notificationsService.listForUser).toHaveBeenCalledWith("auth-user", 7);
  await expect(res.json()).resolves.toEqual({ success: true, data: [{ id: "n-limited" }] });
});
```

- [ ] **Step 2: Run route test to verify it fails**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: FAIL because `/me/notifications` still passes `20` and admin send routes still wrap `{ count }`.

- [ ] **Step 3: Add send result contract**

Modify `packages/contracts/src/wire/notifications/common.ts`:

```ts
export const notificationSendResultSchema = z.object({
  sentCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  invalidRecipientCount: z.number().int().min(0),
  invalidRecipientIds: z.array(z.string().uuid()),
  batchId: z.string().uuid().optional(),
});

export type NotificationSendResult = z.infer<typeof notificationSendResultSchema>;
```

- [ ] **Step 4: Honor `/me/notifications?limit=`**

Modify `apps/api/src/routes/me.ts` notification list route:

```ts
router.get("/notifications", async (c) => {
  const authUser = getAuthUser(c);
  const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid notifications query");
  }

  const list = await bootstrap.notificationsService.listForUser(authUser.id, parsedQuery.data.limit);
  return c.json({ success: true, data: list });
});
```

- [ ] **Step 5: Return send results directly from admin routes**

Modify `apps/api/src/routes/admin.ts` notification send routes:

```ts
const result = await bootstrap.notificationsService.sendNotificationToAllUsers({
  ...parsedBody.data,
});

return c.json({ success: true, data: result });
```

```ts
const result = await bootstrap.notificationsService.sendNotificationToUsers({
  ...parsedBody.data,
});

return c.json({ success: true, data: result });
```

- [ ] **Step 6: Update admin API/service wrappers**

In `apps/admin/src/lib/api/admin.ts`, change both notification send API response types to:

```ts
type NotificationSendResult = {
  sentCount: number;
  skippedCount: number;
  invalidRecipientCount: number;
  invalidRecipientIds: string[];
  batchId?: string;
};
```

In `apps/admin/src/lib/services/notifications.ts`, return the new result:

```ts
return { success: true, ...result.data };
```

- [ ] **Step 7: Update OpenAPI route descriptions**

Modify the two notification send routes in `apps/api/src/openapi.ts` so their summaries mention recipient counts. Keep `defaultResponses` if this OpenAPI helper cannot express the contract precisely yet:

```ts
route("post", "/admin/notifications/send-all", ["Admin Notifications"], "Send notification to all users and return recipient counts", { security: cookieOrBearerAuth, requestBody: requestBody(sendNotificationBaseSchema), responses: defaultResponses("Notification recipient counts", ["400", "401", "403"]) }),
route("post", "/admin/notifications/send-users", ["Admin Notifications"], "Send notification to selected users and return recipient counts", { security: cookieOrBearerAuth, requestBody: requestBody(sendNotificationToUsersSchema), responses: defaultResponses("Notification recipient counts", ["400", "401", "403"]) }),
```

- [ ] **Step 8: Run tests and typecheck touched packages**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS.

Run: `bun run typecheck:all`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/wire/notifications/common.ts apps/api/src/routes/me.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/api/tests/app.functional.test.ts apps/admin/src/lib/api/admin.ts apps/admin/src/lib/services/notifications.ts
git commit -m "fix: standardize notification send results"
```

## Task 4: Validate Notification Recipients, Batch Send-All, And Attach Batch Metadata

**Files:**
- Modify: `apps/api/src/modules/notifications/service.ts`
- Modify: `apps/api/tests/modules/notifications/service.test.ts`

- [ ] **Step 1: Write failing notification service tests**

Append to `apps/api/tests/modules/notifications/service.test.ts`:

```ts
it("sendNotificationToUsers validates recipients and reports invalid IDs", async () => {
  const existingUserRows = [
    { id: "11111111-1111-4111-8111-111111111111" },
    { id: "22222222-2222-4222-8222-222222222222" },
  ];
  const values = vi.fn().mockResolvedValue(undefined);
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(existingUserRows),
      }),
    }),
    insert: vi.fn().mockReturnValue({ values }),
  };
  const service = createNotificationsService({ db } as any);

  const result = await service.sendNotificationToUsers({
    userIds: [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ],
    title: "A",
    message: "B",
  });

  expect(result.sentCount).toBe(2);
  expect(result.skippedCount).toBe(1);
  expect(result.invalidRecipientCount).toBe(1);
  expect(result.invalidRecipientIds).toEqual(["33333333-3333-4333-8333-333333333333"]);
  expect(result.batchId).toEqual(expect.any(String));
  expect(values).toHaveBeenCalledWith([
    expect.objectContaining({ userId: "11111111-1111-4111-8111-111111111111" }),
    expect.objectContaining({ userId: "22222222-2222-4222-8222-222222222222" }),
  ]);
});

it("sendNotificationToAllUsers inserts notifications in batches", async () => {
  const allUsers = Array.from({ length: 1001 }, (_, index) => ({ id: `user-${index}` }));
  const values = vi.fn().mockResolvedValue(undefined);
  const db = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockResolvedValue(allUsers) }),
    insert: vi.fn().mockReturnValue({ values }),
  };
  const service = createNotificationsService({ db } as any);

  const result = await service.sendNotificationToAllUsers({ title: "A", message: "B" });

  expect(result).toEqual(expect.objectContaining({
    sentCount: 1001,
    skippedCount: 0,
    invalidRecipientCount: 0,
    invalidRecipientIds: [],
  }));
  expect(values).toHaveBeenCalledTimes(3);
  expect(values.mock.calls[0]?.[0]).toHaveLength(500);
  expect(values.mock.calls[1]?.[0]).toHaveLength(500);
  expect(values.mock.calls[2]?.[0]).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/api test apps/api/tests/modules/notifications/service.test.ts`

Expected: FAIL because service returns numbers, does not query existing users for targeted sends, and does not batch send-all.

- [ ] **Step 3: Implement notification send result helpers**

Modify `apps/api/src/modules/notifications/service.ts` imports:

```ts
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
```

Add constants/helpers near `dedupeUserIds`:

```ts
const SEND_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function withBatchData(data: Record<string, unknown> | undefined, batchId: string) {
  return {
    ...(data ?? {}),
    notificationBatchId: batchId,
  };
}
```

- [ ] **Step 4: Implement batched send-all**

Replace `sendNotificationToAllUsers` body:

```ts
const users = await deps.db.select({ id: user.id }).from(user);
const batchId = randomUUID();
const payload = users.map((u: { id: string }) => ({
  userId: u.id,
  title: input.title,
  message: input.message,
  type: input.type ?? "info",
  category: input.category ?? "system",
  data: withBatchData(input.data, batchId),
  showAsBanner: input.showAsBanner ?? false,
  bannerExpiresAt: input.bannerExpiresAt ?? null,
}));

for (const batch of chunk(payload, SEND_BATCH_SIZE)) {
  if (batch.length > 0) {
    await deps.db.insert(notification).values(batch);
  }
}

return {
  sentCount: payload.length,
  skippedCount: 0,
  invalidRecipientCount: 0,
  invalidRecipientIds: [],
  batchId,
};
```

- [ ] **Step 5: Implement targeted validation and reporting**

Replace `sendNotificationToUsers` body:

```ts
const requestedUserIds = dedupeUserIds(input.userIds);
const batchId = randomUUID();

if (requestedUserIds.length === 0) {
  return {
    sentCount: 0,
    skippedCount: 0,
    invalidRecipientCount: 0,
    invalidRecipientIds: [],
    batchId,
  };
}

const existingUsers = await deps.db
  .select({ id: user.id })
  .from(user)
  .where(inArray(user.id, requestedUserIds));

const existingUserIds = new Set(existingUsers.map((row: { id: string }) => row.id));
const invalidRecipientIds = requestedUserIds.filter((userId) => !existingUserIds.has(userId));
const validUserIds = requestedUserIds.filter((userId) => existingUserIds.has(userId));
const payload = validUserIds.map((userId) => ({
  userId,
  title: input.title,
  message: input.message,
  type: input.type ?? "info",
  category: input.category ?? "system",
  data: withBatchData(input.data, batchId),
  showAsBanner: input.showAsBanner ?? false,
  bannerExpiresAt: input.bannerExpiresAt ?? null,
}));

for (const batch of chunk(payload, SEND_BATCH_SIZE)) {
  if (batch.length > 0) {
    await deps.db.insert(notification).values(batch);
  }
}

return {
  sentCount: payload.length,
  skippedCount: invalidRecipientIds.length,
  invalidRecipientCount: invalidRecipientIds.length,
  invalidRecipientIds,
  batchId,
};
```

- [ ] **Step 6: Update existing service tests expecting numeric counts**

Change assertions such as `expect(count).toBe(3)` to:

```ts
expect(result).toEqual(expect.objectContaining({
  sentCount: 3,
  skippedCount: 0,
  invalidRecipientCount: 0,
  invalidRecipientIds: [],
}));
```

For empty targeted send, assert:

```ts
expect(result).toEqual(expect.objectContaining({
  sentCount: 0,
  skippedCount: 0,
  invalidRecipientCount: 0,
  invalidRecipientIds: [],
}));
```

- [ ] **Step 7: Run notification service tests**

Run: `bun run --cwd apps/api test apps/api/tests/modules/notifications/service.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/notifications/service.ts apps/api/tests/modules/notifications/service.test.ts
git commit -m "fix: validate notification recipients"
```

## Task 5: Add Notification Send Audit And Admin Send History

**Files:**
- Modify: `packages/contracts/src/wire/notifications/common.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/tests/app.functional.test.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/notifications.ts`
- Modify: `apps/admin/src/components/layout/backend/admin/notifications/notification-history-table.tsx`

- [ ] **Step 1: Write failing route tests for send audit and history**

Add to `apps/api/tests/app.functional.test.ts`:

```ts
it("records audit entries for notification sends", async () => {
  mocks.notificationsService.sendNotificationToAllUsers.mockResolvedValueOnce({
    sentCount: 3,
    skippedCount: 0,
    invalidRecipientCount: 0,
    invalidRecipientIds: [],
    batchId: "11111111-1111-4111-8111-111111111111",
  });

  const res = await app.request("/admin/notifications/send-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Ops", message: "Maintenance" }),
  });

  expect(res.status).toBe(200);
  expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
    action: "notification.send_all",
    outcome: "success",
    actorId: "auth-user",
    targetType: "notification_batch",
    targetId: "11111111-1111-4111-8111-111111111111",
    after: expect.objectContaining({ title: "Ops", message: "Maintenance" }),
    metadata: expect.objectContaining({ sentCount: 3 }),
  }));
});

it("routes notification send history", async () => {
  mocks.auditService.listAuditEntries.mockResolvedValueOnce([
    {
      id: "audit-1",
      action: "notification.send_users",
      actorId: "auth-user",
    targetId: "11111111-1111-4111-8111-111111111111",
      after: { title: "Hello", message: "World", scope: "selected" },
      metadata: { sentCount: 2, skippedCount: 1, invalidRecipientCount: 1, invalidRecipientIds: ["missing-user"] },
      createdAt: new Date("2026-04-27T10:00:00Z"),
    },
  ]);

  const res = await app.request("/admin/notifications/sends?limit=25");

  expect(res.status).toBe(200);
  expect(mocks.auditService.listAuditEntries).toHaveBeenCalledWith({ actionPrefix: "notification.", limit: 25 });
  await expect(res.json()).resolves.toEqual({
    success: true,
    data: [expect.objectContaining({ id: "audit-1", title: "Hello", scope: "selected", sentCount: 2 })],
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: FAIL because routes do not audit sends and `/admin/notifications/sends` does not exist.

- [ ] **Step 3: Add send history schema**

Modify `packages/contracts/src/wire/notifications/common.ts`:

```ts
export const notificationSendHistoryItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  batchId: z.string().nullable(),
  actorId: z.string().nullable(),
  scope: z.enum(["all", "selected"]),
  title: z.string(),
  message: z.string(),
  sentCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  invalidRecipientCount: z.number().int().min(0),
  invalidRecipientIds: z.array(z.string()),
  createdAt: z.union([z.string(), z.date()]),
});

export type NotificationSendHistoryItem = z.infer<typeof notificationSendHistoryItemSchema>;
```

- [ ] **Step 4: Add audit calls in notification routes**

Import in `apps/api/src/routes/admin.ts`:

```ts
import { getAuditRequestContext } from "../modules/audit/service";
```

In `POST /admin/notifications/send-all`, after the service call:

```ts
await bootstrap.auditService.recordAuditEntry({
  ...getAuditRequestContext(c),
  action: "notification.send_all",
  outcome: "success",
  targetType: "notification_batch",
  targetId: result.batchId ?? null,
  after: {
    scope: "all",
    title: parsedBody.data.title,
    message: parsedBody.data.message,
    type: parsedBody.data.type ?? "info",
    category: parsedBody.data.category ?? "system",
    showAsBanner: parsedBody.data.showAsBanner ?? false,
  },
  metadata: result,
});
```

In `POST /admin/notifications/send-users`, use `notification.send_users`, `scope: "selected"`, and include `requestedRecipientCount: parsedBody.data.userIds.length` in metadata.

- [ ] **Step 5: Add send history route**

Add before the send routes in `apps/api/src/routes/admin.ts`:

```ts
router.get("/notifications/sends", async (c) => {
  const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid notification send history query");
  }

  const entries = await bootstrap.auditService.listAuditEntries({
    actionPrefix: "notification.",
    limit: parsedQuery.data.limit,
  });

  const data = entries.map((entry: any) => ({
    id: entry.id,
    action: entry.action,
    batchId: entry.targetId ?? null,
    actorId: entry.actorId ?? null,
    scope: entry.after?.scope === "selected" ? "selected" : "all",
    title: entry.after?.title ?? "",
    message: entry.after?.message ?? "",
    sentCount: Number(entry.metadata?.sentCount ?? 0),
    skippedCount: Number(entry.metadata?.skippedCount ?? 0),
    invalidRecipientCount: Number(entry.metadata?.invalidRecipientCount ?? 0),
    invalidRecipientIds: Array.isArray(entry.metadata?.invalidRecipientIds) ? entry.metadata.invalidRecipientIds : [],
    createdAt: entry.createdAt,
  }));

  return c.json({ success: true, data });
});
```

- [ ] **Step 6: Update OpenAPI**

Add route in `apps/api/src/openapi.ts`:

```ts
route("get", "/admin/notifications/sends", ["Admin Notifications"], "List notification send history", { security: cookieOrBearerAuth, parameters: [queryParameter("limit", notificationsListQuerySchema.shape.limit)], responses: defaultResponses("Notification send history", ["400", "401", "403"]) }),
```

- [ ] **Step 7: Update admin API/service wrappers and history table**

In `apps/admin/src/lib/api/admin.ts`, add:

```ts
export async function getNotificationSendHistoryApi(limit = 50) {
  const res = await adminFetch(`/admin/notifications/sends?limit=${limit}`);
  return unwrapApiResponse<NotificationSendHistoryItem[]>(res);
}
```

In `apps/admin/src/lib/services/notifications.ts`, add:

```ts
export async function getNotificationSendHistory(limit = 50) {
  try {
    const data = await getNotificationSendHistoryApi(limit);
    return { success: true, data };
  } catch {
    return { success: false, error: "Failed to fetch notification send history" };
  }
}
```

Modify `NotificationHistoryTable` columns to display `scope`, `actorId`, `sentCount`, `skippedCount`, `invalidRecipientCount`, and `createdAt` from send history records instead of treating rows only as per-recipient notification rows.

- [ ] **Step 8: Run route tests and admin typecheck**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS.

Run: `bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/wire/notifications/common.ts apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/api/tests/app.functional.test.ts apps/admin/src/lib/api/admin.ts apps/admin/src/lib/services/notifications.ts apps/admin/src/components/layout/backend/admin/notifications/notification-history-table.tsx
git commit -m "feat: add notification send history"
```

## Task 6: Add Admin Targeted Notification UI

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/api/tests/app.functional.test.ts`
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/notifications.ts`
- Modify: `apps/admin/src/components/layout/backend/admin/notifications/send-notification-form.tsx`

- [ ] **Step 1: Write failing user search route test**

Add to `apps/api/tests/app.functional.test.ts`:

```ts
it("routes notification user search", async () => {
  mocks.vouchersService.searchUsers.mockResolvedValueOnce([
    { id: "user-1", email: "a@example.com", name: "Ada" },
  ]);

  const res = await app.request("/admin/notifications/search-users?query=ada&limit=10");

  expect(res.status).toBe(200);
  expect(mocks.vouchersService.searchUsers).toHaveBeenCalledWith({ query: "ada", limit: 10 });
  await expect(res.json()).resolves.toEqual({
    success: true,
    data: [{ id: "user-1", email: "a@example.com", name: "Ada" }],
  });
});
```

- [ ] **Step 2: Run route test to verify failure**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: FAIL because `/admin/notifications/search-users` is missing.

- [ ] **Step 3: Add notification user search route**

Add to `apps/api/src/routes/admin.ts` near notification routes:

```ts
router.get("/notifications/search-users", async (c) => {
  const parsedQuery = parseQuery(searchUsersQuerySchema, {
    query: c.req.query("query"),
    limit: c.req.query("limit"),
  });

  if (!parsedQuery.success) {
    return validationError(c, "Invalid notification user search query");
  }

  const data = await bootstrap.vouchersService.searchUsers(parsedQuery.data);
  return c.json({ success: true, data });
});
```

Use the existing `searchUsersQuerySchema` already used by voucher search if present in the file. If the file names it differently, use the same imported schema as `/admin/vouchers/search-users`.

- [ ] **Step 4: Add OpenAPI route**

Add to `apps/api/src/openapi.ts`:

```ts
route("get", "/admin/notifications/search-users", ["Admin Notifications"], "Search users for notification recipients", { security: cookieOrBearerAuth, parameters: searchUsersParameters, responses: defaultResponses("Users", ["400", "401", "403"]) }),
```

- [ ] **Step 5: Update admin wrappers**

In `apps/admin/src/lib/api/admin.ts`, add:

```ts
export async function searchUsersForNotificationApi(query: string, limit = 20) {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const res = await adminFetch(`/admin/notifications/search-users?${params.toString()}`);
  return unwrapApiResponse<Array<{ id: string; email: string; name: string | null }>>(res);
}
```

In `apps/admin/src/lib/services/notifications.ts`, add:

```ts
export async function searchUsersForNotification(query: string, limit = 20) {
  return searchUsersForNotificationApi(query, limit);
}
```

- [ ] **Step 6: Update send form for all/selected mode**

Modify `apps/admin/src/components/layout/backend/admin/notifications/send-notification-form.tsx`:

```tsx
import { UserMultiSelect } from "@/components/layout/backend/admin/billing/user-multi-select";
import { searchUsersForNotification, sendNotificationToAllUsers, sendNotificationToUsers } from "@/lib/services/notifications";
```

Add state:

```tsx
const [recipientMode, setRecipientMode] = React.useState<"all" | "selected">("all");
const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
```

In `onSubmit`, replace the hard-coded `sendNotificationToAllUsers` call:

```tsx
const payload = {
  title: values.titleEn,
  message: values.messageEn,
  type: values.type,
  category: values.category,
  showAsBanner: values.showAsBanner,
  bannerExpiresAt: bannerExpiresDate,
  data: {
    translations: {
      en: { title: values.titleEn, message: values.messageEn },
      nl: { title: values.titleNl, message: values.messageNl },
      fr: { title: values.titleFr, message: values.messageFr },
    },
  },
};

const result = recipientMode === "selected"
  ? await sendNotificationToUsers({ ...payload, userIds: selectedUserIds })
  : await sendNotificationToAllUsers(payload);
```

Before submitting selected recipients, prevent empty selection:

```tsx
if (recipientMode === "selected" && selectedUserIds.length === 0) {
  toast.error("Select at least one recipient");
  setIsSubmitting(false);
  return;
}
```

Render the selector before the language tabs:

```tsx
<div className="space-y-3">
  <FormLabel>Recipients</FormLabel>
  <Select value={recipientMode} onValueChange={(value) => setRecipientMode(value as "all" | "selected")}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All users</SelectItem>
      <SelectItem value="selected">Selected users</SelectItem>
    </SelectContent>
  </Select>
  {recipientMode === "selected" ? (
    <UserMultiSelect
      selectedUserIds={selectedUserIds}
      onSelectionChange={setSelectedUserIds}
      searchUsers={searchUsersForNotification}
      disabled={isSubmitting}
      placeholder="Select notification recipients"
    />
  ) : null}
</div>
```

Update success toast to use `result.sentCount` and include skipped count when nonzero:

```tsx
toast.success(`Notification sent to ${result.sentCount ?? 0} users${result.skippedCount ? `; skipped ${result.skippedCount}` : ""}`);
```

- [ ] **Step 7: Run route tests and admin typecheck**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS.

Run: `bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/openapi.ts apps/api/tests/app.functional.test.ts apps/admin/src/lib/api/admin.ts apps/admin/src/lib/services/notifications.ts apps/admin/src/components/layout/backend/admin/notifications/send-notification-form.tsx
git commit -m "feat: add targeted notification UI"
```

## Task 7: Render Active Banner Notifications In Web And Admin Layouts

**Files:**
- Create: `apps/web/src/components/layout/backend/shared/backend-banner-notification.tsx`
- Create: `apps/admin/src/components/layout/backend/shared/backend-banner-notification.tsx`
- Modify: `apps/web/src/app/[locale]/(backend)/layout.tsx`
- Modify: `apps/admin/src/app/[locale]/(backend)/layout.tsx`

- [ ] **Step 1: Add web banner component**

Create `apps/web/src/components/layout/backend/shared/backend-banner-notification.tsx`:

```tsx
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getActiveBannerNotifications, markAsRead } from "@/lib/services/notifications";

export async function BackendBannerNotification() {
  const result = await getActiveBannerNotifications();
  const banner = result.success ? result.data : null;

  if (!banner) {
    return null;
  }

  async function dismiss() {
    "use server";
    await markAsRead(banner.id);
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
        <div>
          <p className="font-medium">{banner.title}</p>
          <p className="text-sm text-amber-900">{banner.message}</p>
        </div>
        <form action={dismiss}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Dismiss notification">
            <X className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
```

Create the same component at `apps/admin/src/components/layout/backend/shared/backend-banner-notification.tsx`, importing from the admin app aliases.

- [ ] **Step 2: Render banners in backend layouts**

Modify `apps/web/src/app/[locale]/(backend)/layout.tsx`:

```tsx
import { BackendBannerNotification } from "@/components/layout/backend/shared/backend-banner-notification";
```

Render above the backend page shell content:

```tsx
<BackendBannerNotification />
```

Modify `apps/admin/src/app/[locale]/(backend)/layout.tsx` the same way using the admin banner component.

- [ ] **Step 3: Run frontend typechecks**

Run: `bun run --cwd apps/web typecheck`

Expected: PASS.

Run: `bun run --cwd apps/admin typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/backend/shared/backend-banner-notification.tsx apps/admin/src/components/layout/backend/shared/backend-banner-notification.tsx apps/web/src/app/[locale]/\(backend\)/layout.tsx apps/admin/src/app/[locale]/\(backend\)/layout.tsx
git commit -m "feat: render banner notifications"
```

## Task 8: Harden Client Log Redaction And Bounded Log Tailing

**Files:**
- Modify: `apps/api/src/observability/redaction.ts`
- Modify: `apps/api/src/observability/logger.ts`
- Modify: `apps/api/src/routes/logs.ts`
- Create: `apps/api/tests/observability/logger.test.ts`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Write failing logger tail test**

Create `apps/api/tests/observability/logger.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tmpDirs: string[] = [];

afterEach(() => {
  vi.resetModules();
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("logger.readLogEntries", () => {
  it("reads bounded bytes from the end of the log file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "2026-04-27.jsonl");
    const lines = Array.from({ length: 1000 }, (_, index) => JSON.stringify({ message: `line-${index}` })).join("\n") + "\n";
    fs.writeFileSync(file, lines, "utf8");
    const readFileSpy = vi.spyOn(fs, "readFileSync");

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    const result = logger.readLogEntries({ stream: "app", file: "2026-04-27.jsonl", limit: 5 });

    expect(result.entries).toHaveLength(5);
    expect(result.entries[0]?.message).toBe("line-999");
    expect(readFileSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write failing local client log sanitization route test**

Add or update a client log test in `apps/api/tests/app.functional.test.ts`:

```ts
it("logs sanitized bounded client log context locally", async () => {
  const payload = {
    source: "web",
    level: "error",
    message: "failed with token=abc123 and bearer Bearer abc.def.ghi",
    url: "https://example.com/path?token=abc&safe=yes",
    userAgent: "Vitest",
    context: {
      password: "secret",
      nested: { authorization: "Bearer abc.def.ghi", safe: "ok" },
    },
    timestamp: new Date().toISOString(),
  };

  const res = await app.request("/logs/client", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  expect(res.status).toBe(200);
  expect(mocks.logger.error).toHaveBeenCalled();
  const [logRecord, message] = mocks.logger.error.mock.calls.at(-1) ?? [];
  expect(message).not.toContain("abc.def.ghi");
  expect(logRecord.url).not.toContain("token=abc");
  expect(logRecord.context).toMatchObject({
    password: "[redacted]",
    nested: expect.objectContaining({ authorization: "[redacted]", safe: "ok" }),
  });
});
```

Use the existing logger mock and assert the sanitized local structured log payload.

- [ ] **Step 3: Run tests to verify failure**

Run: `bun run --cwd apps/api test apps/api/tests/observability/logger.test.ts apps/api/tests/app.functional.test.ts`

Expected: FAIL because `logger.readLogEntries` uses `fs.readFileSync` and local client log context may not be bounded by a dedicated safe helper.

- [ ] **Step 4: Add bounded context helper**

Modify `apps/api/src/observability/redaction.ts`:

```ts
export function createSafeLogContext(value: unknown) {
  return redactLogValue(value, 0);
}
```

Use this helper in `apps/api/src/routes/logs.ts`:

```ts
import { createSafeLogContext, redactString } from "../observability/redaction";
```

```ts
const logRecord = {
  requestId,
  source: "web",
  ip,
  url: payload.url ? redactString(payload.url) : undefined,
  userAgent: payload.userAgent ? redactString(payload.userAgent) : undefined,
  timestamp: payload.timestamp,
  context: createSafeLogContext(payload.context),
};
```

- [ ] **Step 5: Implement bounded tail reads**

Modify `apps/api/src/observability/logger.ts`:

```ts
const MAX_LOG_TAIL_BYTES = 256 * 1024;

function readTail(filePath: string) {
  const stats = fs.statSync(filePath);
  const bytesToRead = Math.min(stats.size, MAX_LOG_TAIL_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  const fd = fs.openSync(filePath, "r");

  try {
    fs.readSync(fd, buffer, 0, bytesToRead, stats.size - bytesToRead);
  } finally {
    fs.closeSync(fd);
  }

  const raw = buffer.toString("utf8");
  if (stats.size <= MAX_LOG_TAIL_BYTES) {
    return raw;
  }

  const firstNewline = raw.indexOf("\n");
  return firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw;
}
```

Replace `const raw = fs.readFileSync(filePath, "utf8");` with:

```ts
const raw = readTail(filePath);
```

- [ ] **Step 6: Run logging tests**

Run: `bun run --cwd apps/api test apps/api/tests/observability/logger.test.ts apps/api/tests/app.functional.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/observability/redaction.ts apps/api/src/observability/logger.ts apps/api/src/routes/logs.ts apps/api/tests/observability/logger.test.ts apps/api/tests/app.functional.test.ts
git commit -m "fix: sanitize client logs and bound log reads"
```

## Task 9: Audit Admin Auth Mutations

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Write failing route tests for admin auth audit entries**

Add tests for role, ban, unban, impersonation, set-password, and stop-impersonating. Use this pattern for each route:

```ts
it("records audit entries for admin role changes", async () => {
  mocks.adminAuthApi.setRole.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

  const res = await app.request("/admin/users/set-role", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "66666666-6666-4666-8666-666666666666", role: "admin" }),
  });

  expect(res.status).toBe(200);
  expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
    action: "admin.user.set_role",
    outcome: "success",
    actorId: "auth-user",
    targetType: "user",
    targetId: "66666666-6666-4666-8666-666666666666",
    after: expect.objectContaining({ role: "admin" }),
  }));
});
```

For admin-set-password, assert the password is not included:

```ts
expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
  action: "admin.user.set_password",
  after: { passwordUpdated: true },
  metadata: expect.not.objectContaining({ password: expect.anything() }),
}));
```

For stop-impersonating in `apps/api/src/routes/auth.ts`, assert action `admin.impersonation.stop` with target type `session`.

- [ ] **Step 2: Run route tests to verify failure**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: FAIL because admin auth routes do not record audit entries.

- [ ] **Step 3: Add audit calls around admin auth routes**

In `apps/api/src/routes/admin.ts`, after successful Better Auth admin calls, add calls like:

```ts
await bootstrap.auditService.recordAuditEntry({
  ...getAuditRequestContext(c),
  action: "admin.user.set_role",
  outcome: "success",
  targetType: "user",
  targetId: parsedBody.data.userId,
  after: { role: parsedBody.data.role },
});
```

Use these action names:

- `admin.user.set_role`
- `admin.user.ban`
- `admin.user.unban`
- `admin.impersonation.start`
- `admin.user.set_password`

For `admin.user.ban`, include `after: { banned: true, banReason: parsedBody.data.banReason ?? null, banExpires: parsedBody.data.banExpires ?? null }`. Do not include the ban secret.

For `admin.user.set_password`, include only `after: { passwordUpdated: true }`.

In `apps/api/src/routes/auth.ts`, import `bootstrap` and `getAuditRequestContext`, then after successful stop impersonation:

```ts
await bootstrap.auditService.recordAuditEntry({
  ...getAuditRequestContext(c),
  action: "admin.impersonation.stop",
  outcome: "success",
  targetType: "session",
  metadata: { stopped: true },
});
```

- [ ] **Step 4: Run route tests**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/auth.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: audit admin auth mutations"
```

## Task 10: Audit Discount And Voucher Mutations

**Files:**
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Write failing route tests for discount and voucher audit entries**

Add route assertions for create/update/delete discounts and create/update vouchers. Example:

```ts
it("records audit entries for discount mutations", async () => {
  mocks.discountsService.createDiscount.mockResolvedValueOnce({ success: true, data: { id: "discount-1", code: "SPRING" } });

  const res = await app.request("/admin/discounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "SPRING", type: "percentage", value: 10 }),
  });

  expect(res.status).toBe(200);
  expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
    action: "discount.create",
    outcome: "success",
    targetType: "discount",
    targetId: "discount-1",
    after: expect.objectContaining({ code: "SPRING" }),
  }));
});
```

For failed service responses, assert `outcome: "failure"` and safe `metadata.error`:

```ts
expect(mocks.auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
  action: "voucher.update",
  outcome: "failure",
  metadata: expect.objectContaining({ error: "Voucher not found" }),
}));
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: FAIL because discount/voucher routes do not audit.

- [ ] **Step 3: Add discount audit calls**

In `apps/api/src/routes/admin.ts`, after each discount service result:

```ts
await bootstrap.auditService.recordAuditEntry({
  ...getAuditRequestContext(c),
  action: "discount.create",
  outcome: result.success ? "success" : "failure",
  targetType: "discount",
  targetId: result.success ? result.data?.id ?? null : null,
  after: result.success ? result.data : null,
  metadata: result.success ? { code: result.data?.code } : { error: result.error },
});
```

Use `discount.update` for patch and `discount.delete` for delete. For update/delete, use `targetId: parsedParams.data.discountId`.

- [ ] **Step 4: Add voucher audit calls**

In create/update voucher routes, record:

```ts
await bootstrap.auditService.recordAuditEntry({
  ...getAuditRequestContext(c),
  action: "voucher.create",
  outcome: result.success ? "success" : "failure",
  targetType: "voucher",
  targetId: result.success ? result.voucher?.id ?? null : null,
  after: result.success ? result.voucher : null,
  metadata: result.success ? { code: result.voucher?.code } : { error: result.error },
});
```

Use `voucher.update` for patch and `targetId: parsedParams.data.voucherId`.

- [ ] **Step 5: Run route tests**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/tests/app.functional.test.ts
git commit -m "feat: audit discount and voucher mutations"
```

## Task 11: Audit Webhook Processing Failures Safely

**Files:**
- Modify: `packages/payments-core/src/create-payments-module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/tests/payments-core/webhook-verify.test.ts`

- [ ] **Step 1: Write failing webhook audit callback test**

In `apps/api/tests/payments-core/webhook-verify.test.ts`, add a test that constructs `createPaymentsModule` with an `onWebhookFailure` callback:

```ts
it("reports safe webhook failure metadata", async () => {
  const onWebhookFailure = vi.fn();
  const module = createPaymentsModule({
    dodoWebhookSecret: "secret",
    onPaymentEvent: vi.fn().mockRejectedValue(new Error("handler failed with token abc.def.ghi")),
    webhookEventStore: {
      claim: vi.fn().mockResolvedValue({ claimed: true }),
      markProcessed: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
    },
    onWebhookFailure,
  });

  const body = JSON.stringify({ type: "payment.succeeded", id: "evt_1", data: { payment_id: "pay_1" } });
  const res = await module.router.request("/webhooks/dodo", {
    method: "POST",
    headers: signedDodoHeaders(body, "secret"),
    body,
  });

  expect(res.status).toBe(500);
  expect(onWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
    provider: "dodo",
    providerEventId: "evt_1",
    eventType: "payment.succeeded",
    paymentId: "pay_1",
    outcome: "failure",
    error: expect.not.stringContaining("abc.def.ghi"),
  }));
});
```

Use the existing signing helper in that test file. If the helper has a different name, call the existing helper used by current successful webhook tests.

- [ ] **Step 2: Run webhook tests to verify failure**

Run: `bun run --cwd apps/api test apps/api/tests/payments-core/webhook-verify.test.ts`

Expected: FAIL because `onWebhookFailure` is not supported.

- [ ] **Step 3: Add optional callback in payments core**

Modify the input type in `packages/payments-core/src/create-payments-module.ts`:

```ts
onWebhookFailure?: (event: {
  provider: "dodo";
  providerEventId?: string | null;
  eventType?: string | null;
  paymentId?: string | null;
  outcome: "failure";
  error: string;
}) => Promise<void> | void;
```

When signature, JSON parsing, missing ID, or handler processing fails, call:

```ts
await deps.onWebhookFailure?.({
  provider: "dodo",
  providerEventId,
  eventType,
  paymentId,
  outcome: "failure",
  error: error instanceof Error ? redactString(error.message) : "Webhook processing failed",
});
```

Import `redactString` from the nearest shared redaction utility if available in `packages/payments-core`; otherwise implement a tiny local sanitizer that redacts bearer-token-shaped strings and avoids raw payloads.

- [ ] **Step 4: Wire callback to audit service**

In `apps/api/src/bootstrap.ts`, pass to `createPaymentsModule`:

```ts
onWebhookFailure: async (event) => {
  await auditService.recordAuditEntry({
    action: "billing.webhook.failure",
    outcome: "failure",
    targetType: "payment_webhook_event",
    targetId: event.providerEventId ?? null,
    metadata: {
      provider: event.provider,
      providerEventId: event.providerEventId ?? null,
      eventType: event.eventType ?? null,
      paymentId: event.paymentId ?? null,
      error: event.error,
    },
  });
},
```

- [ ] **Step 5: Run webhook tests and API typecheck**

Run: `bun run --cwd apps/api test apps/api/tests/payments-core/webhook-verify.test.ts`

Expected: PASS.

Run: `bun run typecheck:all`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/payments-core/src/create-payments-module.ts apps/api/src/bootstrap.ts apps/api/tests/payments-core/webhook-verify.test.ts
git commit -m "feat: audit webhook failures"
```

## Task 12: Final Contract, OpenAPI, And Verification Sweep

**Files:**
- Inspect: `apps/api/src/openapi.ts`
- Inspect: `packages/contracts/src/wire/notifications/common.ts`
- Inspect: `docs/reviews/saas-boilerplate-implementation-plan.md`

- [ ] **Step 1: Run contract and route coverage tests**

Run: `bun run --cwd apps/api test apps/api/tests/app.functional.test.ts`

Expected: PASS, including route/OpenAPI coverage checks.

- [ ] **Step 2: Run full API test suite**

Run: `bun run --cwd apps/api test`

Expected: PASS.

- [ ] **Step 3: Run full typecheck**

Run: `bun run typecheck:all`

Expected: PASS.

- [ ] **Step 4: Run DB migration check**

Run: `bun run db:check`

Expected: PASS.

- [ ] **Step 5: Inspect git diff for scope**

Run: `git diff --stat HEAD`

Expected: Diff only includes Phase 6 notification, logging, audit, contracts, tests, and documentation files. No organization, team, tenant, or multi-tenancy files should be added.

- [ ] **Step 6: Commit final polish**

If the verification sweep required fixes in these exact files, commit them:

```bash
git add apps/api/src/openapi.ts packages/contracts/src/wire/notifications/common.ts docs/reviews/saas-boilerplate-implementation-plan.md
git commit -m "chore: finalize phase 6 verification"
```

If no files changed, do not create an empty commit.

## Final Verification

Before opening a PR or claiming Phase 6 complete, run:

```bash
bun run --cwd apps/api test
bun run typecheck:all
bun run db:check
```

Expected final result: all commands pass. If a command fails, fix the failing behavior with the smallest correct change, rerun the failing command, then rerun the full final verification list.
