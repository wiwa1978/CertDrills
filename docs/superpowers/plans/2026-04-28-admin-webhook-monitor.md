# Admin Webhook Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Hono admin webhook monitor that closely ports the reference webhook table.

**Architecture:** The admin UI calls service wrappers, which call Hono admin API endpoints. The API exposes read-only list, stats, and detail endpoints backed by `payment_webhook_events` and returns DTOs tailored to the table/dialog.

**Tech Stack:** Hono, Drizzle ORM, Zod, Next.js App Router, React client components, shadcn/ui, Vitest, TypeScript.

---

## File Structure

- Modify `packages/contracts/src/wire/admin/requests.ts`: add webhook monitor query and param schemas.
- Modify `packages/contracts/src/wire/admin/responses.ts`: add webhook event, list, stats, and detail DTO types.
- Modify `apps/api/src/routes/admin.ts`: add `/admin/webhooks`, `/admin/webhooks/stats`, and `/admin/webhooks/:eventId` routes.
- Modify `apps/api/tests/app.functional.test.ts`: add mocked Drizzle behavior and route tests for webhook endpoints.
- Modify `apps/admin/src/lib/api/admin.ts`: add API client functions for webhook list, stats, and detail.
- Modify `apps/admin/src/lib/services/admin.ts`: add safe service wrappers used by admin pages/components.
- Create `apps/admin/src/components/layout/backend/admin/webhooks/webhook-events-monitor.tsx`: adapted reference webhook table and dialog.
- Create `apps/admin/src/app/[locale]/(backend)/(admin)/admin/webhooks/page.tsx`: server page that loads initial events/stats.
- Modify `apps/admin/src/config/backend-navbar-admin.tsx`: add Webhooks nav entry.

## Task 1: Contracts and API Tests

**Files:**
- Modify: `packages/contracts/src/wire/admin/requests.ts`
- Modify: `packages/contracts/src/wire/admin/responses.ts`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Add webhook contract schemas**

In `packages/contracts/src/wire/admin/requests.ts`, add these exports after `billingListQuerySchema`:

```ts
export const webhookEventStatusSchema = z.enum(["processing", "processed", "failed"]);

export const webhookEventsQuerySchema = paginationQuerySchema.extend({
  provider: z.string().trim().min(1).max(100).optional(),
  status: webhookEventStatusSchema.optional(),
  eventType: z.string().trim().min(1).max(255).optional(),
  paymentId: z.string().trim().min(1).max(255).optional(),
  text: z.string().trim().min(1).max(255).optional(),
  dateFrom: z.string().trim().min(1).max(40).optional(),
  dateTo: z.string().trim().min(1).max(40).optional(),
});

export const webhookEventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});
```

In `packages/contracts/src/wire/admin/responses.ts`, add these schemas before response schema exports:

```ts
export const adminWebhookEventStatusSchema = z.enum(["processing", "processed", "failed"]);

export const adminWebhookEventSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  providerEventId: z.string(),
  eventType: z.string(),
  paymentId: z.string().nullable(),
  signatureTimestamp: z.string().nullable(),
  processingStatus: adminWebhookEventStatusSchema,
  errorDetails: z.unknown().nullable(),
  processedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const adminWebhookEventsListSchema = z.object({
  events: z.array(adminWebhookEventSchema),
  total: z.number().int().nonnegative(),
});

export const adminWebhookStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
```

Then add response schemas and types:

```ts
export const adminWebhookEventsListResponseSchema = successResultSchema(adminWebhookEventsListSchema);
export const adminWebhookStatsResponseSchema = successResultSchema(adminWebhookStatsSchema);
export const adminWebhookEventDetailResponseSchema = successResultSchema(adminWebhookEventSchema);

export type AdminWebhookEventStatus = z.infer<typeof adminWebhookEventStatusSchema>;
export type AdminWebhookEvent = z.infer<typeof adminWebhookEventSchema>;
export type AdminWebhookEventsList = z.infer<typeof adminWebhookEventsListSchema>;
export type AdminWebhookStats = z.infer<typeof adminWebhookStatsSchema>;
```

