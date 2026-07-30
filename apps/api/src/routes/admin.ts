import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import {
  banUserSchema,
  adminCreditsDashboardQuerySchema,
  adminSubscriptionFinanceDashboardQuerySchema,
  adminJobRunsQuerySchema,
  adminJobsQuerySchema,
  adminPendingEmailsQuerySchema,
  billingListQuerySchema,
  billingRangeQuerySchema,
  createCreditRefundSchema,
  discountIdParamSchema,
  discountListQuerySchema,
  generateDiscountCodeSchema,
  logEntriesQuerySchema,
  logFilesQuerySchema,
  notificationsListQuerySchema,
  optionalLimitQuerySchema,
  paginationQuerySchema,
  searchUsersQuerySchema,
  sendNotificationBaseSchema,
  sendNotificationToUsersSchema,
  setRoleSchema,
  setUserPasswordSchema,
  updateDiscountSchema,
  userIdParamSchema,
  userOnlySchema,
  validateDiscountCodeSchema,
  createDiscountSchema,
  createSubscriptionRefundSchema,
  createVoucherSchema,
  updateVoucherSchema,
  verifyAdminSecretSchema,
  adminSecretOnlySchema,
  voucherIdParamSchema,
  voucherListQuerySchema,
  webhookEventIdParamSchema,
  webhookEventsQuerySchema,
} from "@platform/contracts";
import { jobRuns, jobs, paymentWebhookEvents, pendingEmails } from "@platform/platform-db";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { authConfig } from "../config/auth";
import { env } from "../env";
import { createJsonResponseFromAuthResponse, resolveAdminAuthApi } from "../lib/auth-admin";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";
import { badRequest, fail, forbidden, notFound, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { buildRoleChangeAuditMetadata, checkSetRoleGovernance, isImpersonatedSession } from "../modules/admin/governance";
import { getAuditRequestContext } from "../modules/audit/service";
import { logger } from "../observability/logger";

type NotificationSendResultWithBatch = {
  sentCount: number;
  skippedCount: number;
  invalidRecipientCount: number;
  invalidRecipientIds: string[];
  batchId?: string | null;
};

type AdminAuthAuditDetails<T> = {
  action: string;
  targetType: string;
  targetId: (body: T) => string | null;
  after?: (body: T) => unknown;
  metadata?: (body: T) => unknown;
};

const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  role: z.enum(["user", "admin"]).optional(),
});

const adminActionSecretShape = {
  secret: z.string().trim().min(1).max(255),
};

const createDiscountWithSecretSchema = createDiscountSchema.extend(adminActionSecretShape);
const updateDiscountWithSecretSchema = updateDiscountSchema.extend(adminActionSecretShape);
const createVoucherWithSecretSchema = createVoucherSchema.and(z.object(adminActionSecretShape));
const updateVoucherWithSecretSchema = updateVoucherSchema.and(z.object(adminActionSecretShape));
const sendNotificationBaseWithSecretSchema = sendNotificationBaseSchema.extend(adminActionSecretShape);
const sendNotificationToUsersWithSecretSchema = sendNotificationToUsersSchema.extend(adminActionSecretShape);

