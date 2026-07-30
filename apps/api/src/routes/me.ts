import { Hono } from "hono";
import type { Context } from "hono";

import {
  createApiKeySchema,
  consumeCreditsRequestSchema,
  revokeApiKeyParamSchema,
  invoiceRequestSchema,
  notificationIdParamSchema,
  optionalLimitQuerySchema,
  redeemVoucherSchema,
} from "@platform/contracts/wire";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { applicationConfig } from "../config/application";
import { env } from "../env";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";
import { badRequest, fail, notFound, ok, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { isCreditBillingMode, isSubscriptionBillingMode } from "../lib/billing-mode";
import { logger } from "../observability/logger";

function getAuthUser(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    throw new Error("Authenticated route missing auth user");
  }

  return authUser;
}

function billingModeErrorResponse(c: Context<AppEnv>, error: unknown) {
    const billingModeError = getBillingModeDisabledErrorMessage(error);
    if (billingModeError) {
      return badRequest(c, billingModeError);
    }

  throw error;
}

async function getLatestProviderCustomerId(userId: string) {
  const [subscriptionCustomerId, creditCustomerId] = await Promise.all([
    bootstrap.subscriptionService.getLatestProviderCustomerId(userId),
    bootstrap.billingService.getLatestProviderCustomerId(userId),
  ]);

  return subscriptionCustomerId ?? creditCustomerId ?? null;
}

function createPortalReturnUrl() {
  return new URL("/billing", env.APP_URL).toString();
}

