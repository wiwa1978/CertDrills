import { desc, ilike } from "drizzle-orm";
import type { Context } from "hono";

import { auditEntries } from "@platform/platform-db";

import type { AppEnv } from "../../context";
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
  logger?: { warn(arg1?: unknown, arg2?: unknown): void };
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
  const authUser = c.get("authUser");
  const authSession = c.get("authSession") as { impersonatedBy?: string | null } | null;
  const impersonatedBy = authSession?.impersonatedBy ?? null;
  const subjectId = authUser?.id ?? null;

  return {
    actorId: impersonatedBy ?? subjectId,
    requestId: c.get("requestId") ?? null,
    ip: forwardedFor?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null,
    userAgent: c.req.header("user-agent") ?? null,
    metadata: impersonatedBy
      ? {
          impersonatedBy,
          subjectId,
        }
      : undefined,
  };
}

export function createAuditService(deps: AuditServiceDeps) {
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
      try {
        const auditLogger = deps.logger ?? (await import("../../observability/logger")).logger;
        auditLogger.warn({ error, action: input.action }, "Failed to record audit entry");
      } catch {
        // Audit logging must never mask the original application flow.
      }
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