const adminAllowlist = new Set(
  (env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

function canEnrollTotp(authUser: ReturnType<typeof getAuthUser>) {
  const email = authUser.email?.trim().toLowerCase() ?? "";
  return authUser.role === "admin" && email.length > 0 && adminAllowlist.has(email);
}

function billingModeErrorResponse(c: Context<AppEnv>, error: unknown) {
    const billingModeError = getBillingModeDisabledErrorMessage(error);
    if (billingModeError) {
      return badRequest(c, billingModeError);
    }

  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeAuditMetadata(base: unknown, extra: unknown) {
  if (base === undefined) return extra;
  if (extra === undefined) return base;
  if (isRecord(base) && isRecord(extra)) {
    return { ...base, ...extra };
  }
  return { requestMetadata: base, routeMetadata: extra };
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publicNotificationSendResult(result: NotificationSendResultWithBatch) {
  return {
    sentCount: result.sentCount,
    skippedCount: result.skippedCount,
    invalidRecipientCount: result.invalidRecipientCount,
    invalidRecipientIds: result.invalidRecipientIds,
  };
}

function safeDiscountSummary(value: unknown) {
  if (!isRecord(value)) return null;

  return {
    id: typeof value.id === "string" ? value.id : null,
    code: typeof value.code === "string" ? value.code : null,
    type: typeof value.type === "string" ? value.type : null,
    value: typeof value.value === "number" || typeof value.value === "string" ? value.value : null,
    status: typeof value.status === "string" ? value.status : null,
    maxUses: typeof value.maxUses === "number" || value.maxUses === null ? value.maxUses : null,
    currentUses: typeof value.currentUses === "number" ? value.currentUses : null,
  };
}

function safeVoucherSummary(value: unknown) {
  if (!isRecord(value)) return null;

  return {
    id: typeof value.id === "string" ? value.id : null,
    code: typeof value.code === "string" ? value.code : null,
    creditAmount: typeof value.creditAmount === "number" ? value.creditAmount : null,
    status: typeof value.status === "string" ? value.status : null,
    maxRedemptions: typeof value.maxRedemptions === "number" || value.maxRedemptions === null ? value.maxRedemptions : null,
    currentRedemptions: typeof value.currentRedemptions === "number" ? value.currentRedemptions : null,
    appliesToAllUsers: typeof value.appliesToAllUsers === "boolean" ? value.appliesToAllUsers : null,
  };
}

function resultField(result: unknown, field: string) {
  return isRecord(result) ? result[field] : undefined;
}

function resultError(result: unknown, fallback: string) {
  const error = resultField(result, "error");
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return fallback;
}

function safeErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function publicMutationResult(result: unknown, internalFields: string[]) {
  if (!isRecord(result)) return result;

  const publicResult = { ...result };
  for (const field of internalFields) {
    delete publicResult[field];
  }
  return publicResult;
}

function isSuccessfulMutationResult(result: unknown) {
  return !isRecord(result) || result.success !== false;
}

function resultSuccess(result: unknown) {
  return !isRecord(result) || result.success !== false;
}

function isActiveAdmin(userRecord: { role?: string | null; banned?: boolean | null }) {
  return userRecord.role === "admin" && userRecord.banned !== true;
}

type AdminUserGovernanceRecord = {
  role?: string | null;
  banned?: boolean | null;
} | null;

function notificationSendHistoryItem(entry: Record<string, unknown>) {
  const after = isRecord(entry.after) ? entry.after : {};
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  const scope = after.scope === "selected" ? "selected" : "all";
  const invalidRecipientIds = Array.isArray(metadata.invalidRecipientIds)
    ? metadata.invalidRecipientIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: stringValue(entry.id),
    action: stringValue(entry.action),
    batchId: typeof entry.targetId === "string" ? entry.targetId : null,
    actorId: typeof entry.actorId === "string" ? entry.actorId : null,
    scope,
    title: stringValue(after.title),
    message: stringValue(after.message),
    sentCount: numberValue(metadata.sentCount),
    skippedCount: numberValue(metadata.skippedCount),
    invalidRecipientCount: numberValue(metadata.invalidRecipientCount),
    invalidRecipientIds,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : stringValue(entry.createdAt),
  };
}

type WebhookEventRow = typeof paymentWebhookEvents.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type JobRunRow = typeof jobRuns.$inferSelect;
type PendingEmailRow = typeof pendingEmails.$inferSelect;

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

function publicJob(job: JobRow) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    intervalSeconds: job.intervalSeconds,
    nextRunAt: isoDate(job.nextRunAt) ?? new Date(0).toISOString(),
    lockedAt: isoDate(job.lockedAt),
    lockedBy: job.lockedBy,
    lastRunAt: isoDate(job.lastRunAt),
    lastSuccessAt: isoDate(job.lastSuccessAt),
    lastFailureAt: isoDate(job.lastFailureAt),
    lastError: job.lastError,
    metadata: job.metadata ?? null,
    createdAt: isoDate(job.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(job.updatedAt) ?? new Date(0).toISOString(),
  };
}

function publicJobRun(run: JobRunRow) {
  return {
    id: run.id,
    jobId: run.jobId,
    jobName: run.jobName,
    status: run.status,
    startedAt: isoDate(run.startedAt) ?? new Date(0).toISOString(),
    finishedAt: isoDate(run.finishedAt) ?? new Date(0).toISOString(),
    durationMs: run.durationMs,
    result: run.result ?? null,
    error: run.error,
    createdAt: isoDate(run.createdAt) ?? new Date(0).toISOString(),
  };
}

function publicPendingEmail(email: PendingEmailRow) {
  return {
    id: email.id,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    status: email.status,
    attempts: email.attempts,
    maxAttempts: email.maxAttempts,
    nextAttemptAt: isoDate(email.nextAttemptAt) ?? new Date(0).toISOString(),
    sentAt: isoDate(email.sentAt),
    failedAt: isoDate(email.failedAt),
    lastError: email.lastError,
    providerMessageId: email.providerMessageId,
    metadata: email.metadata ?? null,
    createdAt: isoDate(email.createdAt) ?? new Date(0).toISOString(),
    updatedAt: isoDate(email.updatedAt) ?? new Date(0).toISOString(),
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
    conditions.push(
      or(
        ilike(paymentWebhookEvents.provider, `%${filters.text}%`),
        ilike(paymentWebhookEvents.providerEventId, `%${filters.text}%`),
        ilike(paymentWebhookEvents.eventType, `%${filters.text}%`),
        ilike(paymentWebhookEvents.paymentId, `%${filters.text}%`),
      )!,
    );
  }

  const dateFrom = parseOptionalDate(filters.dateFrom);
  if (dateFrom) conditions.push(gte(paymentWebhookEvents.createdAt, dateFrom));

  const dateTo = parseOptionalDate(filters.dateTo);
  if (dateTo) conditions.push(lte(paymentWebhookEvents.createdAt, dateTo));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildJobsWhere(filters: { name?: string; status?: "idle" | "running" | "disabled" }) {
  const conditions: SQL[] = [];
  if (filters.name) conditions.push(ilike(jobs.name, `%${filters.name}%`));
  if (filters.status) conditions.push(eq(jobs.status, filters.status));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildJobRunsWhere(filters: { jobName?: string; status?: "success" | "failed" }) {
  const conditions: SQL[] = [];
  if (filters.jobName) conditions.push(ilike(jobRuns.jobName, `%${filters.jobName}%`));
  if (filters.status) conditions.push(eq(jobRuns.status, filters.status));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildPendingEmailsWhere(filters: { status?: "pending" | "sending" | "sent" | "failed"; text?: string }) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(pendingEmails.status, filters.status));
  if (filters.text) {
    conditions.push(or(ilike(pendingEmails.to, `%${filters.text}%`), ilike(pendingEmails.subject, `%${filters.text}%`))!);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function createAdminRouter() {
  const router = new Hono<AppEnv>();
  type AdminContext = Context<AppEnv>;

  function requireAdminAuthApi() {
    const adminAuthApi = resolveAdminAuthApi(bootstrap.authModule);
    if (!adminAuthApi) {
      throw new Error("Better Auth admin API is unavailable");
    }

    return adminAuthApi;
  }

  async function withJsonBody<T>(
    c: AdminContext,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    handler: (data: T) => Response | Promise<Response>,
    emptyBodyFallback: unknown = null,
  ) {
    const body = await c.req.json().catch(() => emptyBodyFallback);
    const parsedBody = parseJsonBody(schema, body);

    if (!parsedBody.success) {
      return validationError(c, errorMessage);
    }

    return handler(parsedBody.data);
  }

  function withQuery<T>(
    c: AdminContext,
    schema: z.ZodSchema<T>,
    query: Record<string, string | undefined>,
    errorMessage: string,
    handler: (data: T) => Response | Promise<Response>,
  ) {
    const parsedQuery = parseQuery(schema, query);

    if (!parsedQuery.success) {
      return validationError(c, errorMessage);
    }

    return handler(parsedQuery.data);
  }

  function withParams<T>(
    c: AdminContext,
    schema: z.ZodSchema<T>,
    params: Record<string, string>,
    errorMessage: string,
    handler: (data: T) => Response | Promise<Response>,
  ) {
    const parsedParams = parseParams(schema, params);

    if (!parsedParams.success) {
      return validationError(c, errorMessage);
    }

    return handler(parsedParams.data);
  }

  async function recordAdminAuthAudit<T>(c: AdminContext, body: T, details: AdminAuthAuditDetails<T>) {
    const requestContext = getAuditRequestContext(c);
    const result = await bootstrap.auditService.recordAuditEntry({
      ...requestContext,
      action: details.action,
      outcome: "success",
      targetType: details.targetType,
      targetId: details.targetId(body),
      after: details.after?.(body),
      metadata: mergeAuditMetadata(requestContext.metadata, details.metadata?.(body)),
    }).catch(() => ({ success: false as const }));

    if (!result.success) {
      return fail(c, "Audit logging unavailable", 503);
    }

    return null;
  }

  async function recordMutationAudit(
    c: AdminContext,
    input: {
      action: string;
      outcome: "success" | "failure";
      targetType: string;
      targetId: string | null;
      before?: unknown;
      after?: unknown;
      metadata?: unknown;
    },
  ) {
    const requestContext = getAuditRequestContext(c);
    const result = await bootstrap.auditService.recordAuditEntry({
      ...requestContext,
      ...input,
      metadata: mergeAuditMetadata(requestContext.metadata, input.metadata),
    }).catch(() => ({ success: false as const }));

    if (!result.success) {
      return fail(c, "Audit logging unavailable", 503);
    }

    return null;
  }

  function blockIfSelfRoleChange(c: AdminContext, targetUserId: string, targetUser: AdminUserGovernanceRecord, nextRole: string) {
    const actor = getAuthUser(c);
    if (actor.id !== targetUserId) {
      return null;
    }

    if (!targetUser || targetUser.role === nextRole) {
      return null;
    }

    return forbidden(c, "You cannot change your own role.");
  }

  async function blockIfLastActiveAdminBan(c: AdminContext, targetUser: AdminUserGovernanceRecord) {
    if (!targetUser || !isActiveAdmin(targetUser)) {
      return null;
    }

    const activeAdminCount = await bootstrap.adminService.countActiveAdmins();
    if (activeAdminCount <= 1) {
      return forbidden(c, "Cannot ban the last active admin.");
    }

    return null;
  }

  function blockIfImpersonatedAdminSession(c: AdminContext) {
    if (!isImpersonatedSession(c.get("authSession"))) {
      return null;
    }

    return forbidden(c, "Admin actions are blocked while impersonating another user.");
  }

  async function requireAdminActionSecret(c: AdminContext, secret: string) {
    const result = await bootstrap.adminService.verifyAdminSecret(secret);
    if (!result.success) {
      return forbidden(c, result.error ?? "Invalid admin secret");
    }

    return null;
  }

  function omitAdminSecret<T extends { secret: string }>(body: T) {
    const { secret: _secret, ...rest } = body;
    return rest;
  }

  function withUserIdParam(c: AdminContext, handler: (userId: string) => Response | Promise<Response>) {
    return withParams(c, userIdParamSchema, { userId: c.req.param("userId") ?? "" }, "Invalid user id", ({ userId }) => handler(userId));
  }

  function withDiscountIdParam(c: AdminContext, handler: (discountId: string) => Response | Promise<Response>) {
    return withParams(c, discountIdParamSchema, { discountId: c.req.param("discountId") ?? "" }, "Invalid discount id", ({ discountId }) => handler(discountId));
  }

  function withVoucherIdParam(c: AdminContext, handler: (voucherId: string) => Response | Promise<Response>) {
    return withParams(c, voucherIdParamSchema, { voucherId: c.req.param("voucherId") ?? "" }, "Invalid voucher id", ({ voucherId }) => handler(voucherId));
  }

  function registerAdminAuthJsonAction<T>(
    path: string,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    action: (body: T, headers: Headers) => Promise<unknown>,
    auditDetails?: AdminAuthAuditDetails<T>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const result = await action(body, c.req.raw.headers);
        if (auditDetails && isSuccessfulMutationResult(result)) {
          const auditFailure = await recordAdminAuthAudit(c, body, auditDetails);
          if (auditFailure) return auditFailure;
        }
        return c.json(result);
      });
    });
  }

  function registerAdminAuthSecretJsonAction<T extends { secret: string }>(
    path: string,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    action: (body: Omit<T, "secret">, headers: Headers) => Promise<unknown>,
    auditDetails?: AdminAuthAuditDetails<Omit<T, "secret">>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const secretFailure = await requireAdminActionSecret(c, body.secret);
        if (secretFailure) return secretFailure;

        const actionBody = omitAdminSecret(body);
        const result = await action(actionBody, c.req.raw.headers);
        if (auditDetails && isSuccessfulMutationResult(result)) {
          const auditFailure = await recordAdminAuthAudit(c, actionBody, auditDetails);
          if (auditFailure) return auditFailure;
        }
        return c.json(result);
      });
    });
  }

  function registerAdminAuthResponseAction<T>(
    path: string,
    schema: z.ZodSchema<T>,
    errorMessage: string,
    fallbackError: string,
    action: (body: T, headers: Headers) => Promise<Response>,
    auditDetails?: AdminAuthAuditDetails<T>,
  ) {
    router.post(path, (c) => {
      return withJsonBody(c, schema, errorMessage, async (body) => {
        const response = await action(body, c.req.raw.headers);
        const jsonResponse = await createJsonResponseFromAuthResponse(response, fallbackError);
        const payload = await jsonResponse.clone().json().catch(() => null);
        if (auditDetails && jsonResponse.ok && isSuccessfulMutationResult(payload)) {
          const auditFailure = await recordAdminAuthAudit(c, body, auditDetails);
          if (auditFailure) return auditFailure;
        }
        return jsonResponse;
      });
    });
  }

  router.use("/*", bootstrap.authModule.requireAuth);
  router.use("/*", bootstrap.authModule.requireAdminAccess);
  router.use("/*", async (c, next) => {
    if (c.req.path === "/admin/session" || c.req.path === "/admin/status") {
      return next();
    }

    const block = blockIfImpersonatedAdminSession(c);
    if (block) return block;

    return next();
  });

  router.get("/session", (c) => {
    return c.json({
      success: true,
      data: getAuthUser(c),
    });
  });

  router.get("/status", async (c) => {
    const authUser = getAuthUser(c);
    const allowTotpEnrollment = canEnrollTotp(authUser);
    const currentSession = await bootstrap.authModule.auth.api.getSession({ headers: c.req.raw.headers }) as
      | { user?: { twoFactorEnabled?: boolean | null } }
      | null;
    const twoFactorEnabled = Boolean(currentSession?.user?.twoFactorEnabled);

    return c.json({
      success: true,
      data: {
        message: "Admin access granted.",
        totpRequired: authConfig.adminPortalTotpRequired,
        twoFactorEnabled,
        canEnrollTotp: allowTotpEnrollment,
      },
    });
  });

  router.post("/verify-admin-secret", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(verifyAdminSecretSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid secret payload");
    }

    const result = await bootstrap.adminService.verifyAdminSecret(parsedBody.data.secret);
    if (!result.success) {
      return badRequest(c, result.error ?? "Invalid admin secret");
    }

    return c.json(result);
  });

  router.get("/dashboard/stats", async (c) => {
    const stats = await bootstrap.adminService.getDashboardStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/users", async (c) => {
    const parsedQuery = parseQuery(adminUsersQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      role: c.req.query("role"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid users query");
    }

    const trimmedSearch = parsedQuery.data.search?.trim();
    const users = await bootstrap.adminService.getUsers(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      trimmedSearch || undefined,
      parsedQuery.data.role,
    );
    return c.json({ success: true, data: users });
  });

  router.post("/users/set-role", (c) => {
    return withJsonBody(c, setRoleSchema, "Invalid role payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const roleChangeBody = omitAdminSecret(body);
      const targetUser = await bootstrap.adminService.getUserById(body.userId);
      const selfRoleChangeBlock = blockIfSelfRoleChange(c, roleChangeBody.userId, targetUser, roleChangeBody.role);
      if (selfRoleChangeBlock) return selfRoleChangeBlock;

      const activeAdminCount = targetUser && isActiveAdmin(targetUser) && roleChangeBody.role !== "admin"
        ? await bootstrap.adminService.countActiveAdmins()
        : undefined;
      const governance = checkSetRoleGovernance({
        previousRole: targetUser?.role,
        nextRole: roleChangeBody.role,
        reason: roleChangeBody.reason,
        confirmed: roleChangeBody.confirmed,
        activeAdminCount,
      });
      if (!governance.allowed) {
        return forbidden(c, governance.error);
      }

      const adminAuthApi = requireAdminAuthApi();
      const roleBody = { userId: roleChangeBody.userId, role: roleChangeBody.role };
      const result = await adminAuthApi.setRole({ body: roleBody, headers: c.req.raw.headers });
      if (isSuccessfulMutationResult(result)) {
        const roleChanged = !targetUser || targetUser.role !== roleChangeBody.role;
        if (roleChanged && typeof adminAuthApi.revokeUserSessions === "function") {
          await adminAuthApi.revokeUserSessions({ body: { userId: roleChangeBody.userId }, headers: c.req.raw.headers }).catch((error: unknown) => {
            logger.warn("Failed to revoke user sessions after admin role change", { userId: roleChangeBody.userId, error });
          });
        }
        const auditFailure = await recordAdminAuthAudit(c, roleChangeBody, {
          action: "admin.user.set_role",
          targetType: "user",
          targetId: (body) => body.userId,
          after: (body) => ({ role: body.role }),
          metadata: (body) => buildRoleChangeAuditMetadata({
            previousRole: targetUser?.role,
            nextRole: body.role,
            reason: body.reason,
          }),
        });
        if (auditFailure) return auditFailure;
      }
      return c.json(result);
    });
  });

  registerAdminAuthSecretJsonAction("/users/unban", userOnlySchema, "Invalid unban payload", (body, headers) => {
    return requireAdminAuthApi().unbanUser({ body, headers });
  }, {
    action: "admin.user.unban",
    targetType: "user",
    targetId: (body) => body.userId,
    after: () => ({ banned: false }),
  });

  router.post("/users/ban", (c) => {
    return withJsonBody(c, banUserSchema, "Invalid ban payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const targetUser = await bootstrap.adminService.getUserById(body.userId);
      const lastAdminBlock = await blockIfLastActiveAdminBan(c, targetUser);
      if (lastAdminBlock) return lastAdminBlock;

      const { secret: _secret, ...banBody } = body;
      const result = await requireAdminAuthApi().banUser({ body: banBody, headers: c.req.raw.headers });
      if (isSuccessfulMutationResult(result)) {
        const auditFailure = await recordAdminAuthAudit(c, banBody, {
          action: "admin.user.ban",
          targetType: "user",
          targetId: (body) => body.userId,
          after: (body) => ({ banned: true, ...body }),
        });
        if (auditFailure) return auditFailure;
      }
      return c.json(result);
    });
  });

  router.post("/users/impersonate", (c) => {
    return withJsonBody(c, userOnlySchema, "Invalid impersonation payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const impersonationBody = omitAdminSecret(body);
      const actor = getAuthUser(c);
      const targetUser = await bootstrap.adminService.getUserById(impersonationBody.userId);

      if (!targetUser) {
        return notFound(c, "User not found");
      }

      if (actor.id === impersonationBody.userId) {
        return forbidden(c, "You cannot impersonate yourself.");
      }

      if (targetUser.banned) {
        return forbidden(c, "Cannot impersonate a banned user.");
      }

      if (targetUser.role === "admin") {
        return forbidden(c, "Administrator accounts cannot be impersonated.");
      }

      const response = (await requireAdminAuthApi().impersonateUser({
        body: impersonationBody,
        headers: c.req.raw.headers,
        asResponse: true,
      })) as Response;
      const jsonResponse = await createJsonResponseFromAuthResponse(response, "Impersonation failed");
      const payload = await jsonResponse.clone().json().catch(() => null);

      if (jsonResponse.ok && isSuccessfulMutationResult(payload)) {
        const auditFailure = await recordAdminAuthAudit(c, impersonationBody, {
          action: "admin.impersonation.start",
          targetType: "user",
          targetId: (body) => body.userId,
        });
        if (auditFailure) return auditFailure;
      }

      return jsonResponse;
    });
  });

  registerAdminAuthSecretJsonAction("/users/revoke-sessions", userOnlySchema, "Invalid session revoke payload", (body, headers) => {
    return requireAdminAuthApi().revokeUserSessions({ body, headers });
  }, {
    action: "admin.user.revoke_sessions",
    targetType: "user",
    targetId: (body) => body.userId,
    after: () => ({ sessionsRevoked: true }),
  });

  registerAdminAuthSecretJsonAction("/users/set-password", setUserPasswordSchema, "Invalid password payload", (body, headers) => {
    return requireAdminAuthApi().setUserPassword({ body, headers });
  }, {
    action: "admin.user.set_password",
    targetType: "user",
    targetId: (body) => body.userId,
    after: () => ({ passwordUpdated: true }),
  });

  router.get("/users/stats", async (c) => {
    const stats = await bootstrap.adminService.getUserStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/users/:userId", async (c) => {
    return withUserIdParam(c, async (userId) => {
      const userRecord = await bootstrap.adminService.getUserById(userId);
      if (!userRecord) {
        return notFound(c, "User not found");
      }

      return c.json({ success: true, data: userRecord });
    });
  });

  router.get("/users/:userId/credits/balance", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      const balance = await bootstrap.adminService.getUserCreditBalance(userId);
      return c.json({ success: true, data: balance });
    });
  });

  router.get("/users/:userId/credits/history", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      return withQuery(c, optionalLimitQuerySchema, { limit: c.req.query("limit") }, "Invalid history query", async ({ limit }) => {
        const history = await bootstrap.adminService.getUserCreditHistory(userId, limit);
        return c.json({ success: true, data: history });
      });
    });
  });

  router.get("/users/:userId/credits/purchases", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      return withQuery(c, optionalLimitQuerySchema, { limit: c.req.query("limit") }, "Invalid purchases query", async ({ limit }) => {
        const purchases = await bootstrap.adminService.getUserCreditPurchases(userId, limit);
        return c.json({ success: true, data: purchases });
      });
    });
  });

  router.get("/billing/stats", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const stats = await bootstrap.adminService.getBillingStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/billing/revenue", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getRevenueData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/transactions", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid transactions query");
    }

    const data = await bootstrap.adminService.getAllTransactions(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/purchases", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid purchases query");
    }

    const data = await bootstrap.adminService.getAllPurchases(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/transactions-chart", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getTransactionData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/credits-consumed-chart", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingRangeQuerySchema, { timeRange: c.req.query("timeRange") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid time range");
    }

    const data = await bootstrap.adminService.getCreditsConsumedData(parsedQuery.data.timeRange);
    return c.json({ success: true, data });
  });

  router.get("/billing/credits-dashboard", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(adminCreditsDashboardQuerySchema, {
      creditsPurchasesPage: c.req.query("creditsPurchasesPage"),
      creditsPurchasesSearch: c.req.query("creditsPurchasesSearch"),
      creditsRefundsPage: c.req.query("creditsRefundsPage"),
      creditsRefundsSearch: c.req.query("creditsRefundsSearch"),
      range: c.req.query("range"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid credits dashboard query");
    }

    const data = await bootstrap.adminCreditsDashboardService.getDashboard(parsedQuery.data);
    return c.json({ success: true, data });
  });

  router.post("/billing/credit-refunds", async (c) => {
    return withJsonBody(c, createCreditRefundSchema, "Invalid credit refund payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const actor = getAuthUser(c);
      let result: Awaited<ReturnType<typeof bootstrap.billingService.createCreditRefund>>;

      try {
        result = await bootstrap.billingService.createCreditRefund({
          paymentId: body.paymentId,
          reason: body.reason,
          actorUserId: actor.id,
        });
      } catch (error) {
        const message = safeErrorMessage(error, "Failed to create credit refund");
        const status = message === "Credit purchase not found" ? 404 : message === "Only completed credit purchases can be refunded" ? 400 : 502;
        return fail(c, message, status);
      }

      const auditFailure = await recordMutationAudit(c, {
        action: "billing.credit_refund.create",
        outcome: "success",
        targetType: "credit_purchase",
        targetId: result.purchase.id,
        after: {
          paymentId: result.purchase.paymentId,
          paymentStatus: result.purchase.paymentStatus,
          refundId: result.refund.refundId,
          refundStatus: result.refund.status,
        },
        metadata: {
          reason: body.reason ?? null,
          userId: result.purchase.userId,
          amount: result.refund.amount ?? null,
          currency: result.refund.currency ?? null,
        },
      });
      if (auditFailure) return auditFailure;

      return c.json({ success: true, data: { refund: result.refund, purchase: result.purchase } });
    });
  });

  router.get("/users/:userId/subscription", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withUserIdParam(c, async (userId) => {
      const subscription = await bootstrap.subscriptionService.getUserSubscription(userId);
      return c.json({ success: true, data: subscription ?? null });
    });
  });

  router.get("/billing/subscriptions", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscriptions query");
    }

    const data = await bootstrap.subscriptionService.listSubscriptions(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-payments", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(billingListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      searchEmail: c.req.query("searchEmail"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscription payments query");
    }

    const data = await bootstrap.subscriptionService.listSubscriptionPayments(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.searchEmail,
    );
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-stats", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await bootstrap.subscriptionService.getSubscriptionStats();
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-finance-summary", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await bootstrap.subscriptionService.getSubscriptionFinanceSummary();
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-finance-dashboard", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(adminSubscriptionFinanceDashboardQuerySchema, {
      range: c.req.query("range"),
      startDate: c.req.query("startDate"),
      endDate: c.req.query("endDate"),
      grouping: c.req.query("grouping"),
      currency: c.req.query("currency"),
      planKey: c.req.query("planKey"),
      status: c.req.query("status"),
      search: c.req.query("search"),
      subscriptionsPage: c.req.query("subscriptionsPage"),
      subscriptionsSearch: c.req.query("subscriptionsSearch"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscription finance dashboard query");
    }

    const data = await bootstrap.adminSubscriptionFinanceDashboardService.getDashboard(parsedQuery.data);
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-plan-distribution", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await bootstrap.subscriptionService.getPlanDistribution();
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-events", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscription events query");
    }

    const data = await bootstrap.subscriptionService.listSubscriptionEvents(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.post("/billing/subscription-refunds", async (c) => {
    return withJsonBody(c, createSubscriptionRefundSchema, "Invalid subscription refund payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const refundBody = omitAdminSecret(body);
      const actor = getAuthUser(c);
      let result: Awaited<ReturnType<typeof bootstrap.subscriptionService.createSubscriptionRefund>>;

      try {
        result = await bootstrap.subscriptionService.createSubscriptionRefund({
          paymentId: refundBody.paymentId,
          reason: refundBody.reason,
          actorUserId: actor.id,
        });
      } catch (error) {
        const message = safeErrorMessage(error, "Failed to create subscription refund");
        const status = message === "Subscription payment not found" ? 404 : message === "Only completed payments can be refunded" ? 400 : 502;
        return fail(c, message, status);
      }

      const auditFailure = await recordMutationAudit(c, {
        action: "billing.subscription_refund.create",
        outcome: "success",
        targetType: "subscription_payment",
        targetId: result.payment.id,
        after: {
          paymentId: result.payment.paymentId,
          paymentStatus: result.payment.paymentStatus,
          refundId: result.refund.refundId,
          refundStatus: result.refund.status,
        },
        metadata: {
          reason: refundBody.reason ?? null,
          userId: result.payment.userId,
          amount: result.refund.amount ?? null,
          currency: result.refund.currency ?? null,
        },
      });
      if (auditFailure) return auditFailure;

      return c.json({ success: true, data: { refund: result.refund, payment: result.payment } });
    });
  });

  router.post("/billing/reconcile", async (c) => {
    const parsedBody = parseJsonBody(adminSecretOnlySchema, await c.req.json().catch(() => null));
    if (!parsedBody.success) {
      return validationError(c, "Invalid reconciliation payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    const result = await bootstrap.billingReconciliationService.reconcileProviderBillingStateSafely();
    return c.json({ success: true, data: bootstrap.billingReconciliationService.serializeResult(result) });
  });

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
      bootstrap.db.select({ count: count() }).from(paymentWebhookEvents).where(where),
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
          return notFound(c, "Webhook event not found");
        }

        return c.json({ success: true, data: publicWebhookEvent(event) });
      },
    );
  });

  router.get("/operations/stats", async (c) => {
    const [jobRows, failedJobRunRows, emailRows] = await Promise.all([
      bootstrap.db.select({ status: jobs.status, count: count() }).from(jobs).groupBy(jobs.status),
      bootstrap.db.select({ count: count() }).from(jobRuns).where(eq(jobRuns.status, "failed")),
      bootstrap.db.select({ status: pendingEmails.status, count: count() }).from(pendingEmails).groupBy(pendingEmails.status),
    ]);

    const data = {
      jobs: { total: 0, idle: 0, running: 0, disabled: 0, failedRuns: Number(failedJobRunRows[0]?.count ?? 0) },
      emails: { total: 0, pending: 0, sending: 0, sent: 0, failed: 0 },
    };

    for (const row of jobRows) {
      const status = row.status;
      const value = Number(row.count ?? 0);
      if (status === "idle" || status === "running" || status === "disabled") {
        data.jobs[status] = value;
        data.jobs.total += value;
      }
    }

    for (const row of emailRows) {
      const status = row.status;
      const value = Number(row.count ?? 0);
      if (status === "pending" || status === "sending" || status === "sent" || status === "failed") {
        data.emails[status] = value;
        data.emails.total += value;
      }
    }

    return c.json({ success: true, data });
  });

  router.get("/operations/jobs", async (c) => {
    const parsedQuery = parseQuery(adminJobsQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      name: c.req.query("name"),
      status: c.req.query("status"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid jobs query");
    }

    const where = buildJobsWhere(parsedQuery.data);
    const [rows, totalRows] = await Promise.all([
      bootstrap.db.select().from(jobs).where(where).orderBy(desc(jobs.nextRunAt)).limit(parsedQuery.data.limit).offset(parsedQuery.data.offset),
      bootstrap.db.select({ count: count() }).from(jobs).where(where),
    ]);

    return c.json({ success: true, data: { jobs: rows.map(publicJob), total: Number(totalRows[0]?.count ?? 0) } });
  });

  router.get("/operations/job-runs", async (c) => {
    const parsedQuery = parseQuery(adminJobRunsQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      jobName: c.req.query("jobName"),
      status: c.req.query("status"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid job runs query");
    }

    const where = buildJobRunsWhere(parsedQuery.data);
    const [rows, totalRows] = await Promise.all([
      bootstrap.db.select().from(jobRuns).where(where).orderBy(desc(jobRuns.startedAt)).limit(parsedQuery.data.limit).offset(parsedQuery.data.offset),
      bootstrap.db.select({ count: count() }).from(jobRuns).where(where),
    ]);

    return c.json({ success: true, data: { runs: rows.map(publicJobRun), total: Number(totalRows[0]?.count ?? 0) } });
  });

  router.get("/operations/pending-emails", async (c) => {
    const parsedQuery = parseQuery(adminPendingEmailsQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      status: c.req.query("status"),
      text: c.req.query("text"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid pending emails query");
    }

    const where = buildPendingEmailsWhere(parsedQuery.data);
    const [rows, totalRows] = await Promise.all([
      bootstrap.db.select().from(pendingEmails).where(where).orderBy(desc(pendingEmails.createdAt)).limit(parsedQuery.data.limit).offset(parsedQuery.data.offset),
      bootstrap.db.select({ count: count() }).from(pendingEmails).where(where),
    ]);

    return c.json({ success: true, data: { emails: rows.map(publicPendingEmail), total: Number(totalRows[0]?.count ?? 0) } });
  });

  router.get("/discounts", async (c) => {
    const parsedQuery = parseQuery(discountListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      status: c.req.query("status"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid discount query");
    }

    const result = await bootstrap.discountsService.getDiscounts(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.search,
      parsedQuery.data.status,
    );
    return c.json({ success: true, data: result });
  });

  router.get("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      const result = await bootstrap.discountsService.getDiscountById(discountId);
      if (!result.success) {
        return notFound(c, resultError(result, "Discount not found"));
      }

      return c.json(result);
    });
  });

  router.post("/discounts/generate-code", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsedBody = parseJsonBody(generateDiscountCodeSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid discount code payload");
    }

    try {
      const code = await bootstrap.discountsService.generateDiscountCode(parsedBody.data.overridePrefix);
      return c.json({ success: true, data: { code } });
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : "Failed");
    }
  });

  router.post("/discounts/validate-code", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(validateDiscountCodeSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid discount validation payload");
    }

    const result = await bootstrap.discountsService.validateDiscountCode(parsedBody.data.code, parsedBody.data.excludeId);
    return c.json({ success: true, data: result });
  });

  router.post("/discounts", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createDiscountWithSecretSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid discount payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    const bodyData = omitAdminSecret(parsedBody.data);
    let result: Awaited<ReturnType<typeof bootstrap.discountsService.createDiscount>>;
    try {
      result = await bootstrap.discountsService.createDiscount({
        code: bodyData.code,
        type: bodyData.type,
        value: bodyData.value,
        startDate: bodyData.startDate,
        endDate: bodyData.endDate,
        maxUses: bodyData.maxUses,
      });
    } catch (error) {
      await recordMutationAudit(c, {
        action: "discount.create",
        outcome: "failure",
        targetType: "discount",
        targetId: null,
        after: null,
        metadata: { error: safeErrorMessage(error, "Discount create failed") },
      });
      throw error;
    }
    const discount = resultField(result, "discount");
    const discountSummary = safeDiscountSummary(discount);

    const auditFailure = await recordMutationAudit(c, {
      action: "discount.create",
      outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
      targetType: "discount",
      targetId: isRecord(discount) && typeof discount.id === "string" ? discount.id : null,
      after: isSuccessfulMutationResult(result) ? discountSummary : null,
      metadata: isSuccessfulMutationResult(result)
        ? { code: discountSummary?.code ?? null }
        : { error: resultError(result, "Discount create failed") },
    });
    if (auditFailure) return auditFailure;

    if (!resultSuccess(result)) {
      return badRequest(c, resultError(result, "Discount create failed"));
    }

    return c.json(result);
  });

  router.patch("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      return withJsonBody(c, updateDiscountWithSecretSchema, "Invalid discount update payload", async (bodyData) => {
        const secretFailure = await requireAdminActionSecret(c, bodyData.secret);
        if (secretFailure) return secretFailure;

        const updateBody = omitAdminSecret(bodyData);
        let result: Awaited<ReturnType<typeof bootstrap.discountsService.updateDiscount>>;
        try {
          result = await bootstrap.discountsService.updateDiscount({
            id: discountId,
            code: updateBody.code,
            type: updateBody.type,
            value: updateBody.value,
            startDate: updateBody.startDate,
            endDate: updateBody.endDate,
            maxUses: updateBody.maxUses,
            status: updateBody.status,
          });
        } catch (error) {
          await recordMutationAudit(c, {
            action: "discount.update",
            outcome: "failure",
            targetType: "discount",
            targetId: discountId,
            before: null,
            after: null,
            metadata: { error: safeErrorMessage(error, "Discount update failed") },
          });
          throw error;
        }
        const discount = resultField(result, "discount");
        const previousDiscount = resultField(result, "previousDiscount");
        const discountSummary = safeDiscountSummary(discount);
        const previousDiscountSummary = safeDiscountSummary(previousDiscount);

        const auditFailure = await recordMutationAudit(c, {
          action: "discount.update",
          outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
          targetType: "discount",
          targetId: discountId,
          before: isSuccessfulMutationResult(result) ? previousDiscountSummary : null,
          after: isSuccessfulMutationResult(result) ? discountSummary : null,
          metadata: isSuccessfulMutationResult(result)
            ? { code: discountSummary?.code ?? null }
            : { error: resultError(result, "Discount update failed") },
        });
        if (auditFailure) return auditFailure;

        if (!resultSuccess(result)) {
          return badRequest(c, resultError(result, "Discount update failed"));
        }

        return c.json(publicMutationResult(result, ["previousDiscount"]));
      });
    });
  });

  router.delete("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      const parsedBody = parseJsonBody(adminSecretOnlySchema, await c.req.json().catch(() => null));
      if (!parsedBody.success) {
        return validationError(c, "Invalid discount delete payload");
      }

      const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
      if (secretFailure) return secretFailure;

      let result: Awaited<ReturnType<typeof bootstrap.discountsService.deleteDiscount>>;
      try {
        result = await bootstrap.discountsService.deleteDiscount(discountId);
      } catch (error) {
        await recordMutationAudit(c, {
          action: "discount.delete",
          outcome: "failure",
          targetType: "discount",
          targetId: discountId,
          before: null,
          metadata: { error: safeErrorMessage(error, "Discount delete failed") },
        });
        throw error;
      }
      const previousDiscount = resultField(result, "previousDiscount");
      const previousDiscountSummary = safeDiscountSummary(previousDiscount);

      const auditFailure = await recordMutationAudit(c, {
        action: "discount.delete",
        outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
        targetType: "discount",
        targetId: discountId,
        before: isSuccessfulMutationResult(result) ? previousDiscountSummary : null,
        metadata: isSuccessfulMutationResult(result)
          ? { code: previousDiscountSummary?.code ?? null }
          : { error: resultError(result, "Discount delete failed") },
      });
      if (auditFailure) return auditFailure;

      if (!resultSuccess(result)) {
        return badRequest(c, resultError(result, "Discount delete failed"));
      }

      return c.json(publicMutationResult(result, ["previousDiscount"]));
    });
  });

  router.get("/vouchers", async (c) => {
    const parsedQuery = parseQuery(voucherListQuerySchema, {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
      search: c.req.query("search"),
      status: c.req.query("status"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid voucher query");
    }

    const result = await bootstrap.vouchersService.getVouchers(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.search,
      parsedQuery.data.status,
    );
    return c.json({ success: true, data: result });
  });

  router.get("/vouchers/search-users", async (c) => {
    const parsedQuery = parseQuery(searchUsersQuerySchema, {
      query: c.req.query("query"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid voucher search query");
    }

    const users = await bootstrap.vouchersService.searchUsers(parsedQuery.data.query, parsedQuery.data.limit);
    return c.json({ success: true, data: users });
  });

  router.get("/vouchers/:voucherId", async (c) => {
    return withVoucherIdParam(c, async (voucherId) => {
      const result = await bootstrap.vouchersService.getVoucherById(voucherId);
      if (!result.success) {
        return notFound(c, resultError(result, "Voucher not found"));
      }

      return c.json(result);
    });
  });

  router.post("/vouchers", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createVoucherWithSecretSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid voucher payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    const voucherBody = omitAdminSecret(parsedBody.data);

    let result: Awaited<ReturnType<typeof bootstrap.vouchersService.createVoucher>>;
    try {
      result = await bootstrap.vouchersService.createVoucher(voucherBody);
    } catch (error) {
      await recordMutationAudit(c, {
        action: "voucher.create",
        outcome: "failure",
        targetType: "voucher",
        targetId: null,
        after: null,
        metadata: { error: safeErrorMessage(error, "Voucher create failed") },
      });
      throw error;
    }
    const voucher = resultField(result, "voucher");
    const voucherSummary = safeVoucherSummary(voucher);

    const auditFailure = await recordMutationAudit(c, {
      action: "voucher.create",
      outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
      targetType: "voucher",
      targetId: isRecord(voucher) && typeof voucher.id === "string" ? voucher.id : null,
      after: isSuccessfulMutationResult(result) ? voucherSummary : null,
      metadata: isSuccessfulMutationResult(result)
        ? { code: voucherSummary?.code ?? null }
        : { error: resultError(result, "Voucher create failed") },
    });
    if (auditFailure) return auditFailure;

    if (!resultSuccess(result)) {
      return badRequest(c, resultError(result, "Voucher create failed"));
    }

    return c.json(result);
  });

  router.patch("/vouchers/:voucherId", async (c) => {
    return withVoucherIdParam(c, async (voucherId) => {
      return withJsonBody(c, updateVoucherWithSecretSchema, "Invalid voucher update payload", async (bodyData) => {
        const secretFailure = await requireAdminActionSecret(c, bodyData.secret);
        if (secretFailure) return secretFailure;

        const updateBody = omitAdminSecret(bodyData);
        let result: Awaited<ReturnType<typeof bootstrap.vouchersService.updateVoucher>>;
        try {
          result = await bootstrap.vouchersService.updateVoucher({
            id: voucherId,
            ...updateBody,
          });
        } catch (error) {
          await recordMutationAudit(c, {
            action: "voucher.update",
            outcome: "failure",
            targetType: "voucher",
            targetId: voucherId,
            before: null,
            after: null,
            metadata: { error: safeErrorMessage(error, "Voucher update failed") },
          });
          throw error;
        }
        const voucher = resultField(result, "voucher");
        const previousVoucher = resultField(result, "previousVoucher");
        const voucherSummary = safeVoucherSummary(voucher);
        const previousVoucherSummary = safeVoucherSummary(previousVoucher);

        const auditFailure = await recordMutationAudit(c, {
          action: "voucher.update",
          outcome: isSuccessfulMutationResult(result) ? "success" : "failure",
          targetType: "voucher",
          targetId: voucherId,
          before: isSuccessfulMutationResult(result) ? previousVoucherSummary : null,
          after: isSuccessfulMutationResult(result) ? voucherSummary : null,
          metadata: isSuccessfulMutationResult(result)
            ? { code: voucherSummary?.code ?? null }
            : { error: resultError(result, "Voucher update failed") },
        });
        if (auditFailure) return auditFailure;

        if (!resultSuccess(result)) {
          return badRequest(c, resultError(result, "Voucher update failed"));
        }

        return c.json(publicMutationResult(result, ["previousVoucher"]));
      });
    });
  });

  router.get("/logs/files", async (c) => {
    const parsedQuery = parseQuery(logFilesQuerySchema, {
      stream: c.req.query("stream"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid logs query");
    }

    const files = logger.listLogFiles(parsedQuery.data.stream);
    return c.json({ success: true, data: files });
  });

  router.get("/logs/entries", async (c) => {
    const parsedQuery = parseQuery(logEntriesQuerySchema, {
      stream: c.req.query("stream"),
      file: c.req.query("file"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid log entries query");
    }

    try {
      const data = logger.readLogEntries(parsedQuery.data);
      return c.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid log file") {
        return validationError(c, "Invalid log entries query");
      }
      throw error;
    }
  });

  router.get("/notifications", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const data = await bootstrap.notificationsService.getAllNotifications(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.get("/notifications/sends", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notification sends query");
    }

    const entries = await bootstrap.auditService.listAuditEntries({ actionPrefix: "notification.", limit: parsedQuery.data.limit });
    return c.json({ success: true, data: entries.map((entry: Record<string, unknown>) => notificationSendHistoryItem(entry)) });
  });

  router.get("/notifications/search-users", async (c) => {
    const parsedQuery = parseQuery(searchUsersQuerySchema, {
      query: c.req.query("query"),
      limit: c.req.query("limit"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notification search query");
    }

    const users = await bootstrap.adminService.searchUsers(parsedQuery.data.query, parsedQuery.data.limit);
    return c.json({ success: true, data: users });
  });

  router.post("/notifications/send-all", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(sendNotificationBaseWithSecretSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid notification payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    const notificationBody = omitAdminSecret(parsedBody.data);

    const result = await bootstrap.notificationsService.sendNotificationToAllUsers({
      ...notificationBody,
    }) as NotificationSendResultWithBatch;
    const publicResult = publicNotificationSendResult(result);

    await bootstrap.auditService.recordAuditEntry({
      ...getAuditRequestContext(c),
      action: "notification.send_all",
      outcome: "success",
      targetType: "notification_batch",
      targetId: result.batchId ?? null,
      after: {
        scope: "all",
        title: notificationBody.title,
        message: notificationBody.message,
        type: notificationBody.type ?? "info",
        category: notificationBody.category ?? "system",
        showAsBanner: notificationBody.showAsBanner ?? false,
      },
      metadata: publicResult,
    });

    return c.json({ success: true, data: publicResult });
  });

  router.post("/notifications/send-users", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(sendNotificationToUsersWithSecretSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid notification payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    const notificationBody = omitAdminSecret(parsedBody.data);

    const result = await bootstrap.notificationsService.sendNotificationToUsers({
      ...notificationBody,
    }) as NotificationSendResultWithBatch;
    const publicResult = publicNotificationSendResult(result);

    await bootstrap.auditService.recordAuditEntry({
      ...getAuditRequestContext(c),
      action: "notification.send_users",
      outcome: "success",
      targetType: "notification_batch",
      targetId: result.batchId ?? null,
      after: {
        scope: "selected",
        title: notificationBody.title,
        message: notificationBody.message,
        type: notificationBody.type ?? "info",
        category: notificationBody.category ?? "system",
        showAsBanner: notificationBody.showAsBanner ?? false,
      },
      metadata: {
        ...publicResult,
        requestedRecipientCount: notificationBody.userIds.length,
      },
    });

    return c.json({ success: true, data: publicResult });
  });

  return router;
}