- [ ] **Step 2: Add failing API tests**

In `apps/api/tests/app.functional.test.ts`, extend the `drizzle-orm` mock to include the needed operators:

```ts
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions) => ({ type: "and", conditions })),
  asc: vi.fn((column) => column),
  count: vi.fn(() => ({ type: "count" })),
  desc: vi.fn((column) => column),
  eq: vi.fn((column, value) => ({ column, value })),
  gte: vi.fn((column, value) => ({ column, value, op: "gte" })),
  ilike: vi.fn((column, value) => ({ column, value, op: "ilike" })),
  lte: vi.fn((column, value) => ({ column, value, op: "lte" })),
  or: vi.fn((...conditions) => ({ type: "or", conditions })),
}));
```

In the hoisted `db` mock, add query and chain mocks for webhook routes:

```ts
const webhookRows = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    provider: "dodo",
    providerEventId: "evt_123",
    eventType: "payment.succeeded",
    paymentId: "pay_123",
    signatureTimestamp: new Date("2026-04-28T09:00:00.000Z"),
    processingStatus: "processed",
    errorDetails: null,
    processedAt: new Date("2026-04-28T09:00:03.000Z"),
    failedAt: null,
    createdAt: new Date("2026-04-28T09:00:00.000Z"),
    updatedAt: new Date("2026-04-28T09:00:03.000Z"),
  },
];
const webhookStatsRows = [
  { processingStatus: "processed", count: 1 },
  { processingStatus: "failed", count: 2 },
];
const db = {
  query: {
    paymentWebhookEvents: {
      findMany: vi.fn(async () => webhookRows),
      findFirst: vi.fn(async () => webhookRows[0]),
    },
  },
  select: vi.fn((selection?: Record<string, unknown>) => {
    let selectedLanguage = "en";
    const builder = {
      from: vi.fn(() => builder),
      where: vi.fn((condition?: { value?: string }) => {
        selectedLanguage = condition?.value ?? "en";
        return builder;
      }),
      groupBy: vi.fn(() => webhookStatsRows),
      limit: vi.fn(() => builder),
      offset: vi.fn(() => builder),
      orderBy: vi.fn(() => {
        if (selection && "count" in selection) return [{ count: webhookRows.length }];
        return countries.filter((country) => country.language === selectedLanguage);
      }),
    };
    return builder;
  }),
};
```

Add tests near the admin route tests:

```ts
it("lists admin webhook events", async () => {
  const response = await app.request("/admin/webhooks?limit=20&offset=0&status=processed&text=evt_123", {
    headers: adminHeaders,
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.total).toBe(1);
  expect(body.data.events[0]).toMatchObject({
    provider: "dodo",
    providerEventId: "evt_123",
    processingStatus: "processed",
  });
  expect(body.data.events[0].createdAt).toBe("2026-04-28T09:00:00.000Z");
});

it("returns admin webhook stats", async () => {
  const response = await app.request("/admin/webhooks/stats", { headers: adminHeaders });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data).toEqual({ total: 3, processing: 0, processed: 1, failed: 2 });
});

it("returns admin webhook event details", async () => {
  const response = await app.request("/admin/webhooks/11111111-1111-4111-8111-111111111111", {
    headers: adminHeaders,
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.providerEventId).toBe("evt_123");
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `./node_modules/.bin/vitest run apps/api/tests/app.functional.test.ts --testNamePattern "webhook"`

Expected: FAIL because admin webhook routes do not exist yet.

## Task 2: Hono API Webhook Routes

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Add route imports**

Update imports in `apps/api/src/routes/admin.ts`:

```ts
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { paymentWebhookEvents } from "@platform/platform-db";
```

Add contract imports:

```ts
  webhookEventIdParamSchema,
  webhookEventsQuerySchema,
