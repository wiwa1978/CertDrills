import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import {
  banUserSchema,
  adminCreditsDashboardQuerySchema,
  adminSubscriptionFinanceDashboardQuerySchema,
  adminTransactionFinanceDashboardQuerySchema,
  adminTransactionFinanceDashboardSchema,
  billingListQuerySchema,
  billingRangeQuerySchema,
  createCreditRefundSchema,
  createTransactionRefundSchema,
  discountIdParamSchema,
  discountListQuerySchema,
  generateDiscountCodeSchema,
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
  updateApplicationSettingSchema,
  verifyAdminSecretSchema,
  adminSecretOnlySchema,
  resetApplicationSettingSchema,
  voucherIdParamSchema,
  voucherListQuerySchema,
} from "@platform/contracts";
import type { AppEnv } from "../context";
import type { PlatformServices } from "../bootstrap";
import { authConfig } from "../config/auth";
import { env } from "../env";
import { createJsonResponseFromAuthResponse, resolveAdminAuthApi } from "../lib/auth-admin";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, ensureTransactionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";
import { badRequest, fail, forbidden, notFound, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { buildRoleChangeAuditMetadata, checkSetRoleGovernance } from "../modules/admin/governance";
import { getAuditRequestContext } from "../modules/audit/service";
import { logger } from "../observability/logger";
import { registerAdminLogRoutes } from "./admin-logs";
import { registerAdminOperationsRoutes } from "./admin-operations";
import { registerAdminWebhookRoutes } from "./admin-webhooks";

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


export function createAdminRouter(services: PlatformServices) {
  const router = new Hono<AppEnv>();
  registerAdminWebhookRoutes(router, services);
  registerAdminOperationsRoutes(router, services);
  registerAdminLogRoutes(router);
  type AdminContext = Context<AppEnv>;

  function requireAdminAuthApi() {
    const adminAuthApi = resolveAdminAuthApi(services.adminAuthModule);
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
    const result = await services.auditService.recordAuditEntry({
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
    const result = await services.auditService.recordAuditEntry({
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

    const activeAdminCount = await services.adminService.countActiveAdmins();
    if (activeAdminCount <= 1) {
      return forbidden(c, "Cannot ban the last active admin.");
    }

    return null;
  }

  async function requireAdminActionSecret(c: AdminContext, secret: string) {
    const result = await services.adminService.verifyAdminSecret(secret);
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

  router.get("/session", (c) => {
    return c.json({
      success: true,
      data: getAuthUser(c),
    });
  });

  router.get("/status", async (c) => {
    const authUser = getAuthUser(c);
    const allowTotpEnrollment = canEnrollTotp(authUser);
    const currentSession = await services.adminAuthModule.auth.api.getSession({ headers: c.req.raw.headers }) as
      | { user?: { twoFactorEnabled?: boolean | null } }
      | null;
    const twoFactorEnabled = Boolean(currentSession?.user?.twoFactorEnabled);

    return c.json({
      success: true,
      data: {
        message: "Admin access granted.",
        totpRequired: env.ADMIN_PORTAL_TOTP_REQUIRED,
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

    const result = await services.adminService.verifyAdminSecret(parsedBody.data.secret);
    if (!result.success) {
      return badRequest(c, result.error ?? "Invalid admin secret");
    }

    return c.json(result);
  });

  router.get("/dashboard/stats", async (c) => {
    const stats = await services.adminService.getDashboardStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/application-settings", async (c) => {
    const settings = await services.applicationSettingsService.getRuntimeSettingsPayload();
    return c.json({ success: true, data: settings });
  });

  router.put("/application-settings/setting", async (c) => {
    const parsedBody = parseJsonBody(updateApplicationSettingSchema, await c.req.json().catch(() => null));
    if (!parsedBody.success) {
      return validationError(c, "Invalid application setting payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    const authUser = getAuthUser(c);
    const result = await services.applicationSettingsService.updateRuntimeSetting({
      key: parsedBody.data.key,
      value: parsedBody.data.value,
      updatedByUserId: authUser.id,
    });

    if (!result.success) {
      return badRequest(c, result.error);
    }

    const auditContext = getAuditRequestContext(c);
    await services.auditService.recordAuditEntry({
      ...auditContext,
      action: "application_setting.update",
      outcome: "success",
      targetType: "application_setting",
      targetId: parsedBody.data.key,
      after: { value: parsedBody.data.value },
    });

    return c.json({ success: true });
  });

  router.delete("/application-settings/setting", async (c) => {
    const parsedBody = parseJsonBody(resetApplicationSettingSchema, await c.req.json().catch(() => null));
    if (!parsedBody.success) {
      return validationError(c, "Invalid application setting payload");
    }

    const secretFailure = await requireAdminActionSecret(c, parsedBody.data.secret);
    if (secretFailure) return secretFailure;

    await services.applicationSettingsService.resetRuntimeSetting(parsedBody.data.key);

    const auditContext = getAuditRequestContext(c);
    await services.auditService.recordAuditEntry({
      ...auditContext,
      action: "application_setting.reset",
      outcome: "success",
      targetType: "application_setting",
      targetId: parsedBody.data.key,
    });

    return c.json({ success: true });
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
    const users = await services.adminService.getUsers(
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

      return services.adminService.withGovernanceLock(async () => {
        const roleChangeBody = omitAdminSecret(body);
        const targetUser = await services.adminService.getUserById(body.userId);
        const selfRoleChangeBlock = blockIfSelfRoleChange(c, roleChangeBody.userId, targetUser, roleChangeBody.role);
        if (selfRoleChangeBlock) return selfRoleChangeBlock;

        const activeAdminCount = targetUser && isActiveAdmin(targetUser) && roleChangeBody.role !== "admin"
          ? await services.adminService.countActiveAdmins()
          : undefined;
        const governance = checkSetRoleGovernance({
          previousRole: targetUser?.role,
          nextRole: roleChangeBody.role,
          reason: roleChangeBody.reason,
          confirmed: roleChangeBody.confirmed,
          activeAdminCount,
        });
        if (!governance.allowed) return forbidden(c, governance.error);

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
            targetId: (input) => input.userId,
            after: (input) => ({ role: input.role }),
            metadata: (input) => buildRoleChangeAuditMetadata({
              previousRole: targetUser?.role,
              nextRole: input.role,
              reason: input.reason,
            }),
          });
          if (auditFailure) return auditFailure;
        }
        return c.json(result);
      });
    });
  });

  registerAdminAuthSecretJsonAction("/users/unban", userOnlySchema, "Invalid unban payload", (body, headers) => {
    return services.adminService.withGovernanceLock(() => requireAdminAuthApi().unbanUser({ body, headers }));
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

      return services.adminService.withGovernanceLock(async () => {
        const targetUser = await services.adminService.getUserById(body.userId);
        const lastAdminBlock = await blockIfLastActiveAdminBan(c, targetUser);
        if (lastAdminBlock) return lastAdminBlock;

        const { secret: _secret, ...banBody } = body;
        const result = await requireAdminAuthApi().banUser({ body: banBody, headers: c.req.raw.headers });
        if (isSuccessfulMutationResult(result)) {
          const auditFailure = await recordAdminAuthAudit(c, banBody, {
            action: "admin.user.ban",
            targetType: "user",
            targetId: (input) => input.userId,
            after: (input) => ({ banned: true, ...input }),
          });
          if (auditFailure) return auditFailure;
        }
        return c.json(result);
      });
    });
  });

  router.post("/users/impersonate", (c) => {
    return withJsonBody(c, userOnlySchema, "Invalid impersonation payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const impersonationBody = omitAdminSecret(body);
      const actor = getAuthUser(c);
      const targetUser = await services.adminService.getUserById(impersonationBody.userId);

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
    const stats = await services.adminService.getUserStats();
    return c.json({ success: true, data: stats });
  });

  router.get("/users/:userId", async (c) => {
    return withUserIdParam(c, async (userId) => {
      const userRecord = await services.adminService.getUserById(userId);
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
      const balance = await services.adminService.getUserCreditBalance(userId);
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
        const history = await services.adminService.getUserCreditHistory(userId, limit);
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
        const purchases = await services.adminService.getUserCreditPurchases(userId, limit);
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

    const stats = await services.adminService.getBillingStats();
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

    const data = await services.adminService.getRevenueData(parsedQuery.data.timeRange);
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

    const data = await services.adminService.getAllTransactions(
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

    const data = await services.adminService.getAllPurchases(
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

    const data = await services.adminService.getTransactionData(parsedQuery.data.timeRange);
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

    const data = await services.adminService.getCreditsConsumedData(parsedQuery.data.timeRange);
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

    const data = await services.adminCreditsDashboardService.getDashboard(parsedQuery.data);
    return c.json({ success: true, data });
  });

  router.get("/billing/transaction-dashboard", async (c) => {
    c.header("Cache-Control", "private, no-store");

    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const parsedQuery = parseQuery(adminTransactionFinanceDashboardQuerySchema, {
      range: c.req.query("range"),
      startDate: c.req.query("startDate"),
      endDate: c.req.query("endDate"),
      grouping: c.req.query("grouping"),
      currency: c.req.query("currency"),
      status: c.req.query("status"),
      productKey: c.req.query("productKey"),
      search: c.req.query("search"),
      page: c.req.query("page"),
    });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid transaction finance dashboard query");
    }

    const data = adminTransactionFinanceDashboardSchema.parse(
      await services.adminTransactionFinanceDashboardService.getDashboard(parsedQuery.data),
    );
    return c.json({ success: true, data });
  });
  router.post("/billing/transaction-refunds", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    return withJsonBody(c, createTransactionRefundSchema, "Invalid transaction refund payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const actor = getAuthUser(c);
      let result: Awaited<ReturnType<typeof services.transactionService.createTransactionRefund>>;
      try {
        result = await services.transactionService.createTransactionRefund({
          orderId: body.orderId,
          reason: body.reason,
          actorUserId: actor.id,
        });
      } catch (error) {
        const message = safeErrorMessage(error, "Failed to create transaction refund");
        const status = message === "Transaction order not found" ? 404
          : message === "Only paid transaction orders can be refunded"
            || message === "Transaction order has no payment ID"
            || message === "Orders with consumed entitlements cannot be refunded"
            || message.includes("changed while the refund")
            ? 400
            : 502;
        return fail(c, message, status);
      }

      const auditFailure = await recordMutationAudit(c, {
        action: "billing.transaction_refund.create",
        outcome: "success",
        targetType: "transaction_order",
        targetId: result.order.id,
        after: {
          paymentId: result.order.paymentId,
          status: result.order.status,
          refundId: result.refund.refundId,
          refundStatus: result.refund.status,
        },
        metadata: {
          reason: body.reason ?? null,
          userId: result.order.userId,
          amount: result.refund.amount ?? null,
          currency: result.refund.currency ?? null,
        },
      });
      if (auditFailure) return auditFailure;

      return c.json({ success: true, data: { refund: result.refund, order: result.order } });
    });
  });


  router.post("/billing/credit-refunds", async (c) => {
    return withJsonBody(c, createCreditRefundSchema, "Invalid credit refund payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const actor = getAuthUser(c);
      let result: Awaited<ReturnType<typeof services.billingService.createCreditRefund>>;

      try {
        result = await services.billingService.createCreditRefund({
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
      const subscription = await services.subscriptionService.getUserSubscription(userId);
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

    const data = await services.subscriptionService.listSubscriptions(
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

    const data = await services.subscriptionService.listSubscriptionPayments(
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

    const data = await services.subscriptionService.getSubscriptionStats();
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-finance-summary", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await services.subscriptionService.getSubscriptionFinanceSummary();
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

    const data = await services.adminSubscriptionFinanceDashboardService.getDashboard(parsedQuery.data);
    return c.json({ success: true, data });
  });

  router.get("/billing/subscription-plan-distribution", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const data = await services.subscriptionService.getPlanDistribution();
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

    const data = await services.subscriptionService.listSubscriptionEvents(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.post("/billing/subscription-refunds", async (c) => {
    return withJsonBody(c, createSubscriptionRefundSchema, "Invalid subscription refund payload", async (body) => {
      const secretFailure = await requireAdminActionSecret(c, body.secret);
      if (secretFailure) return secretFailure;

      const refundBody = omitAdminSecret(body);
      const actor = getAuthUser(c);
      let result: Awaited<ReturnType<typeof services.subscriptionService.createSubscriptionRefund>>;

      try {
        result = await services.subscriptionService.createSubscriptionRefund({
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

    const result = await services.billingReconciliationService.reconcileProviderBillingStateSafely();
    return c.json({ success: true, data: services.billingReconciliationService.serializeResult(result) });
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

    const result = await services.discountsService.getDiscounts(
      parsedQuery.data.limit,
      parsedQuery.data.offset,
      parsedQuery.data.search,
      parsedQuery.data.status,
    );
    return c.json({ success: true, data: result });
  });

  router.get("/discounts/:discountId", async (c) => {
    return withDiscountIdParam(c, async (discountId) => {
      const result = await services.discountsService.getDiscountById(discountId);
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
      const code = await services.discountsService.generateDiscountCode(parsedBody.data.overridePrefix);
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

    const result = await services.discountsService.validateDiscountCode(parsedBody.data.code, parsedBody.data.excludeId);
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
    let result: Awaited<ReturnType<typeof services.discountsService.createDiscount>>;
    try {
      result = await services.discountsService.createDiscount({
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
        let result: Awaited<ReturnType<typeof services.discountsService.updateDiscount>>;
        try {
          result = await services.discountsService.updateDiscount({
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

      let result: Awaited<ReturnType<typeof services.discountsService.deleteDiscount>>;
      try {
        result = await services.discountsService.deleteDiscount(discountId);
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

    const result = await services.vouchersService.getVouchers(
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

    const users = await services.vouchersService.searchUsers(parsedQuery.data.query, parsedQuery.data.limit);
    return c.json({ success: true, data: users });
  });

  router.get("/vouchers/:voucherId", async (c) => {
    return withVoucherIdParam(c, async (voucherId) => {
      const result = await services.vouchersService.getVoucherById(voucherId);
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

    let result: Awaited<ReturnType<typeof services.vouchersService.createVoucher>>;
    try {
      result = await services.vouchersService.createVoucher(voucherBody);
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
        let result: Awaited<ReturnType<typeof services.vouchersService.updateVoucher>>;
        try {
          result = await services.vouchersService.updateVoucher({
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


  router.get("/notifications", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const data = await services.notificationsService.getAllNotifications(parsedQuery.data.limit);
    return c.json({ success: true, data });
  });

  router.get("/notifications/sends", async (c) => {
    const parsedQuery = parseQuery(notificationsListQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notification sends query");
    }

    const entries = await services.auditService.listAuditEntries({ actionPrefix: "notification.", limit: parsedQuery.data.limit });
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

    const users = await services.adminService.searchUsers(parsedQuery.data.query, parsedQuery.data.limit);
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

    const result = await services.notificationsService.sendNotificationToAllUsers({
      ...notificationBody,
    }) as NotificationSendResultWithBatch;
    const publicResult = publicNotificationSendResult(result);

    await services.auditService.recordAuditEntry({
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

    const result = await services.notificationsService.sendNotificationToUsers({
      ...notificationBody,
    }) as NotificationSendResultWithBatch;
    const publicResult = publicNotificationSendResult(result);

    await services.auditService.recordAuditEntry({
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