export function createMeRouter() {
  const router = new Hono<AppEnv>();
  router.use("/*", bootstrap.authModule.requireAuth);

  router.get("/session", (c) => {
    return ok(c, getAuthUser(c));
  });

  router.get("/application-config", (c) => {
    return ok(c, {
      billing: {
        enabled: applicationConfig.features.billing,
        mode: applicationConfig.billing.mode,
        creditSurfacesEnabled: applicationConfig.features.billing && isCreditBillingMode(),
        subscriptionSurfacesEnabled: applicationConfig.features.billing && isSubscriptionBillingMode(),
      },
      features: {
        vouchers: applicationConfig.features.vouchers,
        discounts: applicationConfig.features.discounts,
        notifications: applicationConfig.features.notifications,
      },
    });
  });

  router.post("/customer-portal", async (c) => {
    if (!applicationConfig.features.billing) {
      return badRequest(c, "Billing is disabled");
    }

    const authUser = getAuthUser(c);
    const providerCustomerId = await getLatestProviderCustomerId(authUser.id);
    if (!providerCustomerId) {
      return notFound(c, "No billing customer found");
    }

    const paymentProvider = bootstrap.paymentProviders.activeProvider;
    if (!paymentProvider.createCustomerPortal) {
      return fail(c, "Customer portal is not configured", 503);
    }

    try {
      const session = await paymentProvider.createCustomerPortal({
        customerId: providerCustomerId,
        returnUrl: createPortalReturnUrl(),
      });

      return c.json({ success: true, data: { portalUrl: session.portalUrl } });
    } catch (error) {
      logger.error(
        {
          requestId: c.get("requestId"),
          userId: authUser.id,
          error,
        },
        "customer_portal.create.failed",
      );
      return fail(c, "Failed to create customer portal session", 502);
    }
  });

  router.get("/data-exports", async (c) => {
    const authUser = getAuthUser(c);
    const exports = await bootstrap.privacyService.listExports(authUser.id);
    return c.json({ success: true, data: exports });
  });

  router.post("/data-exports", async (c) => {
    const authUser = getAuthUser(c);
    const result = await bootstrap.privacyService.createExport(authUser.id);
    if (!result.ok) {
      return badRequest(c, result.error ?? "Failed to create data export");
    }

    return c.json({ success: true, data: result.data }, 201);
  });

  router.delete("/data-exports/:exportId", async (c) => {
    const authUser = getAuthUser(c);
    const exportId = c.req.param("exportId");
    const result = await bootstrap.privacyService.cancelExport(authUser.id, exportId);
    if (!result.ok) {
      return notFound(c, result.error);
    }

    return c.json({ success: true, data: result.data });
  });

  router.get("/api-keys", async (c) => {
    const authUser = getAuthUser(c);
    const keys = await bootstrap.apiKeysService.list(authUser.id);
    return ok(c, keys);
  });

  router.post("/api-keys", async (c) => {
    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createApiKeySchema, body);
    if (!parsedBody.success) return validationError(c, "Invalid API key payload");

    const result = await bootstrap.apiKeysService.create({
      userId: authUser.id,
      name: parsedBody.data.name,
      scopes: parsedBody.data.scopes,
      expiresAt: parsedBody.data.expiresAt ? new Date(parsedBody.data.expiresAt) : null,
    });
    return c.json({ success: true, data: result }, 201);
  });

  router.delete("/api-keys/:keyId", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(revokeApiKeyParamSchema, { keyId: c.req.param("keyId") });
    if (!parsedParams.success) return validationError(c, "Invalid API key id");

    const key = await bootstrap.apiKeysService.revoke(authUser.id, parsedParams.data.keyId);
    if (!key) return notFound(c, "API key not found");
    return ok(c, key);
  });

  router.get("/data-exports/:exportId/download", async (c) => {
    const authUser = getAuthUser(c);
    const exportId = c.req.param("exportId");
    const token = c.req.query("token") ?? "";

    const result = await bootstrap.privacyService.downloadExport(authUser.id, exportId, token);
    if (!result.ok) {
      const status = result.error === "EXPORT_EXPIRED" ? 410 : result.error === "EXPORT_NOT_READY" ? 409 : 404;
      return fail(c, result.error, status);
    }

    return new Response(result.contents, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${result.fileName}"`,
      },
    });
  });

  router.get("/credits/balance", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const balance = await bootstrap.billingService.getCreditBalance(authUser.id);
    return c.json({ success: true, data: balance });
  });

  router.get("/credits/history", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid history query");
    }

    const history = await bootstrap.billingService.getCreditHistory(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: history });
  });

  router.get("/credits/purchases", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid purchases query");
    }

    const purchases = await bootstrap.billingService.getCreditPurchases(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: purchases });
  });

  router.post("/credits/consume", async (c) => {
    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(consumeCreditsRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid credit usage payload");
    }

    try {
      const result = await bootstrap.billingService.consumeCredits(authUser.id, parsedBody.data);
      return c.json({ success: true, data: result });
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : "Failed to consume credits");
    }
  });

  router.post("/credits/invoice", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(invoiceRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid invoice payload");
    }

    try {
      const invoice = await bootstrap.billingService.downloadInvoice(authUser.id, parsedBody.data.paymentId);
      return c.json(invoice);
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : "Invoice not found");
    }
  });

  router.post("/vouchers/redeem", async (c) => {
    try {
      ensureCreditBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(redeemVoucherSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid voucher payload");
    }

    const result = await bootstrap.vouchersService.redeemVoucher(authUser.id, parsedBody.data.code);
    if (!result.success) {
      return badRequest(c, result.error ?? "Voucher redemption failed");
    }

    return c.json(result);
  });

  router.get("/subscription", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const subscription = await bootstrap.subscriptionService.getUserSubscription(authUser.id);
    return c.json({ success: true, data: subscription ?? null });
  });

  router.get("/subscription/payments", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid subscription payments query");
    }

    const payments = await bootstrap.subscriptionService.listUserSubscriptionPayments(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: payments });
  });

  router.post("/subscription/invoice", async (c) => {
    try {
      ensureSubscriptionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(invoiceRequestSchema, body);

    if (!parsedBody.success) {
      return validationError(c, "Invalid invoice payload");
    }

    try {
      const invoice = await bootstrap.subscriptionService.downloadSubscriptionInvoice(authUser.id, parsedBody.data.paymentId);
      return c.json(invoice);
    } catch (error) {
      return notFound(c, "Invoice not found");
    }
  });

  router.get("/notifications", async (c) => {
    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const list = await bootstrap.notificationsService.listForUser(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: list });
  });

  router.get("/notifications/unread-count", async (c) => {
    const authUser = getAuthUser(c);
    const count = await bootstrap.notificationsService.unreadCount(authUser.id);
    return c.json({ success: true, data: { count } });
  });

  router.get("/notifications/active-banner", async (c) => {
    const authUser = getAuthUser(c);
    const banner = await bootstrap.notificationsService.getActiveBannerForUser(authUser.id);
    return c.json({ success: true, data: banner });
  });

  router.post("/notifications/:notificationId/read", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

    if (!parsedParams.success) {
      return validationError(c, "Invalid notification id");
    }

    await bootstrap.notificationsService.markAsRead(authUser.id, parsedParams.data.notificationId);
    return c.json({ success: true, data: { marked: true } });
  });

  router.delete("/notifications/:notificationId", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

    if (!parsedParams.success) {
      return validationError(c, "Invalid notification id");
    }

    await bootstrap.notificationsService.deleteNotification(authUser.id, parsedParams.data.notificationId);
    return c.json({ success: true, data: { deleted: true } });
  });

  router.post("/notifications/read-all", async (c) => {
    const authUser = getAuthUser(c);
    await bootstrap.notificationsService.markAllAsRead(authUser.id);
    return c.json({ success: true, data: { marked: true } });
  });

  return router;
}