```

- [ ] **Step 2: Add webhook helpers**

Add above `export function createAdminRouter()`:

```ts
type WebhookEventRow = typeof paymentWebhookEvents.$inferSelect;

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function publicWebhookEvent(event: WebhookEventRow) {
  return {
    id: event.id,
    provider: event.provider,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    paymentId: event.paymentId,
    signatureTimestamp: isoDate(event.signatureTimestamp),
    processingStatus: event.processingStatus,
    errorDetails: event.errorDetails ?? null,
    processedAt: isoDate(event.processedAt),
    failedAt: isoDate(event.failedAt),
    createdAt: isoDate(event.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(event.updatedAt) ?? new Date(0).toISOString(),
  };
}

function parseOptionalDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildWebhookEventWhere(filters: {
  provider?: string;
  status?: "processing" | "processed" | "failed";
  eventType?: string;
  paymentId?: string;
  text?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const conditions: SQL[] = [];
  if (filters.provider) conditions.push(eq(paymentWebhookEvents.provider, filters.provider));
  if (filters.status) conditions.push(eq(paymentWebhookEvents.processingStatus, filters.status));
  if (filters.eventType) conditions.push(ilike(paymentWebhookEvents.eventType, `%${filters.eventType}%`));
  if (filters.paymentId) conditions.push(ilike(paymentWebhookEvents.paymentId, `%${filters.paymentId}%`));
  if (filters.text) {
    conditions.push(or(
      ilike(paymentWebhookEvents.provider, `%${filters.text}%`),
      ilike(paymentWebhookEvents.providerEventId, `%${filters.text}%`),
      ilike(paymentWebhookEvents.eventType, `%${filters.text}%`),
      ilike(paymentWebhookEvents.paymentId, `%${filters.text}%`),
    )!);
  }
  const dateFrom = parseOptionalDate(filters.dateFrom);
  if (dateFrom) conditions.push(gte(paymentWebhookEvents.createdAt, dateFrom));
  const dateTo = parseOptionalDate(filters.dateTo);
  if (dateTo) conditions.push(lte(paymentWebhookEvents.createdAt, dateTo));
  return conditions.length > 0 ? and(...conditions) : undefined;
}
```

- [ ] **Step 3: Add routes**

Add after billing routes and before discounts routes:

```ts
  router.get("/webhooks", async (c) => {
    const parsedQuery = parseQuery(webhookEventsQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      provider: c.req.query("provider"),
      status: c.req.query("status"),
      eventType: c.req.query("eventType"),
      paymentId: c.req.query("paymentId"),
      text: c.req.query("text"),
      dateFrom: c.req.query("dateFrom"),
      dateTo: c.req.query("dateTo"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid webhook events query");
    }

    const where = buildWebhookEventWhere(parsedQuery.data);
    const [events, totalRows] = await Promise.all([
      bootstrap.db.query.paymentWebhookEvents.findMany({
        where,
        orderBy: desc(paymentWebhookEvents.createdAt),
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      }),
      bootstrap.db
        .select({ count: count() })
        .from(paymentWebhookEvents)
        .where(where),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return c.json({ success: true, data: { events: events.map(publicWebhookEvent), total } });
  });

  router.get("/webhooks/stats", async (c) => {
    const rows = await bootstrap.db
      .select({ processingStatus: paymentWebhookEvents.processingStatus, count: count() })
      .from(paymentWebhookEvents)
      .groupBy(paymentWebhookEvents.processingStatus);

    const stats = { total: 0, processing: 0, processed: 0, failed: 0 };
    for (const row of rows) {
      const status = row.processingStatus;
      const value = Number(row.count ?? 0);
      if (status === "processing" || status === "processed" || status === "failed") {
        stats[status] = value;
        stats.total += value;
      }
    }

    return c.json({ success: true, data: stats });
  });

  router.get("/webhooks/:eventId", async (c) => {
    return withParams(
      c,
      webhookEventIdParamSchema,
      { eventId: c.req.param("eventId") ?? "" },
      "Invalid webhook event id",
      async ({ eventId }) => {
        const event = await bootstrap.db.query.paymentWebhookEvents.findFirst({
          where: eq(paymentWebhookEvents.id, eventId),
        });

        if (!event) {
          return c.json({ success: false, error: "Webhook event not found" }, 404);
        }

        return c.json({ success: true, data: publicWebhookEvent(event) });
      },
    );
  });
```

- [ ] **Step 4: Run webhook tests**

Run: `./node_modules/.bin/vitest run apps/api/tests/app.functional.test.ts --testNamePattern "webhook"`

Expected: PASS.

- [ ] **Step 5: Run API typecheck**

Run: `./node_modules/.bin/tsc --noEmit --project apps/api/tsconfig.json`

Expected: PASS.

## Task 3: Admin App API and Service Layer

**Files:**
- Modify: `apps/admin/src/lib/api/admin.ts`
- Modify: `apps/admin/src/lib/services/admin.ts`

- [ ] **Step 1: Add imports and API functions**

In `apps/admin/src/lib/api/admin.ts`, add type imports:

```ts
  AdminWebhookEvent,
  AdminWebhookEventsList,
  AdminWebhookEventStatus,
  AdminWebhookStats,
```

Add functions after billing API functions:

```ts
export type AdminWebhookEventsQuery = {
  limit?: number;
  offset?: number;
  provider?: string;
  status?: AdminWebhookEventStatus;
  eventType?: string;
  paymentId?: string;
  text?: string;
  dateFrom?: string;
  dateTo?: string;
};

function adminWebhookQueryString(query: AdminWebhookEventsQuery = {}) {
  const params = new URLSearchParams({
    limit: String(query.limit ?? 100),
    offset: String(query.offset ?? 0),
  });

  if (query.provider) params.set("provider", query.provider);
  if (query.status) params.set("status", query.status);
  if (query.eventType) params.set("eventType", query.eventType);
  if (query.paymentId) params.set("paymentId", query.paymentId);
  if (query.text) params.set("text", query.text);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);

  return params.toString();
}

export async function getAdminWebhookEventsApi(query: AdminWebhookEventsQuery = {}) {
  const result = await apiRequest<{ success: boolean; data: AdminWebhookEventsList }>(
    `/admin/webhooks?${adminWebhookQueryString(query)}`,
  );
  return result.data;
}

export async function getAdminWebhookStatsApi() {
  const result = await apiRequest<{ success: boolean; data: AdminWebhookStats }>("/admin/webhooks/stats");
  return result.data;
}

export async function getAdminWebhookEventApi(eventId: string) {
  const result = await apiRequest<{ success: boolean; data: AdminWebhookEvent }>(`/admin/webhooks/${eventId}`);
  return result.data;
}
```

- [ ] **Step 2: Add service wrappers**

In `apps/admin/src/lib/services/admin.ts`, add imports:

```ts
  getAdminWebhookEventApi,
  getAdminWebhookEventsApi,
  getAdminWebhookStatsApi,
  type AdminWebhookEventsQuery,
```

Add types:

```ts
  AdminWebhookEvent,
  AdminWebhookEventsList,
  AdminWebhookStats,
```

Add functions after billing service functions:

```ts
export async function getAdminWebhookEvents(query: AdminWebhookEventsQuery = {}): Promise<AdminWebhookEventsList> {
  try {
    return await getAdminWebhookEventsApi(query);
  } catch {
    return { events: [], total: 0 };
  }
}

export async function getAdminWebhookStats(): Promise<AdminWebhookStats> {
  try {
    return await getAdminWebhookStatsApi();
  } catch {
    return { total: 0, processing: 0, processed: 0, failed: 0 };
  }
}

export async function getAdminWebhookEvent(eventId: string): Promise<AdminWebhookEvent | null> {
  try {
    return await getAdminWebhookEventApi(eventId);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Run admin typecheck**

Run: `./node_modules/.bin/tsc --noEmit --project apps/admin/tsconfig.json`

Expected: PASS or only the known existing `.next/types/validator.ts` errors.

## Task 4: Admin Webhook UI

**Files:**
- Create: `apps/admin/src/components/layout/backend/admin/webhooks/webhook-events-monitor.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/webhooks/page.tsx`
- Modify: `apps/admin/src/config/backend-navbar-admin.tsx`

- [ ] **Step 1: Create monitor component**

Create `apps/admin/src/components/layout/backend/admin/webhooks/webhook-events-monitor.tsx` by adapting the reference table to these Hono fields:

```ts
"use client";

import * as React from "react";
import { Activity, CheckCircle2, Clock3, XCircle } from "lucide-react";

import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminWebhookEvent, AdminWebhookEventsList, AdminWebhookEventStatus, AdminWebhookStats } from "@platform/contracts";

type WebhookEventsMonitorProps = {
  events: AdminWebhookEventsList;
  stats: AdminWebhookStats;
  limit: number;
  activeFilters: FilterState;
};

type FilterState = {
  text: string;
  provider: string;
  status: string;
  eventType: string;
  paymentId: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: FilterState = { text: "", provider: "", status: "", eventType: "", paymentId: "", dateFrom: "", dateTo: "" };

function statusVariant(status: AdminWebhookEventStatus) {
  if (status === "processed") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export function WebhookEventsMonitor({ events, stats, limit, activeFilters }: WebhookEventsMonitorProps) {
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = React.useState<AdminWebhookEvent | null>(null);
  const [filters, setFilters] = React.useState<FilterState>({ ...EMPTY_FILTERS, ...activeFilters });

  function set(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function buildQuery(nextFilters: FilterState) {
    const query: Record<string, string> = { limit: String(limit) };
    if (nextFilters.text) query.text = nextFilters.text;
    if (nextFilters.provider) query.provider = nextFilters.provider;
    if (nextFilters.status) query.status = nextFilters.status;
    if (nextFilters.eventType) query.eventType = nextFilters.eventType;
    if (nextFilters.paymentId) query.paymentId = nextFilters.paymentId;
    if (nextFilters.dateFrom) query.dateFrom = nextFilters.dateFrom;
    if (nextFilters.dateTo) query.dateTo = nextFilters.dateTo;
    return query;
  }

  function applyFilters() {
    router.push({ pathname: "/admin/webhooks", query: buildQuery(filters) });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    router.push({ pathname: "/admin/webhooks", query: { limit: String(limit) } });
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webhook events</h1>
          <p className="text-muted-foreground mt-2">Monitor payment webhook processing and inspect failures.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Total events" value={stats.total} icon={Activity} tone="bg-slate-100 text-slate-700" />
          <MetricCard title="Processed" value={stats.processed} icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" />
          <MetricCard title="Failed" value={stats.failed} icon={XCircle} tone="bg-red-100 text-red-700" />
          <MetricCard title="Processing" value={stats.processing} icon={Clock3} tone="bg-amber-100 text-amber-700" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search by provider, event type, payment id, status, or received date.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <Input placeholder="Search provider, event id, event type, payment id" value={filters.text} onChange={(event) => set("text", event.target.value)} onKeyDown={(event) => event.key === "Enter" && applyFilters()} />
              <div className="w-full lg:w-44">
                <Select value={filters.status || "all"} onValueChange={(value) => set("status", value === "all" ? "" : value)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="processed">Processed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FilterField label="Provider" value={filters.provider} placeholder="dodo" onChange={(value) => set("provider", value)} onEnter={applyFilters} />
              <FilterField label="Event type" value={filters.eventType} placeholder="payment.succeeded" onChange={(value) => set("eventType", value)} onEnter={applyFilters} />
              <FilterField label="Payment ID" value={filters.paymentId} placeholder="pay_123" onChange={(value) => set("paymentId", value)} onEnter={applyFilters} />
              <div className="flex gap-2">
                <div className="flex-1"><Label className="mb-1 block text-xs">From</Label><Input type="date" value={filters.dateFrom} onChange={(event) => set("dateFrom", event.target.value)} /></div>
                <div className="flex-1"><Label className="mb-1 block text-xs">To</Label><Input type="date" value={filters.dateTo} onChange={(event) => set("dateTo", event.target.value)} /></div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={applyFilters}>Apply filters</Button>
              <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Webhook events</CardTitle>
            <CardDescription>Showing {events.events.length} of {events.total} recorded webhook events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead><TableHead>Provider</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Webhook ID</TableHead><TableHead>Payment</TableHead><TableHead>Processed</TableHead><TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.events.length === 0 ? <TableRow><TableCell colSpan={8} className="text-muted-foreground py-10 text-center">No webhook events match the current filters.</TableCell></TableRow> : events.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(event.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline">{event.provider}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{event.eventType}</TableCell>
                      <TableCell><Badge variant={statusVariant(event.processingStatus)}>{event.processingStatus}</Badge></TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs" title={event.providerEventId}>{event.providerEventId}</TableCell>
                      <TableCell className="max-w-56 truncate font-mono text-xs" title={event.paymentId ?? undefined}>{event.paymentId ?? "-"}</TableCell>
                      <TableCell>{event.processedAt ? formatDate(event.processedAt) : event.failedAt ? formatDate(event.failedAt) : "-"}</TableCell>
                      <TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedEvent(event)}>View</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-[min(98vw,90rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Webhook event details</DialogTitle>
            <DialogDescription>{selectedEvent?.provider} · {selectedEvent?.eventType} · {selectedEvent?.processingStatus}</DialogDescription>
          </DialogHeader>
          {selectedEvent && <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <DetailItem label="Database ID" value={selectedEvent.id} />
              <DetailItem label="Webhook ID" value={selectedEvent.providerEventId} />
              <DetailItem label="Payment ID" value={selectedEvent.paymentId} />
              <DetailItem label="Signature time" value={selectedEvent.signatureTimestamp ? formatDate(selectedEvent.signatureTimestamp) : null} />
              <DetailItem label="Received" value={formatDate(selectedEvent.createdAt)} />
              <DetailItem label="Processed" value={selectedEvent.processedAt ? formatDate(selectedEvent.processedAt) : null} />
              <DetailItem label="Failed" value={selectedEvent.failedAt ? formatDate(selectedEvent.failedAt) : null} />
              <DetailItem label="Status" value={selectedEvent.processingStatus} />
            </div>
            <Tabs defaultValue={selectedEvent.errorDetails ? "error" : "metadata"}>
              <TabsList><TabsTrigger value="metadata">Metadata</TabsTrigger><TabsTrigger value="error">Error</TabsTrigger></TabsList>
              <TabsContent value="metadata" className="mt-3"><JsonPanel title="Event" value={selectedEvent} /></TabsContent>
              <TabsContent value="error" className="mt-3"><JsonPanel title="Error" value={selectedEvent.errorDetails} /></TabsContent>
            </Tabs>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricCard({ title, value, icon: Icon, tone }: { title: string; value: number; icon: React.ElementType; tone: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className={`rounded-xl p-2 ${tone}`}><Icon className="h-5 w-5" /></div><div><p className="text-muted-foreground text-sm">{title}</p><p className="text-2xl font-semibold">{value}</p></div></CardContent></Card>;
}

function FilterField({ label, value, placeholder, onChange, onEnter }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onEnter: () => void }) {
  return <div><Label className="mb-1 block text-xs">{label}</Label><Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onEnter()} /></div>;
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return <div className="rounded-lg border bg-muted/30 p-3"><h3 className="mb-2 text-sm font-medium">{title}</h3><pre className="max-h-[58vh] overflow-auto rounded-md bg-background p-3 text-xs leading-relaxed">{jsonPreview(value)}</pre></div>;
}

function DetailItem({ label, value }: { label: string; value: string | number | null }) {
  return <div className="min-w-0"><div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</div><div className="overflow-x-auto whitespace-nowrap font-mono text-xs" title={value === null ? undefined : String(value)}>{value ?? "-"}</div></div>;
}
```

- [ ] **Step 2: Add page**

Create `apps/admin/src/app/[locale]/(backend)/(admin)/admin/webhooks/page.tsx`:

```tsx
import { Container } from "@/components/ui/container";
import { WebhookEventsMonitor } from "@/components/layout/backend/admin/webhooks/webhook-events-monitor";
import { getAdminWebhookEvents, getAdminWebhookStats } from "@/lib/services/admin";
import type { AdminWebhookEventStatus } from "@platform/contracts";

type AdminWebhooksPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function webhookStatus(value: string | undefined): AdminWebhookEventStatus | undefined {
  return value === "processing" || value === "processed" || value === "failed" ? value : undefined;
}

export default async function AdminWebhooksPage({ searchParams }: AdminWebhooksPageProps) {
  const params = (await searchParams) ?? {};
  const limit = Math.min(Math.max(Number(first(params.limit) ?? 100) || 100, 1), 100);
  const activeFilters = {
    text: first(params.text) ?? "",
    provider: first(params.provider) ?? "",
    status: webhookStatus(first(params.status)) ?? "",
    eventType: first(params.eventType) ?? "",
    paymentId: first(params.paymentId) ?? "",
    dateFrom: first(params.dateFrom) ?? "",
    dateTo: first(params.dateTo) ?? "",
  };

  const [events, stats] = await Promise.all([
    getAdminWebhookEvents({ limit, ...activeFilters, status: webhookStatus(activeFilters.status) }),
    getAdminWebhookStats(),
  ]);

  return <Container className="py-6"><WebhookEventsMonitor events={events} stats={stats} limit={limit} activeFilters={activeFilters} /></Container>;
}
```

- [ ] **Step 3: Add nav item**

In `apps/admin/src/config/backend-navbar-admin.tsx`, import `Webhook` from `lucide-react` and add:

```ts
  {
    title: "admin.nav.webhooks",
    url: "/admin/webhooks",
    icon: Webhook,
  },
```

- [ ] **Step 4: Run admin typecheck**

Run: `./node_modules/.bin/tsc --noEmit --project apps/admin/tsconfig.json`

Expected: PASS or only the known existing `.next/types/validator.ts` errors.

## Task 5: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run API webhook tests**

Run: `./node_modules/.bin/vitest run apps/api/tests/app.functional.test.ts --testNamePattern "webhook"`

Expected: PASS.

- [ ] **Step 2: Run auth boundary regression tests**

Run: `./node_modules/.bin/vitest run apps/api/tests/app.authz.functional.test.ts`

Expected: PASS.

- [ ] **Step 3: Run API typecheck**

Run: `./node_modules/.bin/tsc --noEmit --project apps/api/tsconfig.json`

Expected: PASS.

- [ ] **Step 4: Run admin typecheck**

Run: `./node_modules/.bin/tsc --noEmit --project apps/admin/tsconfig.json`

Expected: PASS or only known existing `.next/types/validator.ts` errors.

- [ ] **Step 5: Review git diff**

Run: `git diff -- docs/superpowers/specs/2026-04-28-admin-webhook-monitor-design.md docs/superpowers/plans/2026-04-28-admin-webhook-monitor.md packages/contracts/src/wire/admin/requests.ts packages/contracts/src/wire/admin/responses.ts apps/api/src/routes/admin.ts apps/api/tests/app.functional.test.ts apps/admin/src/lib/api/admin.ts apps/admin/src/lib/services/admin.ts apps/admin/src/components/layout/backend/admin/webhooks/webhook-events-monitor.tsx apps/admin/src/app/[locale]/\(backend\)/\(admin\)/admin/webhooks/page.tsx apps/admin/src/config/backend-navbar-admin.tsx`

Expected: Diff only contains webhook monitor changes and the approved spec/plan.

## Self-Review

- Spec coverage: route list, stats, detail, API-first admin service layer, UI table/dialog, filters, nav, and verification are all covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: API DTO names use `AdminWebhook*`; status values use existing DB statuses `processing`, `processed`, and `failed`.
