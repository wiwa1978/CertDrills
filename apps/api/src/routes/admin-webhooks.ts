import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import type { Hono } from "hono";

import { webhookEventIdParamSchema, webhookEventsQuerySchema } from "@platform/contracts";
import { paymentWebhookEvents } from "@platform/platform-db";

import type { PlatformServices } from "../bootstrap";
import type { AppEnv } from "../context";
import { notFound, parseParams, parseQuery, validationError } from "../lib/http";

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
    sanitizedPayload: event.sanitizedPayload ?? null,
    requestId: event.requestId,
    correlationId: event.correlationId,
    durationMs: event.durationMs,
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

function buildWhere(filters: {
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

export function registerAdminWebhookRoutes(router: Hono<AppEnv>, services: PlatformServices) {
  router.get("/webhooks", async (c) => {
    const parsed = parseQuery(webhookEventsQuerySchema, {
      limit: c.req.query("limit"), offset: c.req.query("offset"), provider: c.req.query("provider"), status: c.req.query("status"),
      eventType: c.req.query("eventType"), paymentId: c.req.query("paymentId"), text: c.req.query("text"), dateFrom: c.req.query("dateFrom"), dateTo: c.req.query("dateTo"),
    });
    if (!parsed.success) return validationError(c, "Invalid webhook events query");
    const where = buildWhere(parsed.data);
    const [events, totals] = await Promise.all([
      services.db.query.paymentWebhookEvents.findMany({ where, orderBy: desc(paymentWebhookEvents.createdAt), limit: parsed.data.limit, offset: parsed.data.offset }),
      services.db.select({ count: count() }).from(paymentWebhookEvents).where(where),
    ]);
    return c.json({ success: true, data: { events: events.map(publicWebhookEvent), total: Number(totals[0]?.count ?? 0) } });
  });

  router.get("/webhooks/stats", async (c) => {
    const rows = await services.db.select({ processingStatus: paymentWebhookEvents.processingStatus, count: count() }).from(paymentWebhookEvents).groupBy(paymentWebhookEvents.processingStatus);
    const stats = { total: 0, processing: 0, processed: 0, failed: 0 };
    for (const row of rows) {
      const value = Number(row.count ?? 0);
      if (row.processingStatus === "processing" || row.processingStatus === "processed" || row.processingStatus === "failed") {
        stats[row.processingStatus] = value;
        stats.total += value;
      }
    }
    return c.json({ success: true, data: stats });
  });

  router.get("/webhooks/:eventId", async (c) => {
    const parsed = parseParams(webhookEventIdParamSchema, { eventId: c.req.param("eventId") ?? "" });
    if (!parsed.success) return validationError(c, "Invalid webhook event id");
    const event = await services.db.query.paymentWebhookEvents.findFirst({ where: eq(paymentWebhookEvents.id, parsed.data.eventId) });
    if (!event) return notFound(c, "Webhook event not found");
    return c.json({ success: true, data: publicWebhookEvent(event) });
  });
}
