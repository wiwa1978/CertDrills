import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { Hono } from "hono";

import {
  adminBackgroundEventsQuerySchema,
  adminEmailDeliveriesQuerySchema,
  adminSecretOnlySchema,
  backgroundEventIdParamSchema,
} from "@platform/contracts";
import { backgroundEvents, emailDeliveries } from "@platform/platform-db";

import type { PlatformServices } from "../bootstrap";
import type { AppEnv } from "../context";
import { badGateway, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { getAuditRequestContext } from "../modules/audit/service";

type BackgroundEventRow = typeof backgroundEvents.$inferSelect;
type EmailDeliveryRow = typeof emailDeliveries.$inferSelect;

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function publicBackgroundEvent(event: BackgroundEventRow) {
  return {
    id: event.id,
    eventName: event.eventName,
    status: event.status,
    attempts: event.attempts,
    nextAttemptAt: isoDate(event.nextAttemptAt) ?? new Date(0).toISOString(),
    publishedAt: isoDate(event.publishedAt),
    inngestEventId: event.inngestEventId,
    lastError: event.lastError,
    payload: event.payload,
    createdAt: isoDate(event.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(event.updatedAt) ?? new Date(0).toISOString(),
  };
}

function publicEmailDelivery(email: EmailDeliveryRow) {
  return {
    id: email.id,
    to: email.to,
    subject: email.subject,
    status: email.status,
    attempts: email.attempts,
    lastAttemptAt: isoDate(email.lastAttemptAt),
    sentAt: isoDate(email.sentAt),
    failedAt: isoDate(email.failedAt),
    lastError: email.lastError,
    providerMessageId: email.providerMessageId,
    metadata: email.metadata ?? null,
    createdAt: isoDate(email.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(email.updatedAt) ?? new Date(0).toISOString(),
  };
}

function buildBackgroundEventsWhere(filters: { eventName?: string; status?: BackgroundEventRow["status"] }) {
  const conditions: SQL[] = [];
  if (filters.eventName) conditions.push(ilike(backgroundEvents.eventName, `%${filters.eventName}%`));
  if (filters.status) conditions.push(eq(backgroundEvents.status, filters.status));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildEmailDeliveriesWhere(filters: { text?: string; status?: EmailDeliveryRow["status"] }) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(emailDeliveries.status, filters.status));
  if (filters.text) conditions.push(or(ilike(emailDeliveries.to, `%${filters.text}%`), ilike(emailDeliveries.subject, `%${filters.text}%`))!);
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function registerAdminOperationsRoutes(router: Hono<AppEnv>, services: PlatformServices) {
  router.get("/operations/stats", async (c) => {
    const [eventRows, emailRows] = await Promise.all([
      services.db.select({ status: backgroundEvents.status, count: count() }).from(backgroundEvents).groupBy(backgroundEvents.status),
      services.db.select({ status: emailDeliveries.status, count: count() }).from(emailDeliveries).groupBy(emailDeliveries.status),
    ]);
    const data = {
      events: { total: 0, pending: 0, publishing: 0, published: 0, failed: 0 },
      emails: { total: 0, pending: 0, sending: 0, sent: 0, failed: 0 },
    };
    for (const row of eventRows) {
      const value = Number(row.count ?? 0);
      data.events[row.status] = value;
      data.events.total += value;
    }
    for (const row of emailRows) {
      const value = Number(row.count ?? 0);
      data.emails[row.status] = value;
      data.emails.total += value;
    }
    return c.json({ success: true, data });
  });

  router.get("/operations/background-events", async (c) => {
    const parsed = parseQuery(adminBackgroundEventsQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      eventName: c.req.query("eventName"),
      status: c.req.query("status"),
    });
    if (!parsed.success) return validationError(c, "Invalid background events query");
    const where = buildBackgroundEventsWhere(parsed.data);
    const [rows, totals] = await Promise.all([
      services.db.select().from(backgroundEvents).where(where).orderBy(desc(backgroundEvents.createdAt)).limit(parsed.data.limit).offset(parsed.data.offset),
      services.db.select({ count: count() }).from(backgroundEvents).where(where),
    ]);
    return c.json({ success: true, data: { events: rows.map(publicBackgroundEvent), total: Number(totals[0]?.count ?? 0) } });
  });

  router.post("/operations/background-events/:eventId/redrive", async (c) => {
    const parsedParams = parseParams(backgroundEventIdParamSchema, { eventId: c.req.param("eventId") });
    if (!parsedParams.success) return validationError(c, "Invalid background event id");
    const parsedBody = parseJsonBody(adminSecretOnlySchema, await c.req.json().catch(() => null));
    if (!parsedBody.success) return validationError(c, "Invalid redrive payload");
    const verified = await services.adminService.verifyAdminSecret(parsedBody.data.secret);
    if (!verified.success) return c.json({ success: false, error: verified.error ?? "Invalid admin secret" }, 403);

    try {
      const result = await services.outboxPublisher.redrive(parsedParams.data.eventId);
      await services.auditService.recordAuditEntry({
        ...getAuditRequestContext(c),
        action: "background_event.redrive",
        outcome: "success",
        targetType: "background_event",
        targetId: parsedParams.data.eventId,
      });
      return c.json({ success: true, data: result });
    } catch (error) {
      return badGateway(c, error instanceof Error ? error.message : "Failed to redrive background event");
    }
  });

  router.get("/operations/email-deliveries", async (c) => {
    const parsed = parseQuery(adminEmailDeliveriesQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      status: c.req.query("status"),
      text: c.req.query("text"),
    });
    if (!parsed.success) return validationError(c, "Invalid email deliveries query");
    const where = buildEmailDeliveriesWhere(parsed.data);
    const [rows, totals] = await Promise.all([
      services.db.select().from(emailDeliveries).where(where).orderBy(desc(emailDeliveries.createdAt)).limit(parsed.data.limit).offset(parsed.data.offset),
      services.db.select({ count: count() }).from(emailDeliveries).where(where),
    ]);
    return c.json({ success: true, data: { emails: rows.map(publicEmailDelivery), total: Number(totals[0]?.count ?? 0) } });
  });
}
