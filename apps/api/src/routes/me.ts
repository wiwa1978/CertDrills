import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";

import {
  capabilityKeyParamSchema,
  consumeCapabilityRequestSchema,
  createApiKeySchema,
  dataExportIdParamSchema,
  revokeApiKeyParamSchema,
  invoiceRequestSchema,
  notificationIdParamSchema,
  optionalLimitQuerySchema,
  redeemVoucherSchema,
  transactionBasketItemRequestSchema,
  transactionEntitlementConsumeParamsSchema,
  transactionOrderParamsSchema,
  transactionProductKeyParamsSchema,
} from "@platform/contracts/wire";
import { user } from "@platform/platform-db";

import type { AppEnv } from "../context";
import type { PlatformServices } from "../bootstrap";
import { applicationConfig } from "../config/application";
import { env } from "../env";
import { ensureCreditBillingEnabled, ensureSubscriptionBillingEnabled, ensureTransactionBillingEnabled, getBillingModeDisabledErrorMessage } from "../lib/feature-guards";
import { badRequest, fail, notFound, ok, parseJsonBody, parseParams, parseQuery, validationError } from "../lib/http";
import { isCreditBillingMode, isSubscriptionBillingMode, isTransactionBillingMode } from "../lib/billing-mode";
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

async function getLatestProviderCustomerId(services: PlatformServices, userId: string) {
  const [subscriptionCustomerId, creditCustomerId] = await Promise.all([
    services.subscriptionService.getLatestProviderCustomerId(userId),
    services.billingService.getLatestProviderCustomerId(userId),
  ]);

  return subscriptionCustomerId ?? creditCustomerId ?? null;
}

function createPortalReturnUrl() {
  return new URL("/billing", env.APP_URL).toString();
}

export function createMeRouter(services: PlatformServices, options: {
  requireAuth?: MiddlewareHandler<AppEnv> | false;
  resolveCapabilities?: (userId: string) => Promise<readonly string[]>;
} = {}) {
  const router = new Hono<AppEnv>();
  if (options.requireAuth !== false) {
    router.use("/*", options.requireAuth ?? services.authModule.requireAuth);
  }

  router.get("/session", (c) => {
    return ok(c, getAuthUser(c));
  });

  router.get("/application-config", (c) => {
    return getApplicationConfigResponse(c);
  });

  async function getApplicationConfigResponse(c: Context<AppEnv>) {
    const runtimeSettings = await services.applicationSettingsService.getRuntimeSettingsPayload();
    const capabilities = options.resolveCapabilities
      ? await options.resolveCapabilities(getAuthUser(c).id)
      : [];

    return ok(c, {
      billing: {
        enabled: applicationConfig.features.billing,
        mode: applicationConfig.billing.mode,
        creditSurfacesEnabled: applicationConfig.features.billing && isCreditBillingMode(),
        subscriptionSurfacesEnabled: applicationConfig.features.billing && isSubscriptionBillingMode(),
        transactionSurfacesEnabled: applicationConfig.features.billing && isTransactionBillingMode(),
      },
      features: {
        vouchers: applicationConfig.features.vouchers,
        discounts: applicationConfig.features.discounts,
        notifications: applicationConfig.features.notifications,
      },
      ui: runtimeSettings.effective,
      capabilities,
    });
  }

  router.get("/profile-address", async (c) => {
    const authUser = getAuthUser(c);
    const [profile] = await services.db
      .select({
        street: user.street,
        number: user.number,
        zipcode: user.zipcode,
        town: user.town,
        countryId: user.countryId,
      })
      .from(user)
      .where(eq(user.id, authUser.id))
      .limit(1);

    return ok(c, profile ?? null);
  });

  router.post("/customer-portal", async (c) => {
    if (!applicationConfig.features.billing) {
      return badRequest(c, "Billing is disabled");
    }

    const authUser = getAuthUser(c);
    const providerCustomerId = await getLatestProviderCustomerId(services, authUser.id);
    if (!providerCustomerId) {
      return notFound(c, "No billing customer found");
    }

    const paymentProvider = services.paymentProviders.activeProvider;
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
    const exports = await services.privacyService.listExports(authUser.id);
    return c.json({ success: true, data: exports });
  });

  router.post("/data-exports", async (c) => {
    const authUser = getAuthUser(c);
    const result = await services.privacyService.createExport(authUser.id);
    if (!result.ok) {
      return badRequest(c, result.error ?? "Failed to create data export");
    }

    return c.json({ success: true, data: result.data }, 202);
  });

  router.delete("/data-exports/:exportId", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(dataExportIdParamSchema, { exportId: c.req.param("exportId") });
    if (!parsedParams.success) return validationError(c, "Invalid data export id");

    const result = await services.privacyService.cancelExport(authUser.id, parsedParams.data.exportId);
    if (!result.ok) {
      return notFound(c, result.error);
    }

    return c.json({ success: true, data: result.data });
  });

  router.get("/api-keys", async (c) => {
    const authUser = getAuthUser(c);
    const keys = await services.apiKeysService.list(authUser.id);
    return ok(c, keys);
  });

  router.post("/api-keys", async (c) => {
    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createApiKeySchema, body);
    if (!parsedBody.success) return validationError(c, "Invalid API key payload");

    const result = await services.apiKeysService.create({
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

    const key = await services.apiKeysService.revoke(authUser.id, parsedParams.data.keyId);
    if (!key) return notFound(c, "API key not found");
    return ok(c, key);
  });

  router.get("/data-exports/:exportId/download", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(dataExportIdParamSchema, { exportId: c.req.param("exportId") });
    if (!parsedParams.success) return validationError(c, "Invalid data export id");

    const token = c.req.header("x-data-export-token") ?? "";
    const result = await services.privacyService.downloadExport(authUser.id, parsedParams.data.exportId, token);
    if (!result.ok) {
      return fail(c, result.error, 404);
    }

    return new Response(result.contents, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${result.fileName}"`,
        "cache-control": "no-store",
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
    const balance = await services.billingService.getCreditBalance(authUser.id);
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

    const history = await services.billingService.getCreditHistory(authUser.id, parsedQuery.data.limit);
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

    const purchases = await services.billingService.getCreditPurchases(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: purchases });
  });

  router.post("/capabilities/:capabilityKey/consume", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(capabilityKeyParamSchema, { capabilityKey: c.req.param("capabilityKey") });
    if (!parsedParams.success) return validationError(c, "Invalid capability key");

    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(consumeCapabilityRequestSchema, body);
    if (!parsedBody.success) return validationError(c, "Invalid capability consumption payload");

    try {
      const result = await services.capabilityService.consume(
        authUser.id,
        parsedParams.data.capabilityKey,
        parsedBody.data,
      );
      return c.json({ success: true, data: result });
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : "Failed to consume capability");
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
      const invoice = await services.billingService.downloadInvoice(authUser.id, parsedBody.data.paymentId);
      return c.json(invoice);
    } catch {
      return notFound(c, "Invoice not found");
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

    const result = await services.vouchersService.redeemVoucher(authUser.id, parsedBody.data.code);
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
    const subscription = await services.subscriptionService.getUserSubscription(authUser.id);
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

    const payments = await services.subscriptionService.listUserSubscriptionPayments(authUser.id, parsedQuery.data.limit);
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
      const invoice = await services.subscriptionService.downloadSubscriptionInvoice(authUser.id, parsedBody.data.paymentId);
      return c.json(invoice);
    } catch (error) {
      return notFound(c, "Invoice not found");
    }
  });

  router.get("/transaction-basket", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    return ok(c, await services.transactionService.getOrCreateDraftBasket(authUser.id));
  });

  router.put("/transaction-basket/items", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(transactionBasketItemRequestSchema, body);
    if (!parsedBody.success) return validationError(c, "Invalid transaction basket item payload");

    try {
      return ok(c, await services.transactionService.upsertBasketItem(authUser.id, parsedBody.data));
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : "Failed to update transaction basket");
    }
  });

  router.delete("/transaction-basket/items/:productKey", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const parsedParams = parseParams(transactionProductKeyParamsSchema, { productKey: c.req.param("productKey") });
    if (!parsedParams.success) return validationError(c, "Invalid transaction product key");
    return ok(c, await services.transactionService.removeBasketItem(authUser.id, parsedParams.data.productKey));
  });

  router.delete("/transaction-basket", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    return ok(c, await services.transactionService.clearBasket(authUser.id));
  });

  router.post("/transaction-basket/checkout", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    try {
      return ok(c, await services.transactionService.checkoutBasket({ userId: authUser.id, customerEmail: authUser.email ?? null }));
    } catch (error) {
      logger.error({
        requestId: c.get("requestId"),
        userId: authUser.id,
        error,
      }, "transaction_checkout.create.failed");
      return badRequest(c, "Failed to create transaction checkout");
    }
  });

  router.get("/transaction-orders", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    return ok(c, await services.transactionService.listOrders(authUser.id));
  });

  router.get("/transaction-orders/:orderId", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const parsedParams = parseParams(transactionOrderParamsSchema, { orderId: c.req.param("orderId") });
    if (!parsedParams.success) return validationError(c, "Invalid transaction order id");

    const order = await services.transactionService.getOrder(authUser.id, parsedParams.data.orderId);
    if (!order) return notFound(c, "Transaction order not found");
    return ok(c, order);
  });

  router.get("/transaction-entitlements", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    return ok(c, await services.transactionService.listEntitlements(authUser.id));
  });

  router.post("/transaction-entitlements/:entitlementId/consume", async (c) => {
    try {
      ensureTransactionBillingEnabled();
    } catch (error) {
      return billingModeErrorResponse(c, error);
    }

    const authUser = getAuthUser(c);
    const parsedParams = parseParams(transactionEntitlementConsumeParamsSchema, { entitlementId: c.req.param("entitlementId") });
    if (!parsedParams.success) return validationError(c, "Invalid transaction entitlement id");

    try {
      return ok(c, await services.transactionService.consumeEntitlement(authUser.id, parsedParams.data.entitlementId));
    } catch (error) {
      return badRequest(c, error instanceof Error ? error.message : "Failed to consume transaction entitlement");
    }
  });

  router.get("/notifications", async (c) => {
    const authUser = getAuthUser(c);
    const parsedQuery = parseQuery(optionalLimitQuerySchema, { limit: c.req.query("limit") });

    if (!parsedQuery.success) {
      return validationError(c, "Invalid notifications query");
    }

    const list = await services.notificationsService.listForUser(authUser.id, parsedQuery.data.limit);
    return c.json({ success: true, data: list });
  });

  router.get("/notifications/unread-count", async (c) => {
    const authUser = getAuthUser(c);
    const count = await services.notificationsService.unreadCount(authUser.id);
    return c.json({ success: true, data: { count } });
  });

  router.get("/notifications/active-banner", async (c) => {
    const authUser = getAuthUser(c);
    const banner = await services.notificationsService.getActiveBannerForUser(authUser.id);
    return c.json({ success: true, data: banner });
  });

  router.post("/notifications/:notificationId/read", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

    if (!parsedParams.success) {
      return validationError(c, "Invalid notification id");
    }

    await services.notificationsService.markAsRead(authUser.id, parsedParams.data.notificationId);
    return c.json({ success: true, data: { marked: true } });
  });

  router.delete("/notifications/:notificationId", async (c) => {
    const authUser = getAuthUser(c);
    const parsedParams = parseParams(notificationIdParamSchema, { notificationId: c.req.param("notificationId") });

    if (!parsedParams.success) {
      return validationError(c, "Invalid notification id");
    }

    await services.notificationsService.deleteNotification(authUser.id, parsedParams.data.notificationId);
    return c.json({ success: true, data: { deleted: true } });
  });

  router.post("/notifications/read-all", async (c) => {
    const authUser = getAuthUser(c);
    await services.notificationsService.markAllAsRead(authUser.id);
    return c.json({ success: true, data: { marked: true } });
  });

  return router;
}
